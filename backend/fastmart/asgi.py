"""
ASGI config for FastMart.

Django Channels replaces Django's default ASGI handler with a ProtocolTypeRouter
that dispatches:
  - HTTP requests  → standard Django views / DRF
  - WebSocket connections → Channels consumers (order status + rider location)

The AuthMiddlewareStack wraps the WebSocket router so consumers can access
request.user via a JWT token passed as a query param on connection.
"""

import os

from django.core.asgi import get_asgi_application

# Set settings module before any Django imports.
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'fastmart.settings')

# Initialize Django apps before importing Channels routers that reference models.
django_asgi_app = get_asgi_application()

from channels.routing import ProtocolTypeRouter, URLRouter  # noqa: E402
import fastmart.routing                                      # noqa: E402
from fastmart.middleware import JWTAuthMiddleware            # noqa: E402

application = ProtocolTypeRouter({
    # Standard HTTP — handled by Django views / DRF as normal.
    'http': django_asgi_app,

    # WebSocket — wrapped in JWTAuthMiddleware which reads ?token=<jwt> from
    # the URL and sets scope['user']. Replaces AuthMiddlewareStack (session-based)
    # because our API is stateless JWT — no session cookies exist for WS handshake.
    'websocket': JWTAuthMiddleware(
        URLRouter(fastmart.routing.websocket_urlpatterns)
    ),
})
