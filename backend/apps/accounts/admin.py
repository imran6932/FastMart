from django.contrib import admin
from django.contrib.auth.admin import UserAdmin as BaseUserAdmin
from django.contrib.gis.admin import GISModelAdmin

from .gis_widgets import CartoOSMWidget
from .models import User, RiderProfile, Address, PushSubscription, Warehouse


@admin.register(User)
class UserAdmin(BaseUserAdmin):
    # BaseUserAdmin expects username — override its fieldsets for our email-based model.
    ordering = ('email',)
    list_display = ('email', 'role', 'phone', 'is_active', 'is_staff', 'date_joined')
    list_filter = ('role', 'is_active', 'is_staff')
    search_fields = ('email', 'phone')

    fieldsets = (
        (None, {'fields': ('email', 'password')}),
        ('Personal info', {'fields': ('first_name', 'last_name', 'phone', 'role')}),
        ('Permissions', {'fields': ('is_active', 'is_staff', 'is_superuser', 'groups', 'user_permissions')}),
        ('Important dates', {'fields': ('last_login', 'date_joined')}),
    )
    add_fieldsets = (
        (None, {
            'classes': ('wide',),
            'fields': ('email', 'role', 'phone', 'password1', 'password2'),
        }),
    )


@admin.register(RiderProfile)
class RiderProfileAdmin(GISModelAdmin):
    # GISModelAdmin renders a map widget for PointField (CARTO tiles — see gis_widgets.py).
    gis_widget = CartoOSMWidget
    list_display = ('user', 'warehouse', 'is_on_duty', 'current_location')
    list_filter = ('is_on_duty', 'warehouse')
    search_fields = ('user__email', 'warehouse__name')
    readonly_fields = ('current_location', 'created_at', 'updated_at')
    fieldsets = (
        ('User & Warehouse', {'fields': ('user', 'warehouse')}),
        ('Status', {'fields': ('is_on_duty',)}),
        ('Location', {'fields': ('current_location',)}),
        ('Timestamps', {'fields': ('created_at', 'updated_at'), 'classes': ('collapse',)}),
    )


@admin.register(Address)
class AddressAdmin(GISModelAdmin):
    gis_widget = CartoOSMWidget
    list_display = ('user', 'line1', 'city', 'pincode', 'is_default')
    search_fields = ('user__email', 'line1', 'city', 'pincode')
    list_filter = ('city', 'is_default')


@admin.register(PushSubscription)
class PushSubscriptionAdmin(admin.ModelAdmin):
    list_display = ('user', 'created_at')
    search_fields = ('user__email', 'endpoint')
    readonly_fields = ('endpoint', 'p256dh_key', 'auth_key', 'created_at')


@admin.register(Warehouse)
class WarehouseAdmin(GISModelAdmin):
    # GISModelAdmin renders a map widget for PointField (CARTO tiles — see gis_widgets.py).
    gis_widget = CartoOSMWidget
    list_display = ('name', 'city', 'state', 'pincode', 'is_active')
    list_filter = ('city', 'is_active', 'state')
    search_fields = ('name', 'city', 'pincode')
    readonly_fields = ('created_at', 'updated_at')
    
    fieldsets = (
        ('Warehouse Info', {'fields': ('name', 'is_active')}),
        ('Location', {'fields': ('location', 'city', 'state', 'pincode')}),
        ('Timestamps', {'fields': ('created_at', 'updated_at'), 'classes': ('collapse',)}),
    )
    
    add_fieldsets = (
        ('Warehouse Info', {'fields': ('name', 'is_active')}),
        ('Location', {'fields': ('location', 'city', 'state', 'pincode')}),
    )
    
    def get_fieldsets(self, request, obj=None):
        if not obj:
            return self.add_fieldsets
        return super().get_fieldsets(request, obj)
