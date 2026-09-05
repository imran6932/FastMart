"""
Payments views.

CheckoutView       — POST /api/payments/checkout/
                     Converts the cart into an Order + Razorpay order.
                     Returns the Razorpay order ID so the frontend can open
                     the checkout widget.

PaymentVerifyView  — POST /api/payments/verify/
                     Called by the frontend after the Razorpay widget fires
                     onSuccess. Verifies the HMAC-SHA256 payment signature
                     server-side before marking the order confirmed.

RazorpayWebhookView — POST /api/payments/webhook/
                      Called by Razorpay servers. Handles 5 events:
                        payment.authorized — logged only (auto-capture follows)
                        payment.captured   — confirm payment + assign rider
                        payment.failed     — release stock + mark order failed
                        refund.created     — refund queued on Razorpay's side
                        refund.processed   — refund settled, mark Payment refunded
                      This is the authoritative confirmation path — it fires
                      even if the user's browser tab is closed.
                      Uses HMAC-SHA256 to verify the webhook payload signature
                      before processing.

Design decisions:
- BOTH verify and webhook independently confirm payment. In practice the
  webhook is the reliable one; the verify endpoint is a fast-path UX
  improvement so the UI updates immediately without waiting for Razorpay's
  webhook (which can have seconds of delay).
- The webhook endpoint is exempt from CSRF (it's called by Razorpay's servers,
  not a browser) and from JWT auth (no user session involved). We use
  @csrf_exempt via CsrfExemptSessionAuthentication to keep this out of the
  global auth flow.
- Signature verification code is kept in a private helper so both views share
  the same verified logic — no duplication.
- After payment confirmation, rider auto-assignment is triggered. That logic
  lives in apps/orders/assignment.py (step 6) — imported here but keeping
  views thin.

Interview note on the dual-confirmation pattern:
  "We verify from the frontend callback for instant UX, but we also have
  the webhook as a fallback for cases where the tab was closed mid-redirect.
  The webhook uses a separate HMAC secret so it can't be forged by someone
  who only knows the payment signature."
"""

import hashlib
import hmac
import json
import logging

import razorpay
from django.conf import settings
from django.utils.decorators import method_decorator
from django.views.decorators.csrf import csrf_exempt
from drf_spectacular.utils import OpenApiResponse, extend_schema
from rest_framework import status
from rest_framework.authentication import SessionAuthentication
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.accounts.permissions import IsCustomer
from apps.orders.models import Order
from apps.orders.services import place_order

from .models import Payment
from .serializers import CheckoutSerializer, PaymentVerifySerializer

logger = logging.getLogger(__name__)


def _verify_payment_signature(razorpay_order_id, razorpay_payment_id, signature):
    """
    Verify Razorpay payment signature.

    Razorpay signs: HMAC-SHA256(razorpay_order_id + '|' + razorpay_payment_id)
    using RAZORPAY_KEY_SECRET as the key.

    Returns True if the signature matches, False otherwise.
    Never raise — always return bool so callers can decide how to respond.
    """
    key = settings.RAZORPAY_KEY_SECRET.encode()
    message = f"{razorpay_order_id}|{razorpay_payment_id}".encode()
    expected = hmac.new(key, message, hashlib.sha256).hexdigest()
    # Use hmac.compare_digest to prevent timing attacks.
    return hmac.compare_digest(expected, signature)


def _confirm_payment(payment, razorpay_payment_id):
    """
    Mark a Payment as success and the linked Order as confirmed.
    Called from both verify and webhook paths once signature is validated.
    Idempotent — safe to call twice (webhook + verify race condition).
    """
    if payment.status == Payment.Status.SUCCESS:
        # Already confirmed (e.g. webhook arrived before verify). No-op.
        return

    payment.razorpay_payment_id = razorpay_payment_id
    payment.status = Payment.Status.SUCCESS
    payment.save(update_fields=['razorpay_payment_id', 'status', 'updated_at'])

    payment.order.status = Order.Status.CONFIRMED
    payment.order.save(update_fields=['status', 'updated_at'])

    # Broadcast status change to all WebSocket clients tracking this order.
    try:
        from apps.orders.channels import broadcast_order_status  # noqa: PLC0415
        broadcast_order_status(payment.order, message='Payment confirmed.')
    except Exception:
        logger.exception("broadcast_order_status failed for Order #%s", payment.order_id)

    # Send OS push notification to the customer.
    try:
        from apps.tracking.push import send_push_notification  # noqa: PLC0415
        send_push_notification(
            payment.order.customer,
            title='Order Confirmed ✓',
            body='Your payment was received. We are finding a rider for you.',
            data={'order_id': payment.order_id},
        )
    except Exception:
        logger.exception("Push notification failed for Order #%s", payment.order_id)

    # Trigger rider auto-assignment. Imported here to keep the circular import
    # between orders ↔ payments apps contained to this one call site.
    # Assignment is best-effort at this point — if it raises, we log and continue
    # rather than failing the whole payment confirmation.
    try:
        from apps.orders.assignment import assign_order  # noqa: PLC0415
        assign_order(payment.order)
    except Exception:  # noqa: BLE001
        logger.exception(
            "Rider auto-assignment failed for Order #%s — will need manual retry.",
            payment.order_id,
        )


