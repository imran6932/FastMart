"""
Orders views.

CartItemViewSet  — CRUD for the authenticated customer's cart.
                   POST merges quantity if the product is already in the cart.
                   The queryset is scoped to request.user.

OrderViewSet     — Read-only for customers (list + retrieve their own orders).
                   Checkout / order creation is handled separately in step 6
                   via a dedicated endpoint backed by apps/orders/services.py
                   (stock locking, Razorpay, batch assignment).

RiderOrderViewSet — Rider-only endpoints for viewing their current batch and
                    updating order status (out_for_delivery → delivered).

AdminOrderViewSet — Admin-only full order list with all statuses.

Design decisions:
- Cart is scoped strictly to the requesting user — a customer can never see
  or modify another customer's cart items.
- Orders are similarly scoped: customers only see their own orders. Admins
  and riders will have separate viewsets in their respective app roles.
- OrderViewSet uses a different serializer for list vs detail:
    list   → OrderSerializer      (compact, no line items)
    detail → OrderDetailSerializer (full, with nested items)
  This avoids sending potentially large item arrays on every list page.
- HTTP method restrictions: DELETE is intentionally excluded from
  OrderViewSet — orders are cancelled through a status change endpoint
  (added in the order placement step), not deleted from the database.
"""

import logging

from rest_framework import mixins, status, viewsets
from rest_framework.decorators import action
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from apps.accounts.permissions import IsAdminRole, IsCustomer, IsRider

from .models import CartItem, DeliveryBatch, Order
from .serializers import (
    CartItemSerializer,
    OrderDetailSerializer,
    OrderSerializer,
)
from .services import cancel_order

logger = logging.getLogger(__name__)

ALLOWED_RIDER_TRANSITIONS = {
    Order.Status.ASSIGNED: Order.Status.OUT_FOR_DELIVERY,
    Order.Status.OUT_FOR_DELIVERY: Order.Status.DELIVERED,
}


class CartItemViewSet(viewsets.ModelViewSet):
    """
    GET    /api/orders/cart/         — list cart items for the current user
    POST   /api/orders/cart/         — add item (merges if product already in cart)
    GET    /api/orders/cart/{id}/    — retrieve single cart item
    PATCH  /api/orders/cart/{id}/    — update quantity
    DELETE /api/orders/cart/{id}/    — remove item from cart
    """

    serializer_class = CartItemSerializer
    permission_classes = [IsCustomer]

    def get_queryset(self):
        # Scope to the authenticated user. select_related('product') avoids
        # N+1 queries when rendering the nested product in each cart item.
        return (
            CartItem.objects
            .filter(user=self.request.user)
            .select_related('product', 'product__category')
            .order_by('added_at')
        )

    def perform_create(self, serializer):
        # User is injected by the serializer's create() method via context.
        # Calling save() here still works — the serializer handles the merge.
        serializer.save()


class OrderViewSet(
    mixins.ListModelMixin,
    mixins.RetrieveModelMixin,
    viewsets.GenericViewSet,
):
    """
    GET /api/orders/              — list authenticated customer's orders (paginated)
    GET /api/orders/{id}/         — retrieve full order detail with line items

    Create/cancel endpoints are added in step 6 (order placement service).
    """

    permission_classes = [IsCustomer]

    def get_queryset(self):
        return (
            Order.objects
            .filter(customer=self.request.user)
            .select_related('delivery_address')
            .prefetch_related('items__product')
            .order_by('-created_at')
        )

    def get_serializer_class(self):
        # Return compact serializer for list, full nested serializer for detail.
        if self.action == 'retrieve':
            return OrderDetailSerializer
        return OrderSerializer

    @action(detail=True, methods=['post'])
    def cancel(self, request, pk=None):
        """
        POST /api/orders/{id}/cancel/

        Body: { "reason": "<optional customer-provided reason>" }

        Cancellable only while the order hasn't been picked up for delivery
        yet (placed, payment_pending, confirmed, assigned) — see
        CANCELLABLE_ORDER_STATUSES in apps/orders/services.py. Restores
        stock, releases the order from any assigned rider's batch, and — if
        payment was already captured — schedules a Razorpay refund. The
        refund's completion is confirmed asynchronously via the
        refund.processed webhook (apps/payments/views.py); this endpoint
        just kicks it off.
        """
        order = self.get_object()
        reason = (request.data.get('reason') or '').strip() or 'Cancelled by customer'

        # Raises ValidationError (→ 400) if the order is no longer cancellable.
        cancel_order(order, reason=reason, cancelled_by=request.user)
        order.refresh_from_db()

        try:
            from apps.orders.channels import broadcast_order_status
            broadcast_order_status(order, message='Your order has been cancelled.')
        except Exception:
            logger.exception("broadcast_order_status failed for Order #%s", order.pk)

        try:
            from apps.tracking.push import send_push_notification
            send_push_notification(
                order.customer,
                title='Order Cancelled',
                body='Your order has been cancelled. Any payment made will be refunded shortly.',
                data={'order_id': order.pk},
            )
        except Exception:
            logger.exception("Push notification failed for Order #%s", order.pk)

        return Response(
            OrderDetailSerializer(order, context=self.get_serializer_context()).data,
            status=status.HTTP_200_OK,
        )


