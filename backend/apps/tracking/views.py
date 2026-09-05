"""
Tracking views.

VAPIDPublicKeyView      — GET /api/tracking/vapid-key/
                          Returns the VAPID public key so the frontend can
                          subscribe to push notifications via the Push API.
                          Public endpoint — no auth required to fetch the key.

PushSubscriptionView    — POST /api/tracking/push-subscription/
                          Register (or update) a push subscription for the
                          authenticated user.
                          DELETE /api/tracking/push-subscription/
                          Remove all subscriptions for the current user
                          (called when user disables notifications).

RiderDutyView           — PATCH /api/tracking/duty/
                          Toggle the rider's is_on_duty flag.
                          When going off duty, current_location is cleared so
                          stale positions don't appear on the admin map.

RiderListView           — GET /api/tracking/riders/
                          Admin-only list of all riders with current location.
                          Used to populate the live admin map.
"""

from django.conf import settings
from drf_spectacular.utils import extend_schema
from rest_framework import status
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.accounts.models import RiderProfile
from apps.accounts.permissions import IsAdminRole, IsRider
from apps.accounts.models import PushSubscription

from .serializers import PushSubscriptionSerializer


class VAPIDPublicKeyView(APIView):
    """GET /api/tracking/vapid-key/ — returns the VAPID public key."""

    permission_classes = [AllowAny]

    @extend_schema(
        responses={200: {'type': 'object', 'properties': {'vapid_public_key': {'type': 'string'}}}},
        summary='Get VAPID public key for push subscription',
        tags=['Push Notifications'],
    )
    def get(self, request):
        return Response({'vapid_public_key': settings.VAPID_PUBLIC_KEY})


class PushSubscriptionView(APIView):
    """
    POST   /api/tracking/push-subscription/  — register/update a subscription
    DELETE /api/tracking/push-subscription/  — remove all subscriptions
    """

    permission_classes = [IsAuthenticated]

    @extend_schema(
        request=PushSubscriptionSerializer,
        responses={201: PushSubscriptionSerializer},
        summary='Register a Web Push subscription',
        tags=['Push Notifications'],
    )
    def post(self, request):
        serializer = PushSubscriptionSerializer(
            data=request.data,
            context={'request': request},
        )
        serializer.is_valid(raise_exception=True)
        serializer.save()
        return Response(serializer.data, status=status.HTTP_201_CREATED)

    @extend_schema(
        responses={200: {'type': 'object', 'properties': {'detail': {'type': 'string'}}}},
        summary='Remove all push subscriptions for current user',
        tags=['Push Notifications'],
    )
    def delete(self, request):
        deleted_count, _ = PushSubscription.objects.filter(user=request.user).delete()
        return Response(
            {'detail': f'{deleted_count} subscription(s) removed.'},
            status=status.HTTP_200_OK,
        )


