"""
WebSocket URL routing.

ws/orders/<order_id>/  → OrderStatusConsumer
  Customer, rider (if assigned), or admin tracks live order status.

ws/riders/<rider_id>/  → RiderLocationConsumer
  Rider sends GPS pings; admin observes live rider positions.
"""

from django.urls import re_path

from apps.tracking.consumers import OrderStatusConsumer, RiderLocationConsumer

websocket_urlpatterns = [
    re_path(r'^ws/orders/(?P<order_id>\d+)/$', OrderStatusConsumer.as_asgi()),
    re_path(r'^ws/riders/(?P<rider_id>\d+)/$', RiderLocationConsumer.as_asgi()),
]
