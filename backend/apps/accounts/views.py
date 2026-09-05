"""
Accounts views.

RegisterView            — POST /api/auth/register/       (public)
                          Creates user with is_active=False, sends OTP email.
VerifyOTPView           — POST /api/auth/verify-otp/     (public)
                          Validates OTP, activates account, returns JWT tokens.
ResendOTPView           — POST /api/auth/resend-otp/     (public)
                          Resends OTP (rate-limited: 3/hour per email).
CustomTokenObtainPairView — POST /api/auth/token/        (replaces simplejwt's default)
                          Same as TokenObtainPairView but returns a specific
                          'email_not_verified' error code so the frontend
                          can offer the user a path to verify rather than
                          showing a generic "wrong credentials" message.
ProfileView             — GET/PATCH /api/auth/profile/   (authenticated)
AddressViewSet          — CRUD /api/auth/addresses/      (authenticated customers only)

Rate limiting on OTP resend:
  Tracked in Django's cache under "otp_resend_{email}". Max 3 per hour.
  Using cache (Redis) rather than DB so the check is O(1) and doesn't add
  a DB query on every login attempt.
"""

import logging

from django.contrib.auth import get_user_model
from django.core.cache import cache
from django.db import transaction
from drf_spectacular.utils import OpenApiResponse, extend_schema
from rest_framework import generics, status, viewsets
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView
from rest_framework_simplejwt.tokens import RefreshToken
from rest_framework_simplejwt.views import TokenObtainPairView

from .models import Address
from .otp import generate_and_send_otp, verify_otp
from .serializers import (
    AddressSerializer,
    OTPVerifySerializer,
    ProfileSerializer,
    RegisterSerializer,
    ResendOTPSerializer,
)
from django.conf import settings

logger = logging.getLogger(__name__)
User = get_user_model()


OTP_RESEND_RATE_LIMIT = getattr(settings, 'OTP_RESEND_RATE_LIMIT', 3)  # max OTP requests
OTP_RESEND_WINDOW = getattr(settings, 'OTP_RESEND_WINDOW', 60 * 60)   # per hour (seconds)


def _issue_tokens(user):
    """Return a dict of JWT tokens for the given user."""
    refresh = RefreshToken.for_user(user)
    return {
        'refresh': str(refresh),
        'access': str(refresh.access_token),
    }


class RegisterView(generics.CreateAPIView):
    """
    POST /api/auth/register/

    Creates a new user account (customer or rider) with is_active=False (cannot log in yet).
    Sends a 6-digit OTP to the user's email for verification.
    The client should redirect the user to an OTP entry screen.
    
    Request body:
    {
        "email": "user@example.com",
        "password": "securepassword",
        "first_name": "John",
        "last_name": "Doe",
        "phone": "+1234567890",
        "role": "customer"  // or "rider", defaults to "customer"
    }
    """

    serializer_class = RegisterSerializer
    permission_classes = [AllowAny]

    @extend_schema(
        responses={201: {'type': 'object', 'properties': {
            'detail': {'type': 'string'},
            'email': {'type': 'string'},
        }}},
        summary='Register a new account (customer or rider, sends OTP)',
        tags=['Auth'],
    )
    def create(self, request, *args, **kwargs):
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        user = serializer.save()

        # Get warehouse_id from validated data if present (for riders)
        warehouse_id = serializer.validated_data.get('warehouse_id')

        try:
            generate_and_send_otp(user, warehouse_id=warehouse_id)
        except Exception:
            # Roll back the user creation if we can't send the email,
            # so they can try again cleanly rather than having a dead account.
            logger.exception("Failed to send OTP to %s — rolling back registration.", user.email)
            user.delete()
            return Response(
                {'detail': 'Could not send verification email. Please try again.'},
                status=status.HTTP_503_SERVICE_UNAVAILABLE,
            )

        return Response(
            {
                'detail': 'Account created. Check your email for a 6-digit verification code.',
                'email': user.email,
            },
            status=status.HTTP_201_CREATED,
        )


class VerifyOTPView(APIView):
    """
    POST /api/auth/verify-otp/

    Body: { "email": "...", "code": "123456" }

    Validates the OTP. On success:
      - Sets user.is_active = True
      - Returns JWT access + refresh tokens (auto-login — no second step needed)

    On failure returns the specific reason (expired, invalid, not found) so
    the frontend can show a helpful message.
    """

    permission_classes = [AllowAny]

    @extend_schema(
        request=OTPVerifySerializer,
        responses={
            200: {'type': 'object', 'properties': {
                'access': {'type': 'string'},
                'refresh': {'type': 'string'},
                'detail': {'type': 'string'},
            }},
            400: OpenApiResponse(description='Invalid or expired OTP'),
            404: OpenApiResponse(description='Email not registered'),
        },
        summary='Verify email OTP and activate account',
        tags=['Auth'],
    )
    def post(self, request):
        serializer = OTPVerifySerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data

        try:
            user = User.objects.get(email=data['email'])
        except User.DoesNotExist:
            return Response(
                {'detail': 'No account found with this email.'},
                status=status.HTTP_404_NOT_FOUND,
            )

        if user.is_active:
            # Already verified — just return tokens (idempotent).
            return Response(
                {'detail': 'Email already verified.', **_issue_tokens(user)},
                status=status.HTTP_200_OK,
            )

        success, error_msg, warehouse_id = verify_otp(user, data['code'])
        if not success:
            return Response({'detail': error_msg}, status=status.HTTP_400_BAD_REQUEST)

        # If this is a rider registration with a warehouse, create RiderProfile
        if user.role == User.Role.RIDER and warehouse_id:
            try:
                from .models import RiderProfile, Warehouse
                warehouse = Warehouse.objects.get(id=warehouse_id, is_active=True)
                RiderProfile.objects.get_or_create(
                    user=user,
                    defaults={'warehouse': warehouse}
                )
                logger.info("✓ Created RiderProfile for user %s in warehouse %s", user.email, warehouse.name)
            except Warehouse.DoesNotExist:
                logger.warning("⚠ Warehouse %s not found or inactive for rider %s", warehouse_id, user.email)
                # Don't fail the verification, just log the warning
            except Exception as e:
                logger.error("Failed to create RiderProfile for %s: %s", user.email, str(e), exc_info=True)
                # Don't fail the verification if RiderProfile creation fails

        return Response(
            {'detail': 'Email verified. You are now logged in.', **_issue_tokens(user)},
            status=status.HTTP_200_OK,
        )