def _mark_payment_failed(payment, reason=""):
    """
    Mark a Payment as failed and its Order as payment_failed, releasing the
    stock that was held for it. Triggered by the payment.failed webhook —
    mirrors what the stock-hold timeout sweep (apps/orders/tasks.py) does,
    just fired immediately instead of waiting for the timeout.

    Idempotent — no-ops if the payment already moved past a state this
    applies to (already captured/refunding/refunded), so a late or retried
    payment.failed webhook can never undo a successful payment.
    """
    if payment.status in (
        Payment.Status.SUCCESS,
        Payment.Status.REFUND_PENDING,
        Payment.Status.REFUNDED,
    ):
        return

    payment.status = Payment.Status.FAILED
    payment.save(update_fields=['status', 'updated_at'])

    order = payment.order
    if order.status in (Order.Status.CANCELLED, Order.Status.PAYMENT_FAILED, Order.Status.DELIVERED):
        return  # already resolved by another path — nothing more to do

    from apps.orders.models import OrderItem  # noqa: PLC0415
    from apps.orders.status import update_order_status  # noqa: PLC0415

    # Restore stock — the hold is released since this payment will never succeed.
    for item in OrderItem.objects.select_related('product').filter(order=order):
        item.product.stock += item.quantity
        item.product.save(update_fields=['stock'])

    update_order_status(order, Order.Status.PAYMENT_FAILED, reason=reason or 'Razorpay payment.failed')

    try:
        from apps.orders.channels import broadcast_order_status  # noqa: PLC0415
        broadcast_order_status(order, message='Payment failed.')
    except Exception:
        logger.exception("broadcast_order_status failed for Order #%s", order.pk)

    try:
        from apps.tracking.push import send_push_notification  # noqa: PLC0415
        send_push_notification(
            order.customer,
            title='Payment Failed',
            body='Your payment could not be completed. Please try again from your cart.',
            data={'order_id': order.pk},
        )
    except Exception:
        logger.exception("Push notification failed for Order #%s", order.pk)


def _handle_refund_event(payload, mark_refunded):
    """
    Shared handler for the refund.created and refund.processed webhooks.

    A refund entity is always linked to exactly one payment via payment_id,
    so we look the Payment up that way (not by razorpay_order_id, since the
    refund payload doesn't carry the order ID).

    refund.created  → payment moves to 'refund_pending' (mark_refunded=False)
    refund.processed → payment moves to 'refunded', the terminal state
                       (mark_refunded=True)

    This also covers refunds initiated manually from the Razorpay dashboard
    (not just ones we triggered via apps.payments.services.initiate_refund),
    since it looks the Payment up rather than requiring razorpay_refund_id
    to already be set.
    """
    refund_entity = payload.get('payload', {}).get('refund', {}).get('entity', {})
    razorpay_payment_id = refund_entity.get('payment_id')
    razorpay_refund_id = refund_entity.get('id')

    if not razorpay_payment_id:
        logger.warning("Razorpay webhook: refund event missing payment_id.")
        return

    try:
        payment = Payment.objects.select_related('order').get(
            razorpay_payment_id=razorpay_payment_id
        )
    except Payment.DoesNotExist:
        logger.warning(
            "Razorpay webhook: no Payment found for razorpay_payment_id=%s (refund event)",
            razorpay_payment_id,
        )
        return

    if payment.status == Payment.Status.REFUNDED:
        return  # already finalised — ignore a duplicate/retried webhook

    if razorpay_refund_id and not payment.razorpay_refund_id:
        payment.razorpay_refund_id = razorpay_refund_id

    payment.status = Payment.Status.REFUNDED if mark_refunded else Payment.Status.REFUND_PENDING
    payment.save(update_fields=['razorpay_refund_id', 'status', 'updated_at'])

    logger.info(
        "Razorpay webhook: %s for Order #%s",
        'refund.processed' if mark_refunded else 'refund.created',
        payment.order_id,
    )

    if mark_refunded:
        try:
            from apps.tracking.push import send_push_notification  # noqa: PLC0415
            send_push_notification(
                payment.order.customer,
                title='Refund Processed ✓',
                body=f'₹{payment.amount} has been refunded to your original payment method.',
                data={'order_id': payment.order_id},
            )
        except Exception:
            logger.exception("Push notification failed for refund on Order #%s", payment.order_id)


