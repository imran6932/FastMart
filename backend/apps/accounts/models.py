"""
Accounts models: User, RiderProfile, Address, PushSubscription, Warehouse.

Key decisions:
- Single User table with a `role` field instead of three separate user tables.
  Simpler to query ("give me all riders") and simpler auth (one token endpoint).
  Role-based access is enforced in DRF permission classes, not in DB structure.
- Email as USERNAME_FIELD — Blinkit-style apps use phone/email, not usernames.
- PointField for Address.location, RiderProfile.current_location, and Warehouse.location.
  Storing coordinates as a PostGIS Point (not two FloatFields) enables
  efficient spatial queries: "find addresses within 2km" uses a GiST index
  which plain lat/lng columns cannot leverage.
- Warehouse model allows multiple warehouses per city, enabling geographic
  specialization and rider assignment based on customer location.
- RiderProfile has a foreign key to Warehouse — every rider is assigned to
  one warehouse, and only riders from the correct warehouse can serve orders.
"""

from django.contrib.auth.models import AbstractUser, BaseUserManager
from django.contrib.gis.db import models as gis_models
from django.db import models


class UserManager(BaseUserManager):
    """Custom manager because we replaced `username` with `email`."""

    def create_user(self, email, password=None, **extra_fields):
        if not email:
            raise ValueError("Email is required")
        email = self.normalize_email(email)
        user = self.model(email=email, **extra_fields)
        user.set_password(password)
        user.save(using=self._db)
        return user

    def create_superuser(self, email, password=None, **extra_fields):
        extra_fields.setdefault("is_staff", True)
        extra_fields.setdefault("is_superuser", True)
        extra_fields.setdefault("role", User.Role.ADMIN)
        return self.create_user(email, password, **extra_fields)


class User(AbstractUser):
    """
    Single user table shared by customers, riders, and admins.

    `username` is removed — email is the login identifier. This is a
    supported Django pattern: set `username = None` on AbstractUser,
    override USERNAME_FIELD, and provide a custom manager.
    """

    # Remove the username field entirely.
    username = None

    email = models.EmailField(unique=True)

    class Role(models.TextChoices):
        CUSTOMER = "customer", "Customer"
        RIDER = "rider", "Rider"
        ADMIN = "admin", "Admin"

    role = models.CharField(
        max_length=10,
        choices=Role.choices,
        # Default to customer so new signups don't need to specify a role.
        default=Role.CUSTOMER,
    )

    phone = models.CharField(max_length=15, blank=True)

    USERNAME_FIELD = "email"
    # email is already required as USERNAME_FIELD; no other fields forced at creation.
    REQUIRED_FIELDS = []

    objects = UserManager()

    def __str__(self):
        return f"{self.email} ({self.role})"

    class Meta:
        verbose_name = "User"
        verbose_name_plural = "Users"


class Warehouse(models.Model):
    """
    Warehouse/Dark Store location for inventory and rider assignment.
    
    Why Warehouse?
    ───────────────
    Multiple warehouses can serve different geographic regions of a city.
    Each warehouse has its own inventory and assigned riders. When an order
    is placed, the system finds the nearest warehouse that can serve the
    customer's delivery location, then assigns a rider from that warehouse.
    
    location (PointField):
      Stored as PostGIS geographic point (latitude, longitude). Enables
      efficient nearest-warehouse queries and distance calculations.
    
    is_active:
      Warehouses can be temporarily disabled without deletion (soft-deactivate).
      When selecting riders, only riders assigned to active warehouses are
      considered. When a rider selects a warehouse during signup, only active
      warehouses are presented.
    """
    
    name = models.CharField(
        max_length=200,
        help_text="Warehouse name, e.g., 'Downtown Hub' or 'South Warehouse'"
    )
    
    location = gis_models.PointField(
        geography=True,
        srid=4326,
        help_text="Warehouse geographic coordinates (latitude, longitude)"
    )
    
    city = models.CharField(
        max_length=100,
        help_text="City where warehouse is located"
    )
    
    state = models.CharField(
        max_length=100,
        help_text="State/Province"
    )
    
    pincode = models.CharField(
        max_length=20,
        help_text="ZIP/Postal code"
    )
    
    is_active = models.BooleanField(
        default=True,
        help_text="Only active warehouses can be assigned to new riders"
    )
    
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    
    def __str__(self):
        status = "✓" if self.is_active else "✗"
        return f"[{status}] {self.name} — {self.city}, {self.state}"
    
    class Meta:
        verbose_name = "Warehouse"
        verbose_name_plural = "Warehouses"
        ordering = ["city", "name"]
        indexes = [
            models.Index(fields=["city", "is_active"]),
            models.Index(fields=["is_active"]),
        ]