class ResendOTPView(APIView):
    """
    POST /api/auth/resend-otp/

    Body: { "email": "..." }

    Sends a fresh OTP to the given email.
    Rate-limited to 3 requests per hour per email (tracked in Redis cache).

    Always returns 200 regardless of whether the email exists — this prevents
    user enumeration (attackers can't tell which emails are registered).
    """

    permission_classes = [AllowAny]

    @extend_schema(
        request=ResendOTPSerializer,
        responses={200: {'type': 'object', 'properties': {'detail': {'type': 'string'}}}},
        summary='Resend OTP to email (rate-limited)',
        tags=['Auth'],
    )
    def post(self, request):
        serializer = ResendOTPSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        email = serializer.validated_data['email']

        # Rate limit check (Redis cache key per email).
        rate_key = f'otp_resend:{email}'
        resend_count = cache.get(rate_key, 0)
        if resend_count >= OTP_RESEND_RATE_LIMIT:
            return Response(
                {'detail': 'Too many OTP requests. Please wait before trying again.'},
                status=status.HTTP_429_TOO_MANY_REQUESTS,
            )

        try:
            user = User.objects.get(email=email, is_active=False)
        except User.DoesNotExist:
            # Silently succeed — don't reveal whether the email is registered.
            return Response(
                {'detail': 'If this email is registered and unverified, a new code has been sent.'},
                status=status.HTTP_200_OK,
            )

        try:
            generate_and_send_otp(user)
        except Exception:
            logger.exception("Failed to resend OTP to %s", email)
            return Response(
                {'detail': 'Could not send email. Please try again shortly.'},
                status=status.HTTP_503_SERVICE_UNAVAILABLE,
            )

        # Increment rate limit counter.
        cache.set(rate_key, resend_count + 1, timeout=OTP_RESEND_WINDOW)

        return Response(
            {'detail': 'A new verification code has been sent to your email.'},
            status=status.HTTP_200_OK,
        )


class CustomTokenObtainPairView(TokenObtainPairView):
    """
    POST /api/auth/token/

    Extends simplejwt's standard login endpoint to return a specific error
    code when the user's email is not yet verified, so the frontend can
    route them to the OTP entry screen instead of showing "wrong credentials".

    Returns extra field:
        { "code": "email_not_verified", "email": "...", ... }
    when credentials are valid but account is inactive (i.e. unverified).
    """

    @extend_schema(
        summary='Obtain JWT access + refresh tokens (login)',
        tags=['Auth'],
    )
    def post(self, request, *args, **kwargs):
        email = request.data.get('email', '').strip().lower()
        password = request.data.get('password', '')

        # Before deferring to simplejwt (which will return a generic 401),
        # check if the user exists and has the right password but is inactive.
        if email and password:
            try:
                user = User.objects.get(email=email)
                if not user.is_active and user.check_password(password):
                    return Response(
                        {
                            'detail': 'Please verify your email before logging in.',
                            'code': 'email_not_verified',
                            'email': email,
                        },
                        status=status.HTTP_403_FORBIDDEN,
                    )
            except User.DoesNotExist:
                pass  # Let simplejwt handle the generic "wrong credentials" case.

        return super().post(request, *args, **kwargs)


class ProfileView(generics.RetrieveUpdateAPIView):
    """
    GET  /api/auth/profile/   — return authenticated user's profile
    PATCH /api/auth/profile/  — update email, name, phone (not role)

    Uses PATCH (partial update) by default via http_method_names; PUT is also
    accepted but all fields remain optional.
    """

    serializer_class = ProfileSerializer
    permission_classes = [IsAuthenticated]

    def get_object(self):
        # Always returns the requesting user — no pk in the URL needed.
        return self.request.user


class AddressViewSet(viewsets.ModelViewSet):
    """
    CRUD for /api/auth/addresses/

    Customers manage their own delivery addresses here.
    The queryset is scoped to the current user so cross-user access is
    impossible even if an ID is guessed.

    Special behaviour: when is_default=True is set on create or update, all
    other addresses for this user are flipped to is_default=False atomically.
    """

    serializer_class = AddressSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        return Address.objects.filter(user=self.request.user).order_by('-is_default', '-created_at')

    def _enforce_single_default(self, user, exclude_pk=None):
        """
        If the address being saved is marked as default, clear the default flag
        on all other addresses belonging to this user.
        Called inside a transaction.
        """
        qs = Address.objects.filter(user=user, is_default=True)
        if exclude_pk:
            qs = qs.exclude(pk=exclude_pk)
        qs.update(is_default=False)

    def perform_create(self, serializer):
        with transaction.atomic():
            address = serializer.save(user=self.request.user)
            if address.is_default:
                self._enforce_single_default(self.request.user, exclude_pk=address.pk)

    def perform_update(self, serializer):
        with transaction.atomic():
            address = serializer.save()
            if address.is_default:
                self._enforce_single_default(self.request.user, exclude_pk=address.pk)
