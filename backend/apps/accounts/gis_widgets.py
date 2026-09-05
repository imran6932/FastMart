"""
Custom GeoDjango admin map widget.

Why this exists:
  Django's default GISModelAdmin widget (OSMWidget) uses OpenLayers'
  `ol.source.OSM()`, which points at OpenStreetMap's own volunteer-run tile
  servers (tile.openstreetmap.org). Those servers now actively block many
  dev/local requests with a 403 "Access blocked — Referer is required by
  tile usage policy" page (see osm.wiki/Blocked) — they're only meant for
  light, incidental use, not for embedding in apps.

  CartoOSMWidget swaps the tile source to CARTO's free "Voyager" basemap
  CDN, which serves the same OpenStreetMap-derived cartography but is
  explicitly designed for this kind of embedding and doesn't enforce the
  same referer/rate-limit policy.
"""

from django.conf import settings
from django.contrib.gis.forms import OSMWidget


class CartoOSMWidget(OSMWidget):
    """Drop-in replacement for OSMWidget that renders CARTO tiles instead of
    OpenStreetMap's own (frequently 403-blocked) tile servers."""

    template_name = 'gis/openlayers-carto.html'

    def get_context(self, name, value, attrs):
        context = super().get_context(name, value, attrs)
        # CARTO's raster basemaps require a free API key (otherwise tiles
        # render with an "API key required" watermark) — see settings.py.
        context['carto_api_key'] = settings.CARTO_API_KEY
        return context
