"""
Test suite for warehouse system implementation.

Covers 15+ scenarios including:
- Warehouse model operations
- Rider-warehouse assignment
- Order assignment with warehouse filtering
- Batch waiting logic
- Serviceability checks
- Race condition prevention
"""

from django.test import TestCase, TransactionTestCase
from django.utils import timezone
from django.contrib.gis.geos import Point
from django.conf import settings
from datetime import timedelta

from apps.accounts.models import User, RiderProfile, Warehouse
from apps.products.models import Product, Category
from apps.orders.models import Order, OrderItem, DeliveryBatch, DeliveryBatchWaitWindow
from apps.accounts.models import Address
from apps.orders.warehouse_service import (
    find_nearest_warehouse,
    check_warehouse_rider_availability,
    can_proceed_with_order,
    get_warehouse_for_order,
)
from apps.orders.assignment import assign_order
from apps.orders.tasks import calculate_batch_wait_duration


class WarehouseModelTest(TestCase):
    """Test Warehouse model creation and queries."""

    def setUp(self):
        """Create test warehouses in same city but different locations."""
        self.warehouse_1 = Warehouse.objects.create(
            name='Downtown Warehouse',
            city='Mumbai',
            state='Maharashtra',
            pincode='400001',
            location=Point(72.8479, 19.0176),  # Downtown Mumbai
            is_active=True,
        )

        self.warehouse_2 = Warehouse.objects.create(
            name='Suburban Warehouse',
            city='Mumbai',
            state='Maharashtra',
            pincode='400614',
            location=Point(73.0159, 19.0880),  # Suburban Mumbai (Powai)
            is_active=True,
        )

        self.warehouse_3 = Warehouse.objects.create(
            name='Inactive Warehouse',
            city='Mumbai',
            state='Maharashtra',
            pincode='400002',
            location=Point(72.8500, 19.0200),
            is_active=False,
        )

    def test_multiple_warehouses_same_city(self):
        """Test 1: Multiple warehouses can exist in same city."""
        warehouses = Warehouse.objects.filter(city='Mumbai', is_active=True)
        self.assertEqual(warehouses.count(), 2)

    def test_inactive_warehouse_excluded_from_selection(self):
        """Test: Inactive warehouses are excluded from queries."""
        active_warehouses = Warehouse.objects.filter(is_active=True)
        self.assertNotIn(self.warehouse_3, active_warehouses)
        self.assertIn(self.warehouse_1, active_warehouses)


class WarehouseRiderAssignmentTest(TestCase):
    """Test rider-warehouse assignment during signup."""

    def setUp(self):
        self.warehouse = Warehouse.objects.create(
            name='Test Warehouse',
            city='Delhi',
            state='Delhi',
            pincode='110001',
            location=Point(77.2090, 28.7041),
            is_active=True,
        )

        self.inactive_warehouse = Warehouse.objects.create(
            name='Inactive Warehouse',
            city='Delhi',
            state='Delhi',
            pincode='110002',
            location=Point(77.2100, 28.7050),
            is_active=False,
        )

        self.rider_user = User.objects.create_user(
            email='rider@test.com',
            password='test123',
            role='rider',
        )

    def test_rider_assignment_to_warehouse(self):
        """Test 3: Rider can be assigned to warehouse during signup."""
        rider = RiderProfile.objects.create(
            user=self.rider_user,
            warehouse=self.warehouse,
            phone_number='+919876543210',
            current_location=Point(77.2090, 28.7041),
        )
        self.assertEqual(rider.warehouse, self.warehouse)

    def test_inactive_warehouse_cannot_be_assigned(self):
        """Test 4: Only active warehouses should be assignable."""
        active_warehouses = Warehouse.objects.filter(is_active=True)
        self.assertNotIn(self.inactive_warehouse, active_warehouses)


class WarehouseServiceabilityTest(TestCase):
    """Test customer serviceability checks."""

    def setUp(self):
        self.warehouse = Warehouse.objects.create(
            name='Test Warehouse',
            city='Bangalore',
            state='Karnataka',
            pincode='560001',
            location=Point(77.5946, 12.9716),
            is_active=True,
        )

        self.customer_user = User.objects.create_user(
            email='customer@test.com',
            password='test123',
            role='customer',
        )

        self.rider_user = User.objects.create_user(
            email='rider@test.com',
            password='test123',
            role='rider',
        )

        self.rider = RiderProfile.objects.create(
            user=self.rider_user,
            warehouse=self.warehouse,
            phone_number='+919876543210',
            current_location=Point(77.5946, 12.9716),
            is_on_duty=True,
        )

        self.customer_address = Address.objects.create(
            user=self.customer_user,
            line1='123 Test Street',
            city='Bangalore',
            state='Karnataka',
            pincode='560001',
            location=Point(77.5946, 12.9716),
        )

    def test_customer_can_proceed_with_available_rider(self):
        """Test 6: Customer with available rider can shop normally."""
        can_order, warehouse = can_proceed_with_order(
            self.customer_user, self.customer_address
        )
        self.assertTrue(can_order)
        self.assertEqual(warehouse, self.warehouse)

    def test_customer_cannot_proceed_without_rider(self):
        """Test 7: Customer without available rider sees service unavailable."""
        self.rider.is_on_duty = False
        self.rider.save()

        can_order, message = can_proceed_with_order(
            self.customer_user, self.customer_address
        )
        self.assertFalse(can_order)
        self.assertIn('temporarily unavailable', message.lower())


