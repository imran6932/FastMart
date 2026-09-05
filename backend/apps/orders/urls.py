from django.urls import include, path
from rest_framework.routers import DefaultRouter

from .views import AdminOrderViewSet, CartItemViewSet, OrderViewSet, RiderOrderViewSet

router = DefaultRouter()
router.register(r'cart', CartItemViewSet, basename='cart')
router.register(r'rider', RiderOrderViewSet, basename='rider-order')
router.register(r'admin', AdminOrderViewSet, basename='admin-order')
router.register(r'', OrderViewSet, basename='order')

urlpatterns = [
    path('', include(router.urls)),
]
