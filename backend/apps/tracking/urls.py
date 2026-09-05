from django.urls import path

from .views import (
    PushSubscriptionView, RiderActiveOrderView, RiderDutyView, RiderListView, VAPIDPublicKeyView,
    WarehouseListView, WarehouseCreateView, WarehouseDetailView, ServiceabilityCheckView
)

urlpatterns = [
    # GET  /api/tracking/vapid-key/          — public key for browser push subscription
    path('vapid-key/', VAPIDPublicKeyView.as_view(), name='vapid_key'),

    # POST /api/tracking/push-subscription/  — register push subscription
    # DELETE                                 — remove all subscriptions
    path('push-subscription/', PushSubscriptionView.as_view(), name='push_subscription'),

    # PATCH /api/tracking/duty/              — rider toggle on/off duty
    path('duty/', RiderDutyView.as_view(), name='rider_duty'),

    # GET /api/tracking/riders/              — admin: all riders + locations
    path('riders/', RiderListView.as_view(), name='rider_list'),

    # GET /api/tracking/riders/<id>/active-order/ — admin: rider's current active order + route info
    path('riders/<int:rider_id>/active-order/', RiderActiveOrderView.as_view(), name='rider_active_order'),
    
    # Warehouse management (admin)
    # GET  /api/warehouses/                  — list active warehouses
    # POST /api/warehouses/                  — create warehouse (admin)
    path('warehouses/', WarehouseListView.as_view(), name='warehouse_list'),
    path('warehouses/', WarehouseCreateView.as_view(), name='warehouse_create'),
    
    # GET  /api/warehouses/<id>/             — warehouse details
    # PUT  /api/warehouses/<id>/             — update warehouse (admin)
    # DELETE /api/warehouses/<id>/           — delete warehouse (admin)
    path('warehouses/<int:pk>/', WarehouseDetailView.as_view(), name='warehouse_detail'),
    
    # Serviceability check (customer)
    # GET /api/orders/check-serviceability/?address_id=<id>
    path('check-serviceability/', ServiceabilityCheckView.as_view(), name='check_serviceability'),
]