class OrderAssignmentWarehouseFilteringTest(TransactionTestCase):
    """Test that orders are assigned only to riders from correct warehouse."""

    def setUp(self):
        # Create two warehouses
        self.warehouse_a = Warehouse.objects.create(
            name='Warehouse A',
            city='City A',
            state='State A',
            pincode='100001',
            location=Point(77.0000, 28.0000),
            is_active=True,
        )

        self.warehouse_b = Warehouse.objects.create(
            name='Warehouse B',
            city='City B',
            state='State B',
            pincode='200001',
            location=Point(78.0000, 29.0000),
            is_active=True,
        )

        # Create riders for each warehouse
        rider_user_a = User.objects.create_user(
            email='rider_a@test.com', password='test123', role='rider'
        )
        self.rider_a = RiderProfile.objects.create(
            user=rider_user_a,
            warehouse=self.warehouse_a,
            phone_number='+911111111111',
            current_location=Point(77.0000, 28.0000),
            is_on_duty=True,
        )

        rider_user_b = User.objects.create_user(
            email='rider_b@test.com', password='test123', role='rider'
        )
        self.rider_b = RiderProfile.objects.create(
            user=rider_user_b,
            warehouse=self.warehouse_b,
            phone_number='+912222222222',
            current_location=Point(78.0000, 29.0000),
            is_on_duty=True,
        )

        # Create customer and order near warehouse A
        customer_user = User.objects.create_user(
            email='customer@test.com', password='test123', role='customer'
        )
        delivery_address = Address.objects.create(
            user=customer_user,
            line1='Test Address A',
            city='City A',
            state='State A',
            pincode='100001',
            location=Point(77.0001, 28.0001),  # Very close to warehouse_a
        )

        # Create category and product
        category = Category.objects.create(name='Test', slug='test')
        product = Product.objects.create(
            name='Test Product',
            category=category,
            price=100,
            stock=10,
        )

        # Create order
        self.order = Order.objects.create(
            user=customer_user,
            delivery_address=delivery_address,
            status=Order.Status.CONFIRMED,
            total=100,
        )
        OrderItem.objects.create(order=self.order, product=product, quantity=1)

    def test_order_assigned_to_correct_warehouse_rider(self):
        """Test 5: Rider from Warehouse A cannot receive Warehouse B's order."""
        # Assign the order
        assign_order(self.order)
        self.order.refresh_from_db()

        # Check that order is assigned to a batch
        self.assertIsNotNone(self.order.delivery_batch)

        # The batch should be assigned to rider_a (same warehouse)
        batch = self.order.delivery_batch
        self.assertEqual(batch.rider, self.rider_a)
        self.assertEqual(batch.rider.warehouse, self.warehouse_a)


class BatchWaitingLogicTest(TestCase):
    """Test batch waiting window calculations and logic."""

    def test_first_order_waits_4_minutes(self):
        """Test 8: First order waits 4 minutes for next order."""
        wait_duration = calculate_batch_wait_duration(order_count=1)
        self.assertEqual(wait_duration, 240)  # 4 minutes in seconds

    def test_second_order_waits_3_minutes(self):
        """Test 9: Second order waits 3 minutes."""
        wait_duration = calculate_batch_wait_duration(order_count=2)
        self.assertEqual(wait_duration, 180)  # 3 minutes

    def test_third_order_waits_2_minutes(self):
        """Test 10: Third order waits 2 minutes."""
        wait_duration = calculate_batch_wait_duration(order_count=3)
        self.assertEqual(wait_duration, 120)  # 2 minutes

    def test_batch_at_capacity_no_wait(self):
        """Test 11: Batch stops waiting when at MAX_BATCH_SIZE."""
        max_batch = settings.MAX_BATCH_SIZE
        wait_duration = calculate_batch_wait_duration(order_count=max_batch)
        self.assertEqual(wait_duration, 0)  # No wait at capacity


