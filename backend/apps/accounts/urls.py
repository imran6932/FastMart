from django.urls import include, path
from rest_framework.routers import DefaultRouter
from rest_framework_simplejwt.views import TokenRefreshView

from .views import (
    AddressViewSet,
    CustomTokenObtainPairView,
    ProfileView,
    RegisterView,
    ResendOTPView,
    VerifyOTPView,
)

router = DefaultRouter()
router.register(r'addresses', AddressViewSet, basename='address')

urlpatterns = [
    # POST /api/auth/token/         → login (returns 403 + code='email_not_verified' if unverified)
    # POST /api/auth/token/refresh/ → exchange refresh token for new access token
    path('token/', CustomTokenObtainPairView.as_view(), name='token_obtain_pair'),
    path('token/refresh/', TokenRefreshView.as_view(), name='token_refresh'),

    # POST /api/auth/register/      → create account (is_active=False) + send OTP email
    path('register/', RegisterView.as_view(), name='register'),

    # POST /api/auth/verify-otp/    → validate OTP, activate account, return JWT tokens
    path('verify-otp/', VerifyOTPView.as_view(), name='verify_otp'),

    # POST /api/auth/resend-otp/    → resend OTP (rate-limited: 3/hour)
    path('resend-otp/', ResendOTPView.as_view(), name='resend_otp'),

    # GET  /api/auth/profile/       → retrieve own profile
    # PATCH /api/auth/profile/      → update own profile
    path('profile/', ProfileView.as_view(), name='profile'),

    # CRUD /api/auth/addresses/     → manage saved delivery addresses
    path('', include(router.urls)),
]
