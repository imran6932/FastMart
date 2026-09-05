"""
Accounts serializers.

RegisterSerializer   — validate + create a new User (public, no auth required).
ProfileSerializer    — read/update the authenticated user's own profile fields.
AddressSerializer    — CRUD for a customer's saved delivery addresses.
                       lat/lng floats are accepted from the client and converted
                       to a PostGIS Point before saving.

Design notes:
- Passwords are write-only and validated through Django's built-in AUTH_PASSWORD_VALIDATORS.
- `role` is read-only on ProfileSerializer — a user cannot promote themselves to admin/rider
  through this endpoint. Role changes are admin-only operations.
- Address.location is a PostGIS PointField. The API accepts {latitude, longitude} floats
  (easier for mobile clients) and converts them internally to Point(lng, lat).
  Note the coordinate order: PostGIS / GeoJSON uses (longitude, latitude).
"""

from django.contrib.auth import get_user_model
from django.contrib.auth.password_validation import validate_password
from django.contrib.gis.geos import Point
from rest_framework import serializers

from .models import Address, RiderProfile, Warehouse

User = get_user_model()


class RegisterSerializer(serializers.ModelSerializer):
    """
    POST /api/auth/register/

    Required fields: email, password.
    Optional: first_name, last_name, phone, role, warehouse_id.
    Role defaults to CUSTOMER if not specified. Valid roles: 'customer', 'rider'.
    
    warehouse_id: Required if role is 'rider'. Specifies which warehouse the rider
                  will be assigned to. On successful registration (after OTP verification),
                  a RiderProfile is automatically created with this warehouse.

    On success the user is created with is_active=False. An OTP is sent to
    their email by the view. They cannot log in until the OTP is verified.
    If role='rider', a RiderProfile is created with the provided warehouse_id
    after email verification.
    """

    password = serializers.CharField(
        write_only=True,
        required=True,
        # Run Django's built-in password validators (length, common passwords, etc.)
        validators=[validate_password],
    )

    role = serializers.ChoiceField(
        choices=[User.Role.CUSTOMER, User.Role.RIDER],
        required=False,
        default=User.Role.CUSTOMER,
        help_text="User role: 'customer' or 'rider'. Defaults to 'customer'."
    )

    warehouse_id = serializers.IntegerField(
        required=False,
        allow_null=True,
        help_text="Warehouse ID for rider registration. Required if role='rider'."
    )

    class Meta:
        model = User
        fields = ['id', 'email', 'password', 'first_name', 'last_name', 'phone', 'role', 'warehouse_id']
        read_only_fields = ['id']

    def validate(self, data):
        """Validate that warehouse_id is provided if role is rider."""
        if data.get('role') == User.Role.RIDER and not data.get('warehouse_id'):
            raise serializers.ValidationError(
                {'warehouse_id': 'warehouse_id is required for rider registration.'}
            )
        return data

    def create(self, validated_data):
        # set_password() hashes the password; never store plain text.
        # is_active=False — user cannot log in until email is verified via OTP.
        password = validated_data.pop('password')
        warehouse_id = validated_data.pop('warehouse_id', None)
        
        user = User(**validated_data)
        user.set_password(password)
        user.is_active = False   # blocked until OTP verified
        user.save()
        
        # Store warehouse_id in context so OTP verification view can use it
        # to create RiderProfile. We can't create it here because user isn't
        # activated yet.
        user._warehouse_id_for_profile = warehouse_id
        
        return user


class OTPVerifySerializer(serializers.Serializer):
    """
    POST /api/auth/verify-otp/

    Accepts the email + the 6-digit OTP the user received by email.
    Email is required (not inferred from auth) because the user has no
    JWT token yet — they haven't logged in.
    """
    email = serializers.EmailField()
    code = serializers.CharField(min_length=6, max_length=6)


class ResendOTPSerializer(serializers.Serializer):
    """
    POST /api/auth/resend-otp/

    Allows an unverified user to request a new OTP.
    Email-only — no password required; we don't confirm the password here
    to avoid leaking whether an email exists (we return the same response
    regardless of whether the email is in our system).
    """
    email = serializers.EmailField()


class ProfileSerializer(serializers.ModelSerializer):
    """
    GET/PATCH /api/auth/profile/

    `role` is exposed as read-only so the frontend can show role-specific UI,
    but it cannot be changed through this endpoint.
    
    For riders, includes `rider_profile_id` and `is_on_duty` so the frontend can:
    - Connect to WebSocket at ws/riders/<rider_profile_id>/ to send location pings
    - Persist duty status across page refreshes (is_on_duty is fetched on login)
    """

    rider_profile_id = serializers.SerializerMethodField(read_only=True)
    is_on_duty = serializers.SerializerMethodField(read_only=True)

    class Meta:
        model = User
        fields = ['id', 'email', 'first_name', 'last_name', 'phone', 'role', 'rider_profile_id', 'is_on_duty']
        read_only_fields = ['id', 'role', 'rider_profile_id', 'is_on_duty']

    def get_rider_profile_id(self, obj):
        """Return the rider's RiderProfile.id if user.role == 'rider', else None."""
        if obj.role == User.Role.RIDER and hasattr(obj, 'rider_profile'):
            return obj.rider_profile.id
        return None

    def get_is_on_duty(self, obj):
        """Return the rider's current duty status if user.role == 'rider', else None."""
        if obj.role == User.Role.RIDER and hasattr(obj, 'rider_profile'):
            return obj.rider_profile.is_on_duty
        return None

    def update(self, instance, validated_data):
        # Email change is allowed — uniqueness is enforced at model level.
        for attr, value in validated_data.items():
            setattr(instance, attr, value)
        instance.save()
        return instance


