"""
Payments model: Payment.

Key design decisions:

Razorpay webhook as source of truth:
  Payment status is updated via the `payment.captured` Razorpay webhook,
  not just the frontend callback. The frontend callback can be tampered with
  or dropped (user closes the tab mid-flow). The webhook fires server-to-server
  and is verified with an HMAC signature using RAZORPAY_WEBHOOK_SECRET.
  Only after webhook verification does the order move to 'confirmed'.

Server-side signature verification:
  Before trusting ANY payment success, we verify:
    expected = HMAC-SHA256(razorpay_order_id + '|' + razorpay_payment_id,
                           RAZORPAY_KEY_SECRET)
  This happens in the payment verification endpoint AND in the webhook handler.
  Never rely on the frontend saying "payment succeeded".

amount is in rupees, consistent with Product.price and Order.total.
"""

from django.db import models


class Payment(models.Model):
    class Status(models.TextChoices):
        PENDING = 'pending', 'Pending'
        SUCCESS = 'success', 'Success'
        FAILED = 'failed', 'Failed'
        REFUND_PENDING = 'refund_pending', 'Refund Pending'
        REFUNDED = 'refunded', 'Refunded'

    order = models.OneToOneField(
        'orders.Order',
        on_delete=models.PROTECT,
        related_name='payment',
    )
    # Amount in rupees — must match Order.total exactly.
    amount = models.PositiveIntegerField(help_text='Amount in rupees')

    # Set when we create the Razorpay order via their API at checkout.
    razorpay_order_id = models.CharField(max_length=100, unique=True)

    # Set after the customer completes payment and we verify the signature.
    razorpay_payment_id = models.CharField(max_length=100, blank=True)

    # Set once a refund is initiated (order cancellation) via the Razorpay
    # refunds API. Confirmed by the refund.processed webhook, at which point
    # status moves from 'refund_pending' to 'refunded'.
    razorpay_refund_id = models.CharField(max_length=100, blank=True)

    status = models.CharField(
        max_length=14,
        choices=Status.choices,
        default=Status.PENDING,
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    def __str__(self):
        return f'Payment for Order #{self.order_id} — {self.status}'

    class Meta:
        verbose_name = 'Payment'
        verbose_name_plural = 'Payments'