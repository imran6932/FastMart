"""
Payments services.

initiate_refund(payment, reason) — called after apps.orders.services.cancel_order()
commits its DB transaction. Calls Razorpay's refunds API for a captured
payment and moves it to 'refund_pending'.

Design decisions:
- The refund API call must never happen inside an open DB transaction —
  external HTTP calls shouldn't hold row locks. Callers should invoke this
  via transaction.on_commit(...) (see apps/orders/services.py).
- This is best-effort: if the Razorpay call fails (network error, already
  refunded on their side, etc.) we log and return False rather than raising.
  The order is already cancelled regardless — a failed refund call here can
  be retried manually (e.g. from the Django admin or a management command)
  without re-doing the cancellation.
- The refund is only considered final once the refund.processed webhook
  arrives (apps/payments/views.py) — Razorpay refunds can take several days
  to actually settle even though this API call returns immediately.
"""

import logging

import razorpay
from django.conf import settings

from .models import Payment

logger = logging.getLogger(__name__)


def _get_razorpay_client():
    return razorpay.Client(auth=(settings.RAZORPAY_KEY_ID, settings.RAZORPAY_KEY_SECRET))


def initiate_refund(payment, reason=""):
    """
    Kick off a Razorpay refund for a captured payment.

    No-ops (returns False) if the payment isn't currently 'success' or has no
    razorpay_payment_id — there's nothing captured to refund in that case.

    Returns True if the Razorpay refund API call succeeded.
    """
    if payment.status != Payment.Status.SUCCESS or not payment.razorpay_payment_id:
        return False

    client = _get_razorpay_client()
    try:
        refund = client.payment.refund(payment.razorpay_payment_id, {
            'amount': payment.amount * 100,  # Razorpay refund API expects paise
            'speed': 'optimum',
            'notes': {'reason': reason or 'Order cancelled by customer'},
        })
    except Exception:
        logger.exception(
            "Razorpay refund API call failed for Payment #%s (razorpay_payment_id=%s)",
            payment.pk, payment.razorpay_payment_id,
        )
        return False

    payment.razorpay_refund_id = refund.get('id', '')
    payment.status = Payment.Status.REFUND_PENDING
    payment.save(update_fields=['razorpay_refund_id', 'status', 'updated_at'])
    logger.info(
        "Refund initiated for Payment #%s — razorpay_refund_id=%s",
        payment.pk, payment.razorpay_refund_id,
    )
    return True
