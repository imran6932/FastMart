"""
Orders models: CartItem, DeliveryBatch, Order, OrderItem.

Key design decisions:

DeliveryBatch vs direct rider FK on Order:
  Orders don't have a direct FK to a rider. Instead, multiple Orders are
  grouped into a DeliveryBatch, and the batch has one FK to RiderProfile.
  This enables batched delivery (one rider picks up up to MAX_BATCH_SIZE
  orders in one trip), which is how Blinkit/Zepto actually operate.
  It also simplifies assignment logic: find nearest available rider →
  append to their open batch (if under cap) or create a new batch.

Order.total:
  Stored (denormalised) rather than computed on the fly. Computed once at
  order creation from OrderItem.price_at_order values. Never re-derived
  from current Product.price, because prices can change post-order.

Order status lifecycle:
  placed → payment_pending → confirmed → assigned → out_for_delivery → delivered
  Also: cancelled, payment_failed.
  Each transition triggers a Channels broadcast (in-app) + push notification (OS).

DeliveryBatchWaitWindow:
  Tracks the waiting period for each order in a batch. When an order is assigned
  to a batch, a wait window is started. If no new order arrives within the window,
  the batch proceeds immediately. The wait times decrease with each order:
  - 1st order: wait 4 minutes for order 2
  - 2nd order: wait 3 minutes for order 3
  - 3rd order: wait 2 minutes for order 4
  - etc (configured via BATCH_DELIVERY_CONFIG in settings)
"""

from django.conf import settings
from django.db import models
from django.utils import timezone


class DeliveryBatchWaitWindow(models.Model):
    """
    Tracks the waiting period for a batch to receive the next order.

    When an order is added to a batch, a wait window is created/updated.
    A Celery task monitors these windows and auto-starts delivery when:
    1. The window expires (timeout reached)
    2. The batch reaches MAX_BATCH_SIZE
    3. The rider manually starts delivery

    This prevents batches from waiting indefinitely and ensures delivery SLA.
    """

    batch = models.OneToOneField(
        'DeliveryBatch',
        on_delete=models.CASCADE,
        related_name='wait_window',
        primary_key=True,
    )
    # Order count at the time this window was created
    order_count_at_assignment = models.PositiveSmallIntegerField(default=1)
    # When the window was started (batch got its Nth order)
    started_at = models.DateTimeField(auto_now_add=True)
    # When this window expires (auto-start delivery after this time)
    expires_at = models.DateTimeField()
    # Maximum wait time in seconds for this window (based on order count)
    wait_duration_seconds = models.PositiveIntegerField()
    # Whether this window has already been processed/expired
    is_expired = models.BooleanField(default=False)
    # Timestamp when window actually expired
    expired_at = models.DateTimeField(null=True, blank=True)

    def __str__(self):
        return (
            f'WaitWindow for Batch #{self.batch_id} '
            f'(Order #{self.order_count_at_assignment}, '
            f'expires {self.expires_at})'
        )

    def is_active(self):
        """Check if this wait window is still active (not expired)."""
        if self.is_expired:
            return False
        return timezone.now() < self.expires_at

    def mark_expired(self):
        """Mark this window as expired and record timestamp."""
        self.is_expired = True
        self.expired_at = timezone.now()
        self.save()

    class Meta:
        verbose_name = 'Delivery Batch Wait Window'
        verbose_name_plural = 'Delivery Batch Wait Windows'
        indexes = [
            # Used by Celery task to find expired windows
            models.Index(fields=['is_expired', 'expires_at']),
        ]


class CartItem(models.Model):
    """
    Items in the user's active cart.

    Kept simple — no separate Cart model. The cart is just all CartItems
    belonging to a user. At checkout time they are converted to OrderItems.
    """

    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name='cart_items',
    )
    product = models.ForeignKey(
        'products.Product',
        on_delete=models.CASCADE,
        related_name='cart_items',
    )
    quantity = models.PositiveSmallIntegerField(default=1)
    added_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        # A user can only have one CartItem per product — duplicates merge quantity.
        unique_together = ('user', 'product')
        verbose_name = 'Cart Item'
        verbose_name_plural = 'Cart Items'

    def __str__(self):
        return f'{self.quantity}x {self.product.name} for {self.user.email}'