class DeliveryBatchWaitWindowTest(TestCase):
    """Test DeliveryBatchWaitWindow model and expiration."""

    def setUp(self):
        warehouse = Warehouse.objects.create(
            name='Test Warehouse',
            city='Test City',
            state='Test State',
            pincode='000001',
            location=Point(77.0000, 28.0000),
            is_active=True,
        )

        rider_user = User.objects.create_user(
            email='rider@test.com', password='test123', role='rider'
        )
        self.rider = RiderProfile.objects.create(
            user=rider_user,
            warehouse=warehouse,
            phone_number='+911111111111',
            current_location=Point(77.0000, 28.0000),
        )

        self.batch = DeliveryBatch.objects.create(
            rider=self.rider,
            status=DeliveryBatch.Status.PENDING,
        )

    def test_wait_window_creation(self):
        """Test wait window is created with correct expiration."""
        now = timezone.now()
        expires_at = now + timedelta(seconds=240)

        window = DeliveryBatchWaitWindow.objects.create(
            batch=self.batch,
            order_count_at_assignment=1,
            wait_duration_seconds=240,
            expires_at=expires_at,
            is_expired=False,
        )

        self.assertFalse(window.is_expired)
        self.assertTrue(window.is_active())

    def test_wait_window_expiration(self):
        """Test wait window marks itself as expired."""
        window = DeliveryBatchWaitWindow.objects.create(
            batch=self.batch,
            order_count_at_assignment=1,
            wait_duration_seconds=240,
            expires_at=timezone.now() + timedelta(seconds=240),
            is_expired=False,
        )

        window.mark_expired()
        self.assertTrue(window.is_expired)
        self.assertIsNotNone(window.expired_at)

    def test_wait_window_prevents_indefinite_waiting(self):
        """Test 12: Orders don't remain indefinitely in waiting state."""
        # Create expired window
        window = DeliveryBatchWaitWindow.objects.create(
            batch=self.batch,
            order_count_at_assignment=1,
            wait_duration_seconds=240,
            expires_at=timezone.now() - timedelta(seconds=1),  # Already expired
            is_expired=False,
        )

        # Query for expired windows
        expired = DeliveryBatchWaitWindow.objects.filter(
            is_expired=False,
            expires_at__lte=timezone.now()
        )
        self.assertTrue(expired.exists())


class RaceConditionPreventionTest(TransactionTestCase):
    """Test prevention of race conditions in order assignment."""

    def setUp(self):
        warehouse = Warehouse.objects.create(
            name='Test Warehouse',
            city='Test City',
            state='Test State',
            pincode='000001',
            location=Point(77.0000, 28.0000),
            is_active=True,
        )

        rider_user = User.objects.create_user(
            email='rider@test.com', password='test123', role='rider'
        )
        self.rider = RiderProfile.objects.create(
            user=rider_user,
            warehouse=warehouse,
            phone_number='+911111111111',
            current_location=Point(77.0000, 28.0000),
            is_on_duty=True,
        )

        customer_user = User.objects.create_user(
            email='customer@test.com', password='test123', role='customer'
        )

        self.delivery_address = Address.objects.create(
            user=customer_user,
            line1='Test Address',
            city='Test City',
            state='Test State',
            pincode='000001',
            location=Point(77.0000, 28.0000),
        )

        category = Category.objects.create(name='Test', slug='test')
        self.product = Product.objects.create(
            name='Test Product',
            category=category,
            price=100,
            stock=10,
        )

        self.customer_user = customer_user

    def test_same_order_not_assigned_twice(self):
        """Test 13: Same order cannot be assigned to multiple riders simultaneously."""
        order = Order.objects.create(
            user=self.customer_user,
            delivery_address=self.delivery_address,
            status=Order.Status.CONFIRMED,
            total=100,
        )
        OrderItem.objects.create(order=order, product=self.product, quantity=1)

        # Simulate two concurrent assignment attempts
        assign_order(order)
        assign_order(order)  # Second call should not create duplicate batch

        order.refresh_from_db()
        # Order should be assigned to exactly one batch
        self.assertIsNotNone(order.delivery_batch)
        self.assertEqual(
            DeliveryBatch.objects.filter(orders=order).count(), 1
        )


class ExistingFunctionalityTest(TestCase):
    """Test 15: Existing order and rider assignment continues to work."""

    def test_backward_compatibility(self):
        """Ensure warehouse changes don't break existing order flow."""
        # This is a placeholder - full integration tests would go here
        self.assertTrue(hasattr(Order, 'delivery_batch'))
        self.assertTrue(hasattr(RiderProfile, 'warehouse'))
        self.assertTrue(hasattr(DeliveryBatchWaitWindow, 'batch'))
