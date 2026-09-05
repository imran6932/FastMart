"""
Orders serializers.

CartItemSerializer   — read/write a single cart item (product + quantity).
                       Enforces min quantity = 1 and validates the product exists.
CartItemAddSerializer — used specifically for add-to-cart: accepts product_id
                       and quantity, merges with existing item if one exists.
OrderItemSerializer  — read-only line-item within an order response.
OrderSerializer      — read-only order summary (list view).
OrderDetailSerializer — read-only full order with nested items (detail view).
OrderStatusEventSerializer — read-only status history events.

Design notes:
- Cart and Order serializers are kept separate — cart is mutable, orders are
  immutable once placed.
- Full order creation (checkout flow) lives in a dedicated service function
  (apps/orders/services.py) in step 6 — it involves transactions, stock
  locking (select_for_update), Razorpay order creation, and batch assignment,
  which is too complex to put inside a serializer's create().
- price_display fields expose rupees values as rupee floats for the frontend.
- OrderSerializer uses a flat total_display; OrderDetailSerializer also includes
  nested items with their per-item subtotals.
- OrderStatusEventSerializer exposes the full audit trail of status changes.
"""

from rest_framework import serializers

from apps.accounts.serializers import AddressSerializer
from apps.products.serializers import ProductSerializer

from .models import CartItem, Order, OrderItem, OrderStatusEvent


class CartItemSerializer(serializers.ModelSerializer):
    """
    GET  /api/orders/cart/           — list current user's cart items
    POST /api/orders/cart/           — add item (or merge if already in cart)
    PATCH /api/orders/cart/{id}/     — update quantity
    DELETE /api/orders/cart/{id}/    — remove item

    `product` is nested (read) so the response includes name, price, image
    without a second request. `product_id` is the write field for add/update.
    """

    product = ProductSerializer(read_only=True)
    product_id = serializers.PrimaryKeyRelatedField(
        source='product',
        queryset=__import__('apps.products.models', fromlist=['Product']).Product.objects.all(),
        write_only=True,
    )

    # Convenience field: line subtotal = product.price * quantity (in rupees)
    subtotal = serializers.SerializerMethodField(read_only=True)
    subtotal_display = serializers.SerializerMethodField(read_only=True)

    class Meta:
        model = CartItem
        fields = [
            'id', 'product', 'product_id',
            'quantity',
            'subtotal', 'subtotal_display',
            'added_at',
        ]
        read_only_fields = ['id', 'added_at']

    def validate_quantity(self, value):
        if value < 1:
            raise serializers.ValidationError("Quantity must be at least 1.")
        return value

    def get_subtotal(self, obj) -> int:
        """Line subtotal in rupees."""
        return obj.product.price * obj.quantity

    def get_subtotal_display(self, obj) -> float:
        """Line subtotal in rupees."""
        return round(obj.product.price * obj.quantity, 2)

    def create(self, validated_data):
        user = self.context['request'].user
        product = validated_data['product']
        quantity = validated_data['quantity']

        # Merge: if the product is already in the cart, increment quantity
        # rather than creating a duplicate row (unique_together constraint).
        item, created = CartItem.objects.get_or_create(
            user=user,
            product=product,
            defaults={'quantity': quantity},
        )
        if not created:
            item.quantity += quantity
            item.save(update_fields=['quantity'])
        return item


class OrderItemSerializer(serializers.ModelSerializer):
    """Read-only line item embedded inside OrderDetailSerializer."""

    product_name = serializers.CharField(source='product.name', read_only=True)
    product_image = serializers.ImageField(source='product.image', read_only=True)
    price_at_order_display = serializers.SerializerMethodField()
    subtotal = serializers.SerializerMethodField()
    subtotal_display = serializers.SerializerMethodField()

    class Meta:
        model = OrderItem
        fields = [
            'id', 'product', 'product_name', 'product_image',
            'quantity',
            'price_at_order', 'price_at_order_display',
            'subtotal', 'subtotal_display',
        ]

    def get_price_at_order_display(self, obj) -> float:
        return round(obj.price_at_order, 2)

    def get_subtotal(self, obj) -> int:
        return obj.get_subtotal()

    def get_subtotal_display(self, obj) -> float:
        return round(obj.get_subtotal(), 2)