class DeliveryBatch(models.Model):
    """
    A group of orders assigned to a single rider for one delivery trip.

    Why batch instead of one-order-per-rider:
    Batching lets a rider pick up multiple orders from the same dark store
    in a single trip, which is more efficient and mirrors real Blinkit behaviour.
    The cap (MAX_BATCH_SIZE, default 4) prevents a batch from becoming too large
    to deliver quickly — freshness guarantee for the customer.

    Assignment flow (implemented in apps/orders/services.py):
    1. New order placed and confirmed.
    2. Find on-duty riders within RIDER_SEARCH_RADIUS_METRES via PostGIS query.
    3. Among those, find the nearest rider whose current open batch has < MAX_BATCH_SIZE orders.
    4. If found: add order to that batch. If not: create a new batch for the nearest rider.
    """

    class Status(models.TextChoices):
        PENDING = 'pending', 'Pending'          # batch created, rider not yet moving
        IN_PROGRESS = 'in_progress', 'In Progress'  # rider is out delivering
        COMPLETED = 'completed', 'Completed'    # all orders in batch delivered
        CANCELLED = 'cancelled', 'Cancelled'

    rider = models.ForeignKey(
        'accounts.RiderProfile',
        on_delete=models.PROTECT,
        related_name='delivery_batches',
    )
    status = models.CharField(
        max_length=20,
        choices=Status.choices,
        default=Status.PENDING,
    )
    assigned_at = models.DateTimeField(auto_now_add=True)
    completed_at = models.DateTimeField(null=True, blank=True)

    def __str__(self):
        return f'Batch #{self.pk} — {self.rider} ({self.status})'

    def get_status_history(self):
        """
        Returns all status transitions for this batch, ordered by time.
        """
        return self.status_events.all()

    def get_current_status_event(self):
        """
        Returns the latest (current) status event.
        """
        return self.status_events.latest('changed_at')

    def time_in_status(self, status):
        """
        Calculate total time batch spent in a specific status.
        Returns duration in seconds.
        """
        from django.utils import timezone

        events = self.status_events.filter(to_status=status).order_by('changed_at')
        if not events.exists():
            return None

        total_duration = 0
        for event in events:
            next_event = self.status_events.filter(
                changed_at__gt=event.changed_at
            ).first()
            if next_event:
                total_duration += (next_event.changed_at - event.changed_at).total_seconds()
            elif status == self.status:  # Currently in this status
                total_duration += (timezone.now() - event.changed_at).total_seconds()

        return total_duration

    class Meta:
        verbose_name = 'Delivery Batch'
        verbose_name_plural = 'Delivery Batches'
        indexes = [
            # Used by assignment logic: find open batches for a given rider quickly.
            models.Index(fields=['rider', 'status']),
        ]


class Order(models.Model):
    """
    A customer order.

    delivery_batch is nullable — it is NULL from placement until a rider is
    assigned (status goes to 'assigned'). That's why the status field exists:
    to track where in the lifecycle the order is, independent of FK presence.

    total is stored in rupees, same as Product.price. Computed once at order
    creation and never recalculated, because prices may change over time.
    """

    class Status(models.TextChoices):
        PLACED = 'placed', 'Placed'
        PAYMENT_PENDING = 'payment_pending', 'Payment Pending'
        CONFIRMED = 'confirmed', 'Confirmed'
        ASSIGNED = 'assigned', 'Assigned'
        OUT_FOR_DELIVERY = 'out_for_delivery', 'Out for Delivery'
        DELIVERED = 'delivered', 'Delivered'
        CANCELLED = 'cancelled', 'Cancelled'
        PAYMENT_FAILED = 'payment_failed', 'Payment Failed'

    customer = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.PROTECT,
        related_name='orders',
        limit_choices_to={'role': 'customer'},
    )
    delivery_address = models.ForeignKey(
        'accounts.Address',
        on_delete=models.PROTECT,
        related_name='orders',
    )
    # Nullable until rider assignment happens post-payment confirmation.
    delivery_batch = models.ForeignKey(
        DeliveryBatch,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='orders',
    )
    status = models.CharField(
        max_length=20,
        choices=Status.choices,
        default=Status.PLACED,
    )
    # Stored in rupees. Sum of (OrderItem.price_at_order * quantity) for all items.
    total = models.PositiveIntegerField(help_text='Order total in rupees')
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    # Timestamp when stock was locked (set at order creation).
    # Celery sweeps orders where (now - stock_held_at) > STOCK_HOLD_MINUTES
    # with status still in (placed, payment_pending) and releases the stock.
    stock_held_at = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        return f'Order #{self.pk} — {self.customer.email} ({self.status})'

    def get_status_history(self):
        """
        Returns all status transitions for this order, ordered by time.
        """
        return self.status_events.all()

    def get_current_status_event(self):
        """
        Returns the latest (current) status event.
        """
        return self.status_events.latest('changed_at')

    def time_in_status(self, status):
        """
        Calculate total time order spent in a specific status.

        Useful for analytics: "How long was order in 'payment_pending'?"
        Returns duration in seconds.
        """
        from django.utils import timezone

        events = self.status_events.filter(to_status=status).order_by('changed_at')
        if not events.exists():
            return None

        total_duration = 0
        for event in events:
            next_event = self.status_events.filter(
                changed_at__gt=event.changed_at
            ).first()
            if next_event:
                total_duration += (next_event.changed_at - event.changed_at).total_seconds()
            elif status == self.status:  # Currently in this status
                total_duration += (timezone.now() - event.changed_at).total_seconds()

        return total_duration

    class Meta:
        verbose_name = 'Order'
        verbose_name_plural = 'Orders'
        ordering = ['-created_at']
        indexes = [
            models.Index(fields=['customer', 'status']),
            models.Index(fields=['status', 'stock_held_at']),  # for Celery sweep query
        ]