class RiderDutyView(APIView):
    """
    PATCH /api/tracking/duty/

    Body: {"is_on_duty": true|false}

    Toggles the rider's on-duty status.
    Going off duty clears current_location so the admin map doesn't show
    stale positions from the last shift.
    """

    permission_classes = [IsRider]

    @extend_schema(
        request={'application/json': {'type': 'object', 'properties': {'is_on_duty': {'type': 'boolean'}}, 'required': ['is_on_duty']}},
        responses={200: {'type': 'object', 'properties': {'is_on_duty': {'type': 'boolean'}, 'rider_id': {'type': 'integer'}}}},
        summary='Toggle rider on/off duty status',
        tags=['Tracking'],
    )
    def patch(self, request):
        is_on_duty = request.data.get('is_on_duty')
        if is_on_duty is None:
            return Response(
                {'detail': 'is_on_duty field is required.'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        try:
            profile = request.user.rider_profile
        except RiderProfile.DoesNotExist:
            return Response(
                {'detail': 'Rider profile not found.'},
                status=status.HTTP_404_NOT_FOUND,
            )

        profile.is_on_duty = bool(is_on_duty)
        if not profile.is_on_duty:
            # Clear stale location when going off duty.
            profile.current_location = None
        profile.save(update_fields=['is_on_duty', 'current_location', 'updated_at'])

        return Response({
            'is_on_duty': profile.is_on_duty,
            'rider_id': profile.pk,
        })


class RiderListView(APIView):
    """
    GET /api/tracking/riders/
    Admin-only. Returns all RiderProfiles (on and off duty) with current
    location, warehouse, and current active order (if any) — used to
    populate both the live admin map and the Riders list/track page.
    """

    permission_classes = [IsAdminRole]

    @extend_schema(
        responses={200: {'type': 'array', 'items': {'type': 'object', 'properties': {
            'rider_id': {'type': 'integer'},
            'email': {'type': 'string'},
            'is_on_duty': {'type': 'boolean'},
            'lat': {'type': 'number', 'nullable': True},
            'lng': {'type': 'number', 'nullable': True},
            'warehouse': {'type': 'object', 'nullable': True},
            'active_order_id': {'type': 'integer', 'nullable': True},
        }}}},
        summary='List all riders with current location and active order (admin)',
        tags=['Tracking'],
    )
    def get(self, request):
        from apps.orders.models import Order

        riders = RiderProfile.objects.select_related('user', 'warehouse').order_by('-is_on_duty', 'user__email')

        # One query to find each rider's current active order (prefer
        # out_for_delivery over assigned) instead of an N+1 per rider.
        active_orders = (
            Order.objects
            .filter(
                delivery_batch__rider__in=riders,
                status__in=[Order.Status.ASSIGNED, Order.Status.OUT_FOR_DELIVERY],
            )
            .order_by('delivery_batch__rider_id', '-status', 'created_at')
            .values('delivery_batch__rider_id', 'id', 'status')
        )
        active_order_by_rider = {}
        for row in active_orders:
            rider_id = row['delivery_batch__rider_id']
            # Keep the first one seen per rider — 'out_for_delivery' sorts
            # after 'assigned' alphabetically, and combined with the
            # '-status' ordering above, out_for_delivery is favoured first.
            if rider_id not in active_order_by_rider:
                active_order_by_rider[rider_id] = row['id']

        data = [
            {
                'rider_id': r.pk,
                'email': r.user.email,
                'is_on_duty': r.is_on_duty,
                'lat': r.current_location.y if r.current_location else None,
                'lng': r.current_location.x if r.current_location else None,
                'warehouse': {'id': r.warehouse.id, 'name': r.warehouse.name} if r.warehouse else None,
                'active_order_id': active_order_by_rider.get(r.pk),
            }
            for r in riders
        ]
        return Response(data)


class RiderActiveOrderView(APIView):
    """
    GET /api/tracking/riders/<int:rider_id>/active-order/

    Admin-only. Returns the rider's current active order (the one they're
    delivering right now) in full detail — including warehouse + delivery
    coordinates — so the admin's rider-track page can draw the same live
    route map used by the rider/customer apps.

    Prefers an 'out_for_delivery' order (actively being delivered right
    now) over an 'assigned' one (next up); returns 404 if the rider has
    neither.
    """

    permission_classes = [IsAdminRole]

    @extend_schema(
        summary="Get a rider's current active order with route info (admin)",
        tags=['Tracking'],
    )
    def get(self, request, rider_id):
        from apps.orders.models import Order
        from apps.orders.serializers import OrderDetailSerializer

        try:
            rider = RiderProfile.objects.select_related('user', 'warehouse').get(pk=rider_id)
        except RiderProfile.DoesNotExist:
            return Response({'detail': 'Rider not found.'}, status=status.HTTP_404_NOT_FOUND)

        order = (
            Order.objects
            .filter(
                delivery_batch__rider=rider,
                status__in=[Order.Status.OUT_FOR_DELIVERY, Order.Status.ASSIGNED],
            )
            .select_related(
                'delivery_address', 'customer',
                'delivery_batch__rider__warehouse', 'delivery_batch__rider__user',
            )
            .prefetch_related('items__product')
            # '-status' sorts 'out_for_delivery' before 'assigned' alphabetically,
            # so the order actively being delivered right now is shown first.
            .order_by('-status', 'created_at')
            .first()
        )

        if not order:
            return Response(
                {'detail': 'No active order for this rider.'},
                status=status.HTTP_404_NOT_FOUND,
            )

        return Response(OrderDetailSerializer(order).data)


class WarehouseListView(APIView):

    permission_classes = [AllowAny]

    def get(self, request):
            """
            GET /api/warehouses/  — List all active warehouses (public)
            """
            
            from apps.accounts.models import Warehouse
            from apps.accounts.serializers import WarehouseListSerializer
            
            warehouses = Warehouse.objects.filter(is_active=True)
            serializer = WarehouseListSerializer(warehouses, many=True)
            return Response(serializer.data)


class WarehouseCreateView(APIView):
    """
    POST /api/warehouses/ — Create warehouse (admin only)
    """
    
    def post(self, request):
        """Create warehouse (admin only)."""
        permission_classes = [IsAdminRole]
        
        if request.user.role != 'admin':
            return Response(
                {'detail': 'Only admins can create warehouses.'},
                status=status.HTTP_403_FORBIDDEN,
            )
        
        from apps.accounts.models import Warehouse
        from apps.accounts.serializers import WarehouseSerializer
        
        serializer = WarehouseSerializer(data=request.data)
        if serializer.is_valid():
            serializer.save()
            return Response(serializer.data, status=status.HTTP_201_CREATED)
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)


class WarehouseDetailView(APIView):
    """
    GET /api/warehouses/<id>/  — Warehouse details
    PUT /api/warehouses/<id>/  — Update warehouse (admin only)
    DELETE /api/warehouses/<id>/ — Delete warehouse (admin only)
    """
    
    def get(self, request, pk):
        """Get warehouse details."""
        from apps.accounts.models import Warehouse
        from apps.accounts.serializers import WarehouseSerializer
        
        try:
            warehouse = Warehouse.objects.get(pk=pk)
            serializer = WarehouseSerializer(warehouse)
            return Response(serializer.data)
        except Warehouse.DoesNotExist:
            return Response(
                {'detail': 'Warehouse not found.'},
                status=status.HTTP_404_NOT_FOUND,
            )
    
    def put(self, request, pk):
        """Update warehouse (admin only)."""
        if request.user.role != 'admin':
            return Response(
                {'detail': 'Only admins can update warehouses.'},
                status=status.HTTP_403_FORBIDDEN,
            )
        
        from apps.accounts.models import Warehouse
        from apps.accounts.serializers import WarehouseSerializer
        
        try:
            warehouse = Warehouse.objects.get(pk=pk)
            serializer = WarehouseSerializer(warehouse, data=request.data, partial=True)
            if serializer.is_valid():
                serializer.save()
                return Response(serializer.data)
            return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)
        except Warehouse.DoesNotExist:
            return Response(
                {'detail': 'Warehouse not found.'},
                status=status.HTTP_404_NOT_FOUND,
            )
    
    def delete(self, request, pk):
        """Delete warehouse (admin only)."""
        if request.user.role != 'admin':
            return Response(
                {'detail': 'Only admins can delete warehouses.'},
                status=status.HTTP_403_FORBIDDEN,
            )
        
        from apps.accounts.models import Warehouse
        
        try:
            warehouse = Warehouse.objects.get(pk=pk)
            warehouse.delete()
            return Response(status=status.HTTP_204_NO_CONTENT)
        except Warehouse.DoesNotExist:
            return Response(
                {'detail': 'Warehouse not found.'},
                status=status.HTTP_404_NOT_FOUND,
            )


class ServiceabilityCheckView(APIView):
    """
    GET /api/orders/check-serviceability/?address_id=<id>
    Check if customer can place order from a delivery address.
    
    Returns:
      {
        "can_proceed": true/false,
        "warehouse_id": <id> or null,
        "message": "error message if can_proceed=false"
      }
    """
    
    permission_classes = [IsAuthenticated]
    
    def get(self, request):
        """Check serviceability for an address."""
        from apps.accounts.models import Address
        from apps.orders.warehouse_service import can_proceed_with_order
        
        address_id = request.query_params.get('address_id')
        if not address_id:
            return Response(
                {'detail': 'address_id query parameter required.'},
                status=status.HTTP_400_BAD_REQUEST,
            )
        
        try:
            address = Address.objects.get(id=address_id, user=request.user)
        except Address.DoesNotExist:
            return Response(
                {'detail': 'Address not found.'},
                status=status.HTTP_404_NOT_FOUND,
            )
        
        can_proceed, warehouse_or_msg = can_proceed_with_order(request.user, address)
        
        data = {
            'can_proceed': can_proceed,
            'warehouse_id': warehouse_or_msg.id if can_proceed else None,
            'message': warehouse_or_msg if not can_proceed else None,
        }
        
        return Response(data)