class RiderProfileSerializer(serializers.ModelSerializer):
    """
    Nested serializer used inside ProfileSerializer for rider users.
    Exposes on-duty status. Location is updated via the tracking WebSocket,
    not through this REST endpoint.
    """

    class Meta:
        model = RiderProfile
        fields = ['is_on_duty', 'current_location']
        read_only_fields = ['current_location']


class AddressSerializer(serializers.ModelSerializer):
    """
    CRUD for /api/auth/addresses/

    The client sends latitude + longitude as separate float fields.
    We convert them to a PostGIS Point before saving, and expose them
    as flat floats on read — cleaner than exposing GeoJSON to mobile clients.

    Note on coordinate order: PostGIS Point(x, y) == Point(longitude, latitude).
    """

    latitude = serializers.FloatField(write_only=True)
    longitude = serializers.FloatField(write_only=True)

    # Read-only flat lat/lng extracted from the PointField for the response.
    lat = serializers.SerializerMethodField(read_only=True)
    lng = serializers.SerializerMethodField(read_only=True)

    class Meta:
        model = Address
        fields = [
            'id', 'line1', 'line2', 'city', 'state', 'pincode',
            'latitude', 'longitude',   # write
            'lat', 'lng',              # read
            'is_default',
            'created_at', 'updated_at',
        ]
        read_only_fields = ['id', 'created_at', 'updated_at']

    def get_lat(self, obj) -> float | None:
        return obj.location.y if obj.location else None

    def get_lng(self, obj) -> float | None:
        return obj.location.x if obj.location else None

    def _build_point(self, validated_data):
        """Extract lat/lng and return a PostGIS Point, removing the raw floats."""
        latitude = validated_data.pop('latitude')
        longitude = validated_data.pop('longitude')
        # Point(x, y) → Point(longitude, latitude) in PostGIS convention.
        return Point(longitude, latitude, srid=4326)

    def create(self, validated_data):
        validated_data['location'] = self._build_point(validated_data)
        validated_data['user'] = self.context['request'].user
        return super().create(validated_data)

    def update(self, instance, validated_data):
        if 'latitude' in validated_data or 'longitude' in validated_data:
            # Both must be supplied together if either is present.
            if 'latitude' not in validated_data or 'longitude' not in validated_data:
                raise serializers.ValidationError(
                    "Provide both latitude and longitude when updating location."
                )
            validated_data['location'] = self._build_point(validated_data)
        return super().update(instance, validated_data)


class WarehouseSerializer(serializers.ModelSerializer):
    """
    Warehouse serializer for admin CRUD operations.
    
    location_point: Expected as {latitude, longitude} dict from client,
    converted to PostGIS Point(lng, lat) internally.
    """
    latitude = serializers.FloatField(write_only=True)
    longitude = serializers.FloatField(write_only=True)
    
    class Meta:
        model = Warehouse
        fields = (
            'id', 'name', 'city', 'state', 'pincode', 'is_active',
            'latitude', 'longitude', 'created_at', 'updated_at'
        )
        read_only_fields = ('id', 'created_at', 'updated_at')
    
    def _build_point(self, validated_data):
        """Extract lat/lng and return a PostGIS Point."""
        from django.contrib.gis.geos import Point
        latitude = validated_data.pop('latitude')
        longitude = validated_data.pop('longitude')
        return Point(longitude, latitude, srid=4326)
    
    def create(self, validated_data):
        validated_data['location'] = self._build_point(validated_data)
        return super().create(validated_data)
    
    def update(self, instance, validated_data):
        if 'latitude' in validated_data or 'longitude' in validated_data:
            if 'latitude' not in validated_data or 'longitude' not in validated_data:
                raise serializers.ValidationError(
                    "Provide both latitude and longitude when updating location."
                )
            validated_data['location'] = self._build_point(validated_data)
        return super().update(instance, validated_data)
    
    def to_representation(self, instance):
        """Include latitude/longitude in responses."""
        ret = super().to_representation(instance)
        if instance.location:
            ret['latitude'] = instance.location.y
            ret['longitude'] = instance.location.x
        return ret


class WarehouseListSerializer(serializers.ModelSerializer):
    """
    Lightweight warehouse serializer for list/dropdown views.
    Includes location coordinates for map display.
    """
    riders_count = serializers.SerializerMethodField()
    on_duty_riders_count = serializers.SerializerMethodField()
    latitude = serializers.SerializerMethodField()
    longitude = serializers.SerializerMethodField()
    
    class Meta:
        model = Warehouse
        fields = ('id', 'name', 'city', 'state', 'is_active', 'riders_count', 'on_duty_riders_count', 'latitude', 'longitude')
    
    def get_riders_count(self, obj):
        return obj.riders.count()
    
    def get_on_duty_riders_count(self, obj):
        return obj.riders.filter(is_on_duty=True).count()
    
    def get_latitude(self, obj):
        return obj.location.y if obj.location else None
    
    def get_longitude(self, obj):
        return obj.location.x if obj.location else None
