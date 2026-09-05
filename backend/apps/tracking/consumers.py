"""
Django Channels WebSocket consumers.

OrderStatusConsumer
───────────────────
URL:  ws/orders/<order_id>/
Use:  Customer opens this connection after placing an order to track live
      status updates without polling. Riders and admins can also connect
      (e.g. admin order board).

Group: "order_{order_id}"
      Any backend code that changes an order's status calls:
          channel_layer.group_send("order_{id}", {"type": "order.status", ...})
      This consumer receives that message and forwards it to the client.

Auth:
  - Requires authenticated user (JWT middleware sets scope['user']).
  - Customers may only connect to their own orders.
  - Riders may connect to any order in their current batch (checked on connect).
  - Admins may connect to any order.

RiderLocationConsumer
─────────────────────
URL:  ws/riders/<rider_id>/
Use:
  - Rider side: sends GPS coordinates every few seconds while on duty.
    Consumer writes them to RiderProfile.current_location + LocationPing table.
    Also broadcasts the position to all active order groups so customers
    tracking those orders see the rider move.
  - Admin / customer side: read-only connection to watch a rider's position.

Group: "rider_{rider_id}"
      Rider's own browser sends pings; admin/customer browsers receive them.

Auth:
  - Riders may only write to their own ws/riders/<own_rider_id>/ channel.
  - Admins may connect (read-only) to any rider channel.
  - Customers are not allowed to connect directly to rider channels
    (they receive rider position updates through their order's group instead).

Interview talking points:
  - "Why group_send from the consumer instead of direct send?"
    group_send routes through the Redis channel layer so all connected clients
    in that group receive the message, even if they're on a different Daphne
    worker process. Direct send only works within a single process.
  - "How do you prevent one customer seeing another customer's order updates?"
    The OrderStatusConsumer's connect() rejects the connection with close(4003)
    if the requesting user doesn't own the order (and isn't a rider/admin).
"""

import json
import logging

from channels.db import database_sync_to_async
from channels.generic.websocket import AsyncWebsocketConsumer
from django.contrib.auth.models import AnonymousUser
from django.contrib.gis.geos import Point

logger = logging.getLogger(__name__)


# ─── Helpers ──────────────────────────────────────────────────────────────────

@database_sync_to_async
def get_order(order_id):
    from apps.orders.models import Order  # local import avoids circular deps at module load
    try:
        return Order.objects.select_related(
            'customer', 'delivery_batch__rider__user'
        ).get(pk=order_id)
    except Order.DoesNotExist:
        return None


@database_sync_to_async
def get_rider_profile(rider_id):
    from apps.accounts.models import RiderProfile
    try:
        return RiderProfile.objects.select_related('user').get(pk=rider_id)
    except RiderProfile.DoesNotExist:
        return None


@database_sync_to_async
def update_rider_location(rider_profile, latitude, longitude):
    """
    Atomically update RiderProfile.current_location and append a LocationPing.
    Two writes in one DB round-trip using bulk operations.
    """
    from apps.tracking.models import LocationPing
    point = Point(longitude, latitude, srid=4326)  # Point(x=lng, y=lat)

    rider_profile.current_location = point
    rider_profile.save(update_fields=['current_location', 'updated_at'])

    LocationPing.objects.create(rider=rider_profile, location=point)


@database_sync_to_async
def get_rider_active_order_ids(rider_profile):
    """
    Return PKs of all orders currently assigned to the rider's open batch.
    Used to fan out location updates to order-tracking groups.
    """
    from apps.orders.models import Order, DeliveryBatch
    return list(
        Order.objects.filter(
            delivery_batch__rider=rider_profile,
            delivery_batch__status=DeliveryBatch.Status.IN_PROGRESS,
        ).values_list('pk', flat=True)
    )


# ─── Consumers ────────────────────────────────────────────────────────────────

class OrderStatusConsumer(AsyncWebsocketConsumer):
    """
    WebSocket endpoint: ws/orders/<order_id>/

    Clients join this socket to receive live order status pushes.
    The backend sends messages via channel_layer.group_send() whenever
    the order status changes (from payment view, assignment, rider updates).
    """

    async def connect(self):
        user = self.scope.get('user')
        if not user or isinstance(user, AnonymousUser):
            await self.close(code=4001)  # Unauthorized
            return

        order_id = self.scope['url_route']['kwargs']['order_id']
        order = await get_order(order_id)

        if order is None:
            await self.close(code=4004)  # Not Found
            return

        # Access control: customer owns the order, or rider is assigned, or admin.
        allowed = await self._check_access(user, order)
        if not allowed:
            await self.close(code=4003)  # Forbidden
            return

        self.group_name = f'order_{order_id}'
        await self.channel_layer.group_add(self.group_name, self.channel_name)
        await self.accept()

        # Send current status immediately on connect so the client doesn't need
        # a separate REST call to know the starting state.
        await self.send(json.dumps({
            'type': 'order.status',
            'order_id': order.pk,
            'status': order.status,
        }))

    @database_sync_to_async
    def _check_access(self, user, order):
        from apps.accounts.models import User as UserModel
        if user.role == UserModel.Role.ADMIN:
            return True
        if user.role == UserModel.Role.CUSTOMER:
            return order.customer_id == user.pk
        if user.role == UserModel.Role.RIDER:
            # Rider is allowed if the order is in their batch.
            if order.delivery_batch and order.delivery_batch.rider.user_id == user.pk:
                return True
        return False

    async def disconnect(self, close_code):
        if hasattr(self, 'group_name'):
            await self.channel_layer.group_discard(self.group_name, self.channel_name)

    # Clients send no meaningful messages to this consumer — it's server-push only.
    async def receive(self, text_data=None, bytes_data=None):
        pass

    # ── Message handlers (called by channel layer group_send) ─────────────────

    async def order_status(self, event):
        """
        Receives: {"type": "order.status", "order_id": ..., "status": ..., ...}
        Forwards as JSON to the connected WebSocket client.
        """
        await self.send(json.dumps({
            'type': 'order.status',
            'order_id': event['order_id'],
            'status': event['status'],
            'message': event.get('message', ''),
        }))

    async def rider_location(self, event):
        """
        Receives: {"type": "rider.location", "lat": ..., "lng": ..., "rider_id": ...}
        Forwarded to the order tracking client so the map pin moves.
        """
        await self.send(json.dumps({
            'type': 'rider.location',
            'rider_id': event['rider_id'],
            'lat': event['lat'],
            'lng': event['lng'],
        }))


