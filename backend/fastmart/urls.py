from django.contrib import admin
from django.urls import path, include
from drf_spectacular.views import SpectacularAPIView, SpectacularSwaggerView, SpectacularRedocView

from django.conf import settings
from django.conf.urls.static import static

urlpatterns = [
    path('admin/', admin.site.urls),

    # ── API docs (drf-spectacular) ────────────────────────────────────────────
    # GET /api/schema/          → raw OpenAPI 3.0 YAML/JSON download
    # GET /api/docs/            → Swagger UI (interactive)
    # GET /api/docs/redoc/      → ReDoc UI (read-only, cleaner layout)
    path('api/schema/', SpectacularAPIView.as_view(), name='schema'),
    path('api/docs/', SpectacularSwaggerView.as_view(url_name='schema'), name='swagger-ui'),
    path('api/docs/redoc/', SpectacularRedocView.as_view(url_name='schema'), name='redoc'),

    # Auth endpoints: /api/auth/token/, /api/auth/token/refresh/
    path('api/auth/', include('apps.accounts.urls')),

    # Domain API endpoints (wired up in later build steps)
    path('api/products/', include('apps.products.urls')),
    path('api/orders/', include('apps.orders.urls')),
    path('api/payments/', include('apps.payments.urls')),
    path('api/tracking/', include('apps.tracking.urls')),
] 

# Serve static and media files during local development
if settings.DEBUG:
    urlpatterns += static(settings.STATIC_URL, document_root=settings.STATIC_ROOT)
    urlpatterns += static(settings.MEDIA_URL, document_root=settings.MEDIA_ROOT)