class OrderStatusEventSerializer(serializers.ModelSerializer):
    """
    Immutable audit log of order status changes.
    Includes who changed it, when, and why.
    """

    changed_by_email = serializers.CharField(
        source='changed_by_user.email',
        read_only=True,
        allow_null=True,
    )

    class Meta:
        model = OrderStatusEvent
        fields = [
            'id',
            'from_status',
            'to_status',
            'changed_by_email',
            'reason',
            'changed_at',
        ]
        read_only_fields = fields


class OrderSerializer(serializers.ModelSerializer):
    """
    Compact order representation for the list endpoint.
    Does not nest line items — use OrderDetailSerializer for the detail view.
    """

    total_display = serializers.SerializerMethodField()
    delivery_address_label = serializers.SerializerMethodField()
    customer = serializers.SerializerMethodField()

    class Meta:
        model = Order
        fields = [
            'id', 'status', 'customer',
            'total', 'total_display',
            'delivery_address_label',
            'created_at', 'updated_at',
        ]

    def get_total_display(self, obj) -> float:
        return round(obj.total, 2)

    def get_delivery_address_label(self, obj) -> str:
        """Short label like '12 MG Road, Mumbai' for the list view."""
        addr = obj.delivery_address
        return f"{addr.line1}, {addr.city}"

    def get_customer(self, obj) -> dict:
        customer = obj.customer
        return f'{customer.first_name} {customer.last_name}'.strip()


class OrderDetailSerializer(OrderSerializer):
    """
    Full order representation for the detail endpoint.
    Nests all line items so the customer can see exactly what was ordered.
    Includes full status history.

    Also exposes warehouse + rider info once a rider has been assigned, so
    all three frontends (customer, rider, admin) can draw a live route map
    from the warehouse to the delivery address without extra API calls:
      - warehouse: {id, name, lat, lng} — the route's starting point.
      - rider: {id, lat, lng} — the rider's last known position (a fallback
        for the very first render, before any live WebSocket ping arrives).
    Both are null until the order has a delivery_batch (status='assigned' or later).
    """

    items = OrderItemSerializer(many=True, read_only=True)
    delivery_address = AddressSerializer(read_only=True)
    status_history = OrderStatusEventSerializer(
        source='status_events',
        many=True,
        read_only=True,
    )
    warehouse = serializers.SerializerMethodField()
    rider = serializers.SerializerMethodField()
    payment_status = serializers.SerializerMethodField()

    class Meta(OrderSerializer.Meta):
        fields = OrderSerializer.Meta.fields + [
            'items', 'delivery_address', 'status_history', 'warehouse', 'rider',
            'payment_status',
        ]

    def get_warehouse(self, obj):
        rider = self._get_rider_profile(obj)
        warehouse = rider.warehouse if rider else None
        if not warehouse or not warehouse.location:
            return None
        return {
            'id': warehouse.id,
            'name': warehouse.name,
            'lat': warehouse.location.y,
            'lng': warehouse.location.x,
        }

    def get_rider(self, obj):
        rider = self._get_rider_profile(obj)
        if not rider:
            return None
        user = rider.user
        rider_name = f"{user.first_name} {user.last_name}".strip() if user else "Unknown"
        return {
            'id': rider.id,
            'name': rider_name,
            'phone': rider.user.phone if rider.user else None,
            'lat': rider.current_location.y if rider.current_location else None,
            'lng': rider.current_location.x if rider.current_location else None,
        }

    @staticmethod
    def _get_rider_profile(obj):
        if not obj.delivery_batch_id:
            return None
        return obj.delivery_batch.rider

    def get_payment_status(self, obj) -> str | None:
        """Exposes the linked Payment's status (e.g. 'refund_pending') so the
        frontend can show refund progress after a cancellation. None if no
        Payment row exists yet (shouldn't normally happen post-checkout)."""
        try:
            return obj.payment.status
        except Order.payment.RelatedObjectDoesNotExist:
            return None

