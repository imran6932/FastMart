"""
JWT authentication middleware for Django Channels WebSocket connections.

Django Channels' built-in AuthMiddlewareStack authenticates via Django
session cookies. Our API is stateless JWT-based — browsers don't have a
session cookie for the WebSocket handshake. Instead, the frontend passes
the JWT access token as a query parameter on the WebSocket URL:

    wss://api.fastmart.local/ws/orders/42/?token=<jwt_access_token>

This middleware:
  1. Reads the `token` query parameter from the WebSocket URL.
  2. Validates it using the same simplejwt logic used in DRF views.
  3. Sets scope['user'] to the authenticated User, or AnonymousUser on failure.

Why query param and not Authorization header?
  The browser WebSocket API (new WebSocket(url)) does not support custom
  headers. The only standard mechanism for passing credentials is a query
  parameter or a subprotocol. Query param is the common pattern; it is
  acceptable here because the connection is over TLS (HTTPS/WSS) in production
  so the token is not visible in transit.

Interview note: "The token is in the URL, which means it appears in server
  access logs. In production you can rotate it quickly after first message
  or use a short-lived one-time token. For this portfolio project we use the
  same access token as the REST API — acceptable given the TLS encryption."
"""

from urllib.parse import parse_qs

from channels.db import database_sync_to_async
from channels.middleware import BaseMiddleware
from django.contrib.auth.models import AnonymousUser
from rest_framework_simplejwt.exceptions import InvalidToken, TokenError
from rest_framework_simplejwt.tokens import AccessToken


@database_sync_to_async
def get_user_from_token(token_key):
    """
    Validate a JWT access token string and return the associated User.
    Returns AnonymousUser if the token is invalid or expired.
    """
    from django.contrib.auth import get_user_model  # avoid circular import
    User = get_user_model()
    try:
        token = AccessToken(token_key)
        user_id = token['user_id']
        return User.objects.get(pk=user_id)
    except (InvalidToken, TokenError, User.DoesNotExist, KeyError):
        return AnonymousUser()


class JWTAuthMiddleware(BaseMiddleware):
    """
    Channels middleware that reads ?token=<jwt> from the WebSocket URL
    and populates scope['user'].
    """

    async def __call__(self, scope, receive, send):
        # Parse the query string from the WebSocket URL.
        query_string = scope.get('query_string', b'').decode()
        params = parse_qs(query_string)
        token_list = params.get('token', [])

        if token_list:
            scope['user'] = await get_user_from_token(token_list[0])
        else:
            scope['user'] = AnonymousUser()

        return await super().__call__(scope, receive, send)