class RiderOrderViewSet(
    mixins.ListModelMixin,
    mixins.RetrieveModelMixin,
    viewsets.GenericViewSet,
):
    """
    GET  /api/orders/rider/             — orders in the rider's current open batch
    GET  /api/orders/rider/{id}/        — order detail
    POST /api/orders/rider/{id}/advance/ — advance status: assigned→out_for_delivery→delivered

    Riders can only see and advance orders that belong to their active batch.
    """

    permission_classes = [IsRider]

    def get_queryset(self):
        try:
            rider_profile = self.request.user.rider_profile
        except Exception:
            return Order.objects.none()

        return (
            Order.objects
            .filter(
                delivery_batch__rider=rider_profile,
                delivery_batch__status__in=[
                    DeliveryBatch.Status.PENDING,
                    DeliveryBatch.Status.IN_PROGRESS,
                ],
            )
            .select_related('delivery_address', 'customer')
            .prefetch_related('items__product')
            .order_by('created_at')
        )

    def get_serializer_class(self):
        if self.action == 'retrieve':
            return OrderDetailSerializer
        return OrderSerializer

    @action(detail=True, methods=['post'])
    def advance(self, request, pk=None):
        """
        POST /api/orders/rider/{id}/advance/

        Advances the order status along the rider's path:
          assigned → out_for_delivery → delivered

        When ALL orders in a batch are delivered, the batch is marked completed.
        Broadcasts WebSocket update and sends push notification to the customer.
        """
        from apps.orders.status import update_order_status, update_batch_status

        order = self.get_object()
        next_status = ALLOWED_RIDER_TRANSITIONS.get(order.status)

        if next_status is None:
            return Response(
                {'detail': f"Cannot advance from status '{order.status}'."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        # Update order status with reason tracking
        update_order_status(
            order,
            next_status,
            reason=f"Rider {request.user.email} advanced order from {order.status}",
            changed_by_user=request.user,
        )

        # If the batch just started (first order going out_for_delivery), mark it in_progress.
        if next_status == Order.Status.OUT_FOR_DELIVERY:
            batch = order.delivery_batch
            if batch.status == DeliveryBatch.Status.PENDING:
                update_batch_status(
                    batch,
                    DeliveryBatch.Status.IN_PROGRESS,
                    reason="First order in batch started delivery",
                )

        # If all orders in the batch are delivered, close the batch.
        if next_status == Order.Status.DELIVERED:
            batch = order.delivery_batch
            if not batch.orders.exclude(status=Order.Status.DELIVERED).exists():
                from django.utils import timezone
                update_batch_status(
                    batch,
                    DeliveryBatch.Status.COMPLETED,
                    reason="All orders in batch delivered",
                )
                batch.completed_at = timezone.now()
                batch.save(update_fields=['completed_at'])

        # Broadcast WebSocket update.
        try:
            from apps.orders.channels import broadcast_order_status
            messages = {
                Order.Status.OUT_FOR_DELIVERY: 'Your order is out for delivery!',
                Order.Status.DELIVERED: 'Your order has been delivered.',
            }
            broadcast_order_status(order, message=messages.get(next_status, ''))
        except Exception:
            logger.exception("broadcast_order_status failed for Order #%s", order.pk)

        # Push notification to customer.
        try:
            from apps.tracking.push import send_push_notification
            titles = {
                Order.Status.OUT_FOR_DELIVERY: 'On the way 🛵',
                Order.Status.DELIVERED: 'Delivered ✓',
            }
            bodies = {
                Order.Status.OUT_FOR_DELIVERY: 'Your order is out for delivery.',
                Order.Status.DELIVERED: 'Your order has been delivered. Enjoy!',
            }
            send_push_notification(
                order.customer,
                title=titles.get(next_status, 'Order Update'),
                body=bodies.get(next_status, f'Status: {next_status}'),
                data={'order_id': order.pk},
            )
        except Exception:
            logger.exception("Push notification failed for Order #%s", order.pk)

        return Response(
            OrderSerializer(order).data,
            status=status.HTTP_200_OK,
        )


class AdminOrderViewSet(
    mixins.ListModelMixin,
    mixins.RetrieveModelMixin,
    viewsets.GenericViewSet,
):
    """
    GET /api/orders/admin/         — all orders (paginated, filterable by status)
    GET /api/orders/admin/{id}/    — full order detail
    """

    permission_classes = [IsAdminRole]

    def get_queryset(self):
        qs = (
            Order.objects
            .select_related('customer', 'delivery_address', 'delivery_batch__rider__user')
            .prefetch_related('items__product')
            .order_by('-created_at')
        )
        status_filter = self.request.query_params.get('status')
        if status_filter:
            qs = qs.filter(status=status_filter)
        return qs

    def get_serializer_class(self):
        if self.action == 'retrieve':
            return OrderDetailSerializer
        return OrderSerializer