class OrderItem(models.Model):
    """
    A line item within an Order.

    price_at_order: the product's price (in rupees) at the moment the order was
    placed. This is the canonical price for this purchase — we never look up
    Product.price to recalculate. This matters because product prices can
    change, and a customer should always see what they actually paid.

    Interview point: "How do you handle price changes after an order is placed?"
    Answer: "We snapshot the price into price_at_order at order creation time,
    inside the same transaction that decrements stock, so the stored total is
    always consistent with the line items."
    """

    order = models.ForeignKey(
        Order,
        on_delete=models.CASCADE,
        related_name='items',
    )
    product = models.ForeignKey(
        'products.Product',
        on_delete=models.PROTECT,
        related_name='order_items',
    )
    quantity = models.PositiveSmallIntegerField()

    # Snapshot of Product.price at the time of purchase.
    # Stored in rupees, consistent with Product.price.
    price_at_order = models.PositiveIntegerField(
        help_text='Product price in rupees at time of purchase'
    )

    def get_subtotal(self):
        """Subtotal for this line item in rupees."""
        return self.price_at_order * self.quantity

    def __str__(self):
        return f'{self.quantity}x {self.product.name} @ ₹{self.price_at_order:.2f}'

    class Meta:
        verbose_name = 'Order Item'
        verbose_name_plural = 'Order Items'


class OrderStatusEvent(models.Model):
    """
    Immutable audit log of every Order status change.

    One record per status transition, never deleted or modified.
    Use this to:
    - Retrieve full order history
    - Get current status (query latest record)
    - Calculate time spent in each status
    - Audit who changed status and why
    """

    order = models.ForeignKey(
        Order,
        on_delete=models.CASCADE,
        related_name='status_events',
    )
    from_status = models.CharField(
        max_length=20,
        choices=Order.Status.choices,
        null=True,
        blank=True,  # NULL for first event
    )
    to_status = models.CharField(
        max_length=20,
        choices=Order.Status.choices,
    )
    changed_by_user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,  # NULL for system-triggered changes
        related_name='order_status_changes',
    )
    reason = models.TextField(
        blank=True,  # e.g., "Payment confirmed", "Stock timeout", "User cancelled"
    )
    changed_at = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        return f'Order #{self.order_id}: {self.from_status} → {self.to_status}'

    class Meta:
        verbose_name = 'Order Status Event'
        verbose_name_plural = 'Order Status Events'
        ordering = ['changed_at']
        indexes = [
            models.Index(fields=['order', 'changed_at']),
            models.Index(fields=['to_status', 'changed_at']),
        ]


class DeliveryBatchStatusEvent(models.Model):
    """
    Immutable audit log of every DeliveryBatch status change.
    Same pattern as OrderStatusEvent.
    """

    batch = models.ForeignKey(
        DeliveryBatch,
        on_delete=models.CASCADE,
        related_name='status_events',
    )
    from_status = models.CharField(
        max_length=20,
        choices=DeliveryBatch.Status.choices,
        null=True,
        blank=True,
    )
    to_status = models.CharField(
        max_length=20,
        choices=DeliveryBatch.Status.choices,
    )
    changed_by_user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='batch_status_changes',
    )
    reason = models.TextField(blank=True)
    changed_at = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        return f'Batch #{self.batch_id}: {self.from_status} → {self.to_status}'

    class Meta:
        verbose_name = 'Batch Status Event'
        verbose_name_plural = 'Batch Status Events'
        ordering = ['changed_at']
        indexes = [
            models.Index(fields=['batch', 'changed_at']),
        ]
