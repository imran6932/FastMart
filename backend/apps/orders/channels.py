"""
Channel layer broadcast helpers.

These functions are called from REST views, Celery tasks, and the payment
webhook whenever an order status changes. They push the update to all
WebSocket clients subscribed to that order's group.

Keeping broadcasts in one module means the call sites (payment views,
rider views, admin views) don't need to know about channel group naming
conventions — they just call `broadcast_order_status(order)`.

Usage example (from a view or task):
    from apps.orders.channels import broadcast_order_status
    order.status = Order.Status.OUT_FOR_DELIVERY
    order.save()
    broadcast_order_status(order)
"""

from asgiref.sync import async_to_sync
from channels.layers import get_channel_layer


def broadcast_order_status(order, message: str = ''):
    """
    Push an order status update to all WebSocket clients subscribed to
    the "order_{id}" channel group.

    Safe to call from synchronous Django views and Celery tasks.
    async_to_sync() bridges the sync context into the async channel layer.

    Parameters:
        order   — the Order instance (must have .pk and .status set already).
        message — optional human-readable status message for the client.
    """
    channel_layer = get_channel_layer()
    async_to_sync(channel_layer.group_send)(
        f'order_{order.pk}',
        {
            'type': 'order.status',   # maps to OrderStatusConsumer.order_status()
            'order_id': order.pk,
            'status': order.status,
            'message': message,
        },
    )
