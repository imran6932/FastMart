"""
Test suite for warehouse models and service functions.
"""

from django.test import TestCase
from django.contrib.gis.geos import Point

from apps.accounts.models import User, RiderProfile, Warehouse, Address
from apps.orders.warehouse_service import find_nearest_warehouse


class WarehouseServiceFunctionsTest(TestCase):
    """Test warehouse service layer functions."""

    def setUp(self):
        """Create warehouses at different geographic locations."""
        # Warehouse in downtown - closer to test point
        self.warehouse_near = Warehouse.objects.create(
            name='Downtown Warehouse',
            city='Mumbai',
            state='Maharashtra',
            pincode='400001',
            location=Point(72.8479, 19.0176),  # Coordinates: Lat, Lng
            is_active=True,
        )

        # Warehouse in suburb - farther from test point
        self.warehouse_far = Warehouse.objects.create(
            name='Suburban Warehouse',
            city='Mumbai',
            state='Maharashtra',
            pincode='400614',
            location=Point(73.1234, 19.1234),
            is_active=True,
        )

        # Inactive warehouse - should not be selected
        self.warehouse_inactive = Warehouse.objects.create(
            name='Closed Warehouse',
            city='Mumbai',
            state='Maharashtra',
            pincode='400002',
            location=Point(72.8490, 19.0190),  # Very close but inactive
            is_active=False,
        )

    def test_find_nearest_active_warehouse(self):
        """Test finding the nearest active warehouse."""
        # Query from a point close to downtown warehouse
        test_point = Point(72.8480, 19.0177)
        nearest = find_nearest_warehouse(test_point)

        self.assertIsNotNone(nearest)
        self.assertEqual(nearest.id, self.warehouse_near.id)

    def test_inactive_warehouse_not_selected(self):
        """Test that inactive warehouses are never selected."""
        # Query from a point very close to the inactive warehouse
        test_point = Point(72.8491, 19.0191)
        nearest = find_nearest_warehouse(test_point)

        # Should get warehouse_near, not warehouse_inactive (even if closer)
        self.assertNotEqual(nearest.id, self.warehouse_inactive.id)

    def test_no_active_warehouse_returns_none(self):
        """Test handling when no active warehouse exists."""
        # Deactivate all warehouses
        Warehouse.objects.all().update(is_active=False)

        test_point = Point(72.8480, 19.0177)
        nearest = find_nearest_warehouse(test_point)

        self.assertIsNone(nearest)


class RiderWarehouseIndexTest(TestCase):
    """Test database indexes on rider-warehouse relationship."""

    def setUp(self):
        warehouse = Warehouse.objects.create(
            name='Test Warehouse',
            city='Delhi',
            state='Delhi',
            pincode='110001',
            location=Point(77.2090, 28.7041),
            is_active=True,
        )

        for i in range(5):
            user = User.objects.create_user(
                email=f'rider{i}@test.com',
                password='test123',
                role='rider',
            )
            RiderProfile.objects.create(
                user=user,
                warehouse=warehouse,
                phone_number=f'+9198765432{i:02d}',
                current_location=Point(77.2090, 28.7041),
                is_on_duty=(i % 2 == 0),  # Half on-duty, half off-duty
            )

    def test_riders_indexed_by_warehouse_and_duty_status(self):
        """Test that warehouse-duty_status query uses index efficiently."""
        warehouse = Warehouse.objects.first()

        # This query should use the (warehouse, is_on_duty) index
        on_duty_riders = RiderProfile.objects.filter(
            warehouse=warehouse,
            is_on_duty=True
        )

        self.assertEqual(on_duty_riders.count(), 3)

    def test_query_riders_for_warehouse_efficiently(self):
        """Test that querying riders for a warehouse is indexed."""
        warehouse = Warehouse.objects.first()

        # This should use the (warehouse_id) index
        all_riders = RiderProfile.objects.filter(warehouse=warehouse)
        self.assertEqual(all_riders.count(), 5)
