from django.contrib.gis.admin import GISModelAdmin
from django.contrib import admin

from apps.accounts.gis_widgets import CartoOSMWidget

from .models import LocationPing


@admin.register(LocationPing)
class LocationPingAdmin(GISModelAdmin):
    gis_widget = CartoOSMWidget
    list_display = ('rider', 'location', 'recorded_at')
    list_filter = ('rider',)
    search_fields = ('rider__user__email',)
    readonly_fields = ('recorded_at',)
    date_hierarchy = 'recorded_at'