class CheckoutView(APIView):
    """
    POST /api/payments/checkout/

    Body: { "delivery_address_id": <int> }

    Creates the Django Order (status=payment_pending), decrements stock with
    select_for_update(), creates a Razorpay order, returns the data the
    frontend needs to open the Razorpay checkout widget.
    """

    permission_classes = [IsCustomer]
    serializer_class = CheckoutSerializer

    @extend_schema(
        request=CheckoutSerializer,
        responses={201: {'type': 'object', 'properties': {
            'order_id': {'type': 'integer'},
            'razorpay_order_id': {'type': 'string'},
            'amount': {'type': 'integer', 'description': 'Amount in paise'},
            'currency': {'type': 'string'},
            'key_id': {'type': 'string'},
        }}},
        summary='Create order and get Razorpay checkout data',
        tags=['Payments'],
    )
    def post(self, request):
        serializer = CheckoutSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        result = place_order(
            user=request.user,
            delivery_address_id=serializer.validated_data['delivery_address_id'],
        )
        return Response(result, status=status.HTTP_201_CREATED)


class PaymentVerifyView(APIView):
    """
    POST /api/payments/verify/

    Body: {
        "razorpay_order_id":  "order_XXXX",
        "razorpay_payment_id": "pay_XXXX",
        "razorpay_signature":  "..."
    }

    Fast-path confirmation from the frontend callback. Verifies the HMAC
    signature, then marks the order confirmed and triggers rider assignment.
    """

    permission_classes = [IsCustomer]

    @extend_schema(
        request=PaymentVerifySerializer,
        responses={200: {'type': 'object', 'properties': {
            'detail': {'type': 'string'},
            'order_id': {'type': 'integer'},
        }}},
        summary='Verify Razorpay payment signature (frontend callback)',
        tags=['Payments'],
    )
    def post(self, request):
        serializer = PaymentVerifySerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data

        # ── Signature check ───────────────────────────────────────────────────
        if not _verify_payment_signature(
            data['razorpay_order_id'],
            data['razorpay_payment_id'],
            data['razorpay_signature'],
        ):
            logger.warning(
                "Payment signature mismatch for razorpay_order_id=%s user=%s",
                data['razorpay_order_id'],
                request.user.pk,
            )
            return Response(
                {'detail': 'Invalid payment signature.'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        # ── Look up Payment ───────────────────────────────────────────────────
        try:
            payment = Payment.objects.select_related('order').get(
                razorpay_order_id=data['razorpay_order_id'],
                order__customer=request.user,  # user can only verify their own payments
            )
        except Payment.DoesNotExist:
            return Response(
                {'detail': 'Payment record not found.'},
                status=status.HTTP_404_NOT_FOUND,
            )

        _confirm_payment(payment, data['razorpay_payment_id'])

        return Response(
            {'detail': 'Payment confirmed.', 'order_id': payment.order_id},
            status=status.HTTP_200_OK,
        )


class CsrfExemptSessionAuthentication(SessionAuthentication):
    """Disable CSRF for the webhook endpoint — it's called by Razorpay, not a browser."""

    def enforce_csrf(self, request):
        return


@method_decorator(csrf_exempt, name='dispatch')
class RazorpayWebhookView(APIView):
    """
    POST /api/payments/webhook/

    Called by Razorpay's servers (not the browser). Handles:
      - payment.captured  → confirm payment + trigger rider assignment

    Security:
      - HMAC-SHA256 of the raw request body against RAZORPAY_WEBHOOK_SECRET.
        This is a different secret from the payment signature — it protects the
        webhook endpoint itself from being called by anyone who is not Razorpay.
      - Endpoint is publicly accessible (no JWT) but protected by HMAC.
      - Always returns 200 OK quickly — Razorpay retries on non-2xx.
    """

    authentication_classes = [CsrfExemptSessionAuthentication]
    permission_classes = [AllowAny]

    @extend_schema(
        request={'application/json': {'type': 'object'}},
        responses={200: {'type': 'object', 'properties': {'detail': {'type': 'string'}}}},
        summary='Razorpay webhook (payment.captured/authorized/failed, refund.created/processed)',
        tags=['Payments'],
    )
    def post(self, request):
        # ── 1. Verify webhook HMAC signature ──────────────────────────────────
        received_sig = request.headers.get('X-Razorpay-Signature', '')
        raw_body = request.body  # bytes — must use raw body for HMAC

        expected_sig = hmac.new(
            settings.RAZORPAY_WEBHOOK_SECRET.encode(),
            raw_body,
            hashlib.sha256,
        ).hexdigest()

        if not hmac.compare_digest(expected_sig, received_sig):
            logger.warning("Razorpay webhook: invalid signature received.")
            # Return 200 anyway — returning 4xx causes Razorpay to retry
            # indefinitely. We just ignore invalid payloads.
            return Response({'detail': 'ignored'}, status=status.HTTP_200_OK)

        # ── 2. Parse payload ──────────────────────────────────────────────────
        try:
            payload = json.loads(raw_body)
        except json.JSONDecodeError:
            logger.warning("Razorpay webhook: malformed JSON body.")
            return Response({'detail': 'ignored'}, status=status.HTTP_200_OK)

        event = payload.get('event')

        # ── 3. Handle payment.captured ────────────────────────────────────────
        if event == 'payment.captured':
            payment_entity = payload.get('payload', {}).get('payment', {}).get('entity', {})
            razorpay_order_id = payment_entity.get('order_id')
            razorpay_payment_id = payment_entity.get('id')

            if not razorpay_order_id or not razorpay_payment_id:
                logger.warning("Razorpay webhook: missing order_id or payment_id in payload.")
                return Response({'detail': 'ignored'}, status=status.HTTP_200_OK)

            try:
                payment = Payment.objects.select_related('order').get(
                    razorpay_order_id=razorpay_order_id
                )
            except Payment.DoesNotExist:
                logger.warning(
                    "Razorpay webhook: no Payment found for razorpay_order_id=%s",
                    razorpay_order_id,
                )
                return Response({'detail': 'ignored'}, status=status.HTTP_200_OK)

            _confirm_payment(payment, razorpay_payment_id)
            logger.info(
                "Razorpay webhook: payment.captured processed for Order #%s",
                payment.order_id,
            )

        # ── 4. Handle payment.authorized ──────────────────────────────────────
        # Checkout orders are created with payment_capture=1 (auto-capture), so
        # Razorpay captures the payment itself right after authorization — the
        # payment.captured event follows within moments. Nothing to act on here,
        # just acknowledge so Razorpay doesn't retry.
        elif event == 'payment.authorized':
            logger.info("Razorpay webhook: payment.authorized received (auto-capture will follow).")

        # ── 5. Handle payment.failed ────────────────────────────────────────
        elif event == 'payment.failed':
            payment_entity = payload.get('payload', {}).get('payment', {}).get('entity', {})
            razorpay_order_id = payment_entity.get('order_id')
            error_description = payment_entity.get('error_description', '')

            if not razorpay_order_id:
                logger.warning("Razorpay webhook: payment.failed missing order_id.")
                return Response({'detail': 'ignored'}, status=status.HTTP_200_OK)

            try:
                payment = Payment.objects.select_related('order').get(
                    razorpay_order_id=razorpay_order_id
                )
            except Payment.DoesNotExist:
                logger.warning(
                    "Razorpay webhook: no Payment found for razorpay_order_id=%s (payment.failed)",
                    razorpay_order_id,
                )
                return Response({'detail': 'ignored'}, status=status.HTTP_200_OK)

            _mark_payment_failed(payment, reason=f"Razorpay payment.failed: {error_description}")
            logger.info(
                "Razorpay webhook: payment.failed processed for Order #%s",
                payment.order_id,
            )

        # ── 6. Handle refund.created / refund.processed ───────────────────────
        elif event == 'refund.created':
            _handle_refund_event(payload, mark_refunded=False)
        elif event == 'refund.processed':
            _handle_refund_event(payload, mark_refunded=True)

        else:
            logger.info("Razorpay webhook: unhandled event '%s' — ignored.", event)

        # Always acknowledge — Razorpay will retry any non-2xx response.
        return Response({'detail': 'ok'}, status=status.HTTP_200_OK)