class RiderProfile(models.Model):
    """
    Extended data for users with role='rider'.

    Separated from User so the main user table stays lean.
    current_location is updated continuously while the rider is on duty
    (every few seconds via WebSocket). It is a PointField — not two FloatFields
    — because rider assignment uses a PostGIS ST_DWithin query:
      RiderProfile.objects.filter(
          is_on_duty=True,
          current_location__distance_lte=(order_point, D(m=radius))
      )
    A GiST spatial index on this column makes that query fast even with
    many on-duty riders; a pair of FloatFields would require a table scan.
    
    warehouse:
      Every rider must be assigned to a warehouse. Orders from customers
      in that warehouse's service area are preferentially assigned to this rider.
      A rider can only be assigned if the warehouse is active.
    """

    user = models.OneToOneField(
        User,
        on_delete=models.CASCADE,
        related_name="rider_profile",
    )
    
    warehouse = models.ForeignKey(
        Warehouse,
        on_delete=models.PROTECT,
        null=True,
        blank=True,
        related_name="riders",
        help_text="Warehouse this rider is assigned to. Required for order assignment."
    )
    
    is_on_duty = models.BooleanField(default=False)

    # Latest known position — updated on every location WebSocket ping.
    # Kept on the profile (not only in LocationPing history) for fast O(1)
    # lookup at assignment time. The LocationPing table stores the full trail.
    current_location = gis_models.PointField(
        geography=True,  # geography=True → distances in metres, not degrees
        null=True,
        blank=True,
        srid=4326,  # WGS-84 (standard GPS coordinate system)
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    def __str__(self):
        status = "on duty" if self.is_on_duty else "off duty"
        warehouse_info = f" @ {self.warehouse.name}" if self.warehouse else " (no warehouse)"
        return f"Rider: {self.user.email} ({status}){warehouse_info}"

    class Meta:
        verbose_name = "Rider Profile"
        verbose_name_plural = "Rider Profiles"
        indexes = [
            models.Index(fields=["warehouse", "is_on_duty"]),
        ]


class Address(models.Model):
    """
    Delivery addresses saved by customers.

    location is a PointField so we can compute driving distance from the
    nearest dark store, and (in future) do geofence checks. Storing it as
    PostGIS Point also means we can display a pin on the Leaflet map without
    any geocoding at read time.
    """

    user = models.ForeignKey(
        User,
        on_delete=models.CASCADE,
        related_name="addresses",
        limit_choices_to={"role": User.Role.CUSTOMER},
    )
    line1 = models.CharField(max_length=255)
    line2 = models.CharField(max_length=255, blank=True)
    city = models.CharField(max_length=100)
    state = models.CharField(max_length=100)
    pincode = models.CharField(max_length=10)

    # GPS coordinates of the address — set from browser geolocation or map pin drop.
    location = gis_models.PointField(
        geography=True,
        srid=4326,
    )

    is_default = models.BooleanField(default=False)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    def __str__(self):
        return f"{self.line1}, {self.city} ({self.user.email})"

    class Meta:
        verbose_name = "Address"
        verbose_name_plural = "Addresses"


class PushSubscription(models.Model):
    """
    Web Push subscription object stored after the user grants notification permission.

    The browser's Push API returns an object with endpoint + two keys (p256dh, auth).
    We store them here so the backend can send push notifications via pywebpush
    even when the user's browser tab is closed.

    One user can have multiple subscriptions (different devices/browsers).
    We keep all of them so notifications reach all their active devices.
    """

    user = models.ForeignKey(
        User,
        on_delete=models.CASCADE,
        related_name="push_subscriptions",
    )
    endpoint = models.TextField(unique=True)
    p256dh_key = models.TextField()
    auth_key = models.TextField()
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    def __str__(self):
        return f"Push subscription for {self.user.email}"

    class Meta:
        verbose_name = "Push Subscription"
        verbose_name_plural = "Push Subscriptions"


class EmailVerification(models.Model):
    """
    One-time OTP (6-digit code) sent to a user's email for account verification.

    Design decisions:
    - The code is stored hashed (same as Django passwords) so a DB leak doesn't
      expose the OTP. We call make_password(code) on save and check_password()
      on verify — the same pattern Django uses for User passwords.
    - Each new OTP request invalidates previous unused OTPs for that user
      (is_used=True) before creating a new one, preventing accumulation.
    - OTP expires after OTP_EXPIRY_MINUTES (default 10 minutes). Expiry is
      checked at verification time, not at creation time.
    - Rate limiting (max 3 requests per hour per user) is enforced in the
      view using the Django cache, not the DB, to avoid extra queries.
    - warehouse_id: For rider registration only. Temporarily stored here and used
      to create RiderProfile after email verification. Null for customer registrations.

    Interview note: "Why not store the OTP in plaintext?"
      "An OTP in transit is already sensitive — if the DB is compromised,
       a plaintext OTP could be used immediately. Hashing adds a layer of
       defence-in-depth with negligible performance cost for a 6-digit code."
    """

    user = models.ForeignKey(
        User,
        on_delete=models.CASCADE,
        related_name="email_verifications",
    )
    # Hashed OTP — never stored in plaintext.
    code_hash = models.CharField(max_length=128)
    created_at = models.DateTimeField(auto_now_add=True)
    expires_at = models.DateTimeField()
    is_used = models.BooleanField(default=False)
    
    # For rider registration: warehouse to assign after email verification
    warehouse_id = models.IntegerField(null=True, blank=True)

    def __str__(self):
        status = "used" if self.is_used else "pending"
        return f"OTP for {self.user.email} ({status})"

    class Meta:
        verbose_name = "Email Verification"
        verbose_name_plural = "Email Verifications"
        ordering = ["-created_at"]


