"""
Order placement and cancellation services.

place_order(user, delivery_address_id, cart_items) — the core checkout function.

Called by the checkout API view. This function:
  1. Validates the cart is non-empty and all products are still available.
  2. Locks product rows with SELECT FOR UPDATE to prevent oversell.
  3. Decrements stock for every item atomically.
  4. Creates the Order + OrderItem rows, computing total from snapshots.
  5. Creates a Razorpay order via their API (amount in rupees).
  6. Creates a Payment row (status=pending) linked to the Order.
  7. Returns the Razorpay order ID + amount back to the frontend so it can
     open the Razorpay checkout widget.

If any product has insufficient stock the transaction is rolled back — no
partial decrements, no order created.

The Order is created with status='payment_pending', NOT 'placed', because
stock is already held. The Celery beat task (apps/orders/tasks.py) sweeps
orders that stay in 'payment_pending' for > STOCK_HOLD_MINUTES and releases
stock + marks them 'cancelled'.

cancel_order(order, reason, cancelled_by) — customer-initiated cancellation.

Called from the OrderViewSet.cancel action. Restores stock, releases the
order from any delivery batch, marks it cancelled, and (if payment was
already captured) schedules a Razorpay refund via apps.payments.services.
Only allowed while the order is in CANCELLABLE_ORDER_STATUSES — once a rider
has picked the order up (out_for_delivery), it can no longer be
self-service-cancelled.

Interview talking points:
- "Why select_for_update()?"
  Without it, two concurrent requests both read stock=1, both see "enough stock",
  and both decrement — resulting in stock=-1. The row lock serialises the two
  transactions so the second one sees stock=0 and is rejected cleanly.
- "Why decrement before payment confirmation?"
  To guarantee the product is reserved while the user is on the payment screen.
  Without a hold, another customer could grab the last unit between the first
  customer starting checkout and completing payment.
- "What if payment never arrives?"
  The Celery periodic task calls release_held_stock() for orders still
  'payment_pending' after STOCK_HOLD_MINUTES, incrementing stock and marking
  the order 'cancelled'.
- "Why on_commit() for the refund call?"
  cancel_order() runs inside @transaction.atomic and holds a row lock on the
  Order. Calling Razorpay's HTTP API synchronously inside that block would
  hold the lock open for the duration of a network round-trip. on_commit()
  defers the call until after the DB transaction has committed and released
  its locks.
"""

import razorpay
from django.conf import settings
from django.db import transaction
from rest_framework.exceptions import ValidationError

from apps.payments.models import Payment
from apps.payments.services import initiate_refund
from apps.products.models import Product

from .models import CartItem, Order, OrderItem
from .status import create_order_status_event, update_order_status

# Orders can only be cancelled by the customer before the rider has picked
# them up. Once out_for_delivery, the items have physically left the
# warehouse — cancellation past that point would need a different real-world
# workflow (return/refuse-at-door), not a simple stock-restore + refund.
CANCELLABLE_ORDER_STATUSES = {
    Order.Status.PLACED,
    Order.Status.PAYMENT_PENDING,
    Order.Status.CONFIRMED,
    Order.Status.ASSIGNED,
}


def _get_razorpay_client():
    return razorpay.Client(
        auth=(settings.RAZORPAY_KEY_ID, settings.RAZORPAY_KEY_SECRET)
    )


@transaction.atomic
def cancel_order(order, reason="", cancelled_by=None):
    """
    Cancel a customer order.

    - Restores stock for every line item (the customer never received them).
    - Releases the order from its delivery batch, if a rider was already
      assigned, so it stops appearing in that rider's active batch.
    - Marks the order 'cancelled' (with audit trail via update_order_status).
    - If payment was already captured, schedules a Razorpay refund via
      transaction.on_commit — refund API calls must never happen while DB
      row locks are held. The refund isn't final until the refund.processed
      webhook confirms it (apps/payments/views.py); this call only *starts*
      the refund and moves the Payment to 'refund_pending'.
    - If payment was still 'pending' (never captured), there's nothing to
      refund — the Payment row is just marked 'failed'/void.

    Raises rest_framework.exceptions.ValidationError if the order is no
    longer in a cancellable status (e.g. already out for delivery).
    """
    # Lock the row so a concurrent cancel request or the stock-hold sweep
    # (apps/orders/tasks.py) can't race with this.
    locked_order = Order.objects.select_for_update().get(pk=order.pk)

    if locked_order.status not in CANCELLABLE_ORDER_STATUSES:
        raise ValidationError(
            f"Order cannot be cancelled once it is "
            f"'{locked_order.get_status_display()}'."
        )

    # Restore stock for every line item.
    for item in OrderItem.objects.select_related('product').filter(order=locked_order):
        item.product.stock += item.quantity
        item.product.save(update_fields=['stock'])

    # Release the order from its delivery batch (if a rider was assigned)
    # so it disappears from that rider's active batch list.
    if locked_order.delivery_batch_id:
        locked_order.delivery_batch = None
        locked_order.save(update_fields=['delivery_batch'])

    update_order_status(
        locked_order,
        Order.Status.CANCELLED,
        reason=reason or 'Cancelled by customer',
        changed_by_user=cancelled_by,
    )

    try:
        payment = locked_order.payment
    except Order.payment.RelatedObjectDoesNotExist:
        payment = None

    if payment and payment.status == Payment.Status.SUCCESS:
        # Payment was captured — refund it, but only after this transaction
        # commits (never call an external API while holding row locks).
        transaction.on_commit(
            lambda: initiate_refund(payment, reason=reason or 'Order cancelled by customer')
        )
    elif payment and payment.status == Payment.Status.PENDING:
        # No money was ever captured — nothing to refund, just void the record.
        payment.status = Payment.Status.FAILED
        payment.save(update_fields=['status', 'updated_at'])

    return locked_order