class RiderLocationConsumer(AsyncWebsocketConsumer):
    """
    WebSocket endpoint: ws/riders/<rider_id>/

    Dual-purpose:
    - Rider (write): sends GPS pings, consumer saves them and broadcasts.
    - Admin (read): receives live rider position for the admin map.

    Customers are not allowed to connect here directly.
    """

    async def connect(self):
        user = self.scope.get('user')
        if not user or isinstance(user, AnonymousUser):
            await self.close(code=4001)
            return

        rider_id = self.scope['url_route']['kwargs']['rider_id']
        self.rider_profile = await get_rider_profile(rider_id)

        if self.rider_profile is None:
            await self.close(code=4004)
            return

        # Access control
        allowed = await self._check_access(user)
        if not allowed:
            await self.close(code=4003)
            return

        self.group_name = f'rider_{rider_id}'
        self.rider_id = rider_id
        self.is_rider = await self._is_own_rider(user)

        await self.channel_layer.group_add(self.group_name, self.channel_name)
        await self.accept()

    @database_sync_to_async
    def _check_access(self, user):
        from apps.accounts.models import User as UserModel
        if user.role == UserModel.Role.ADMIN:
            return True
        if user.role == UserModel.Role.RIDER:
            # Riders can only connect to their own channel.
            try:
                return user.rider_profile.pk == self.rider_profile.pk
            except Exception:
                return False
        # Customers cannot connect to rider channels directly.
        return False

    @database_sync_to_async
    def _is_own_rider(self, user):
        from apps.accounts.models import User as UserModel
        if user.role != UserModel.Role.RIDER:
            return False
        try:
            return user.rider_profile.pk == self.rider_profile.pk
        except Exception:
            return False

    async def disconnect(self, close_code):
        if hasattr(self, 'group_name'):
            await self.channel_layer.group_discard(self.group_name, self.channel_name)

    async def receive(self, text_data=None, bytes_data=None):
        """
        Called when the rider's browser sends a GPS ping.
        Expected JSON: {"type": "location.ping", "lat": 19.076, "lng": 72.877}

        Only the rider themselves can send pings — admins are read-only.
        """
        try:
            if not self.is_rider:
                return  # Admins are observers only — ignore any sends.

            try:
                data = json.loads(text_data)
            except (json.JSONDecodeError, TypeError):
                logger.warning("RiderLocationConsumer: invalid JSON from rider %s", self.rider_id)
                return

            if data.get('type') != 'location.ping':
                return

            try:
                lat = float(data['lat'])
                lng = float(data['lng'])
            except (KeyError, ValueError, TypeError):
                logger.warning(
                    "RiderLocationConsumer: malformed lat/lng from rider %s: %s",
                    self.rider_id, data,
                )
                return

            # Validate coordinate ranges.
            if not (-90 <= lat <= 90) or not (-180 <= lng <= 180):
                logger.warning(
                    "RiderLocationConsumer: out-of-range coordinates from rider %s: lat=%s lng=%s",
                    self.rider_id, lat, lng,
                )
                return

            # Persist to DB: update current_location + append LocationPing.
            # This is the critical part — location must be saved.
            try:
                await update_rider_location(self.rider_profile, lat, lng)
                logger.info(f"✓ Updated rider {self.rider_id} location: {lat}, {lng}")
            except Exception as e:
                logger.error(f"✗ Failed to update rider {self.rider_id} location: {e}", exc_info=True)
                return

            # Broadcast to all admin clients watching this rider's group.
            try:
                await self.channel_layer.group_send(
                    self.group_name,
                    {
                        'type': 'rider.location',
                        'rider_id': int(self.rider_id),
                        'lat': lat,
                        'lng': lng,
                    },
                )
            except Exception as e:
                logger.warning("RiderLocationConsumer: group_send failed for rider %s: %s", self.rider_id, e)

            # Fan out to all order groups this rider is currently delivering —
            # so customer order-tracking screens also see the rider move.
            try:
                order_ids = await get_rider_active_order_ids(self.rider_profile)
                for order_id in order_ids:
                    await self.channel_layer.group_send(
                        f'order_{order_id}',
                        {
                            'type': 'rider.location',
                            'rider_id': int(self.rider_id),
                            'lat': lat,
                            'lng': lng,
                        },
                    )
            except Exception as e:
                logger.warning("RiderLocationConsumer: order fan-out failed for rider %s: %s", self.rider_id, e)
        
        except Exception as e:
            logger.error("RiderLocationConsumer: Unexpected error in receive: %s", e, exc_info=True)

    # ── Message handler (admin observers receive this) ─────────────────────────

    async def rider_location(self, event):
        """Forward a rider.location group message to the connected WebSocket client."""
        await self.send(json.dumps({
            'type': 'rider.location',
            'rider_id': event['rider_id'],
            'lat': event['lat'],
            'lng': event['lng'],
        }))
