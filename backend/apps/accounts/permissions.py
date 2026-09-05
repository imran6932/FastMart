"""
Custom DRF permission classes for role-based access control.

FastMart has three roles (customer, rider, admin) stored on User.role.
These permission classes let viewsets declare exactly which role(s) can
access them, rather than scattering if/else role checks through view logic.

Usage example in a viewset:
    from apps.accounts.permissions import IsRider, IsAdminUser

    class RiderBatchViewSet(viewsets.ReadOnlyModelViewSet):
        permission_classes = [IsRider]

Combining permissions:
    permission_classes = [IsCustomer | IsAdminUser]

All classes below require authentication first (they return 403, not 200, for
anonymous requests). If you need "authenticated OR public", combine with
AllowAny using DRF's | operator.

Interview note: role checks are enforced here (application layer), not at the
database level. The DB has no row-level security. This is deliberate — it keeps
the DB schema simple and puts all access logic in one place (this file), which
is easier to audit and test.
"""

from rest_framework.permissions import BasePermission

from .models import User


class IsCustomer(BasePermission):
    """Allow access only to authenticated users with role='customer'."""

    message = "This endpoint is restricted to customers."

    def has_permission(self, request, view):
        return (
            request.user
            and request.user.is_authenticated
            and request.user.role == User.Role.CUSTOMER
        )


class IsRider(BasePermission):
    """Allow access only to authenticated users with role='rider'."""

    message = "This endpoint is restricted to riders."

    def has_permission(self, request, view):
        return (
            request.user
            and request.user.is_authenticated
            and request.user.role == User.Role.RIDER
        )


class IsAdminRole(BasePermission):
    """
    Allow access only to authenticated users with role='admin'.

    Named IsAdminRole (not IsAdminUser) to avoid shadowing DRF's built-in
    IsAdminUser which checks Django's is_staff flag instead of our role field.
    Both flags are set for admin users, but our role check is more explicit
    and less likely to be accidentally granted via Django Admin checkboxes.
    """

    message = "This endpoint is restricted to admins."

    def has_permission(self, request, view):
        return (
            request.user
            and request.user.is_authenticated
            and request.user.role == User.Role.ADMIN
        )


class IsOwnerOrAdmin(BasePermission):
    """
    Object-level permission: allow access if the requesting user owns the
    object (obj.user == request.user) OR has the admin role.

    Attach this alongside IsAuthenticated — it only runs has_object_permission,
    not has_permission, so it does not gate list views.

    Usage:
        permission_classes = [IsAuthenticated, IsOwnerOrAdmin]
    """

    message = "You do not have permission to access this resource."

    def has_object_permission(self, request, view, obj):
        if request.user.role == User.Role.ADMIN:
            return True
        # Support objects that store ownership as .user or .customer FK.
        owner = getattr(obj, 'user', None) or getattr(obj, 'customer', None)
        return owner == request.user