@transaction.atomic
def place_order(user, delivery_address_id):
    """
    Convert the user's current cart into an Order.

    Returns a dict with everything the frontend needs to open the Razorpay
    checkout widget:
        {
            'order_id':           <Django Order pk>,
            'razorpay_order_id':  'order_XXXX',
            'amount':             <int rupees>,
            'currency':           'INR',
            'key_id':             <RAZORPAY_KEY_ID for frontend>,
        }

    Raises ValidationError (DRF) on any business-logic failure so the view
    can return a clean 400 response.
    """

    # ── 1. Load cart ──────────────────────────────────────────────────────────
    cart_items = list(
        CartItem.objects.filter(user=user).select_related('product')
    )
    if not cart_items:
        raise ValidationError("Cart is empty.")

    # ── 2. Lock product rows to prevent concurrent oversell ───────────────────
    # Collect all product PKs from the cart, then lock them in consistent PK
    # order to avoid deadlocks between two concurrent transactions.
    product_ids = sorted(item.product_id for item in cart_items)
    locked_products = {
        p.pk: p
        for p in Product.objects.select_for_update().filter(pk__in=product_ids)
    }

    # ── 3. Validate stock + availability ──────────────────────────────────────
    errors = []
    for item in cart_items:
        product = locked_products[item.product_id]
        if not product.is_available:
            errors.append(f"'{product.name}' is no longer available.")
        elif product.stock < item.quantity:
            errors.append(
                f"Only {product.stock} unit(s) of '{product.name}' left "
                f"(you requested {item.quantity})."
            )
    if errors:
        raise ValidationError(errors)

    # ── 4. Decrement stock ────────────────────────────────────────────────────
    for item in cart_items:
        product = locked_products[item.product_id]
        product.stock -= item.quantity
        product.save(update_fields=['stock'])

    # ── 5. Create Order + OrderItems ──────────────────────────────────────────
    # Validate delivery address belongs to this user.
    try:
        delivery_address = user.addresses.get(pk=delivery_address_id)
    except user.addresses.model.DoesNotExist:
        raise ValidationError("Invalid delivery address.")

    # Total in rupees — computed from price snapshots, not from Product.price
    # directly (though right now they're the same; this makes it safe for
    # future price changes after the lock snapshot).
    total = sum(
        locked_products[item.product_id].price * item.quantity
        for item in cart_items
    )

    order = Order.objects.create(
        customer=user,
        delivery_address=delivery_address,
        status=Order.Status.PAYMENT_PENDING,
        total=total
    )

    OrderItem.objects.bulk_create([
        OrderItem(
            order=order,
            product_id=item.product_id,
            quantity=item.quantity,
            # Snapshot the price NOW, inside the transaction, from the locked row.
            price_at_order=locked_products[item.product_id].price,
        )
        for item in cart_items
    ])

    # ── 6. Create initial status event ────────────────────────────────────────
    create_order_status_event(
        order,
        Order.Status.PAYMENT_PENDING,
        reason="Order created from cart checkout",
    )

    # ── 7. Create Razorpay order ──────────────────────────────────────────────
    client = _get_razorpay_client()
    try:
        rp_order = client.order.create({
            'amount': total * 100,  # rupees
            'currency': 'INR',
            'receipt': f'order_{order.pk}',
            'payment_capture': 1,   # auto-capture on payment success
        })
    except Exception as exc:
        # Roll back the transaction — stock is restored, order is not saved.
        raise ValidationError(f"Could not create Razorpay order: {exc}") from exc

    # ── 8. Create Payment row ─────────────────────────────────────────────────
    Payment.objects.create(
        order=order,
        amount=total,
        razorpay_order_id=rp_order['id'],
        status=Payment.Status.PENDING,
    )

    # ── 9. Clear the cart ─────────────────────────────────────────────────────
    CartItem.objects.filter(user=user).delete()

    return {
        'order_id': order.pk,
        'razorpay_order_id': rp_order['id'],
        'amount': total,
        'currency': 'INR',
        'key_id': settings.RAZORPAY_KEY_ID,
    }

