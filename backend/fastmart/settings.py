"""
FastMart Django settings.

Design decisions worth noting for interviews:
- AUTH_USER_MODEL: single User table with a `role` field instead of three
  separate user tables. Keeps auth simple; role-based permissions are handled
  in DRF permission classes, not at the DB level.
- PostGIS backend: enables GeoDjango PointField and ST_DWithin spatial queries
  for rider assignment. Plain lat/lng FloatFields can't do "find nearest within
  radius" efficiently without a geospatial index.
- Two Redis databases: DB 0 for Channels (WebSocket pub/sub), DB 1 for cache
  (rate limiting). Kept separate so flushing the cache doesn't drop live
  WebSocket connections.
"""

import os
from datetime import timedelta

from dotenv import load_dotenv

load_dotenv()

# ─── Core ─────────────────────────────────────────────────────────────────────

BASE_DIR = __import__('pathlib').Path(__file__).resolve().parent.parent

SECRET_KEY = os.environ['SECRET_KEY']
DEBUG = os.environ.get('DEBUG', 'False') == 'True'
ALLOWED_HOSTS = os.environ.get('ALLOWED_HOSTS', 'localhost,127.0.0.1').split(',')

# CARTO basemap tiles (used by the Django admin's GeoDjango map widgets — see
# apps/accounts/gis_widgets.py). CARTO's raster basemaps now require a free
# API key even for anonymous use (otherwise tiles render with a watermark).
# Get one at https://carto.com/basemaps/apikey/.
CARTO_API_KEY = os.environ.get('CARTO_API_KEY', '')

# ─── Applications ─────────────────────────────────────────────────────────────

INSTALLED_APPS = [
    # Django built-ins
    'django.contrib.admin',
    'django.contrib.auth',
    'django.contrib.contenttypes',
    'django.contrib.sessions',
    'django.contrib.messages',
    'django.contrib.staticfiles',

    # GeoDjango — must be listed to enable PostGIS-aware migrations and ORM.
    # Requires GEOS, GDAL, PROJ system libraries (installed in Dockerfile).
    'django.contrib.gis',

    # Third-party
    'rest_framework',
    'rest_framework_simplejwt',
    'drf_spectacular',          # OpenAPI 3.0 schema + Swagger/ReDoc UI
    'corsheaders',  # Handles Cross-Origin Resource Sharing (CORS) headers for frontend-backend communication

    # Django Channels — upgrades Django's ASGI layer to handle WebSockets.
    # Order status updates and rider location pings go through here.
    'channels',

    # Celery Beat periodic task schedule stored in DB.
    'django_celery_beat',

    # Local apps
    'apps.accounts',
    'apps.products',
    'apps.orders',
    'apps.payments',
    'apps.tracking',

    # auto-delete old media files on model update/delete
    'django_cleanup.apps.CleanupConfig',  
]

MIDDLEWARE = [
    'django.middleware.security.SecurityMiddleware',
    'django.contrib.sessions.middleware.SessionMiddleware',
    'corsheaders.middleware.CorsMiddleware',  # Must be placed above CommonMiddleware
    'django.middleware.common.CommonMiddleware', 
    'django.middleware.csrf.CsrfViewMiddleware',
    'django.contrib.auth.middleware.AuthenticationMiddleware',
    'django.contrib.messages.middleware.MessageMiddleware',
    'django.middleware.clickjacking.XFrameOptionsMiddleware',
]

ROOT_URLCONF = 'fastmart.urls'

TEMPLATES = [
    {
        'BACKEND': 'django.template.backends.django.DjangoTemplates',
        'DIRS': [],
        'APP_DIRS': True,
        'OPTIONS': {
            'context_processors': [
                'django.template.context_processors.debug',
                'django.template.context_processors.request',
                'django.contrib.auth.context_processors.auth',
                'django.contrib.messages.context_processors.messages',
            ],
        },
    },
]

# WSGI is used by Django Admin / management commands.
# WebSocket traffic goes through ASGI (asgi.py).
WSGI_APPLICATION = 'fastmart.wsgi.application'
ASGI_APPLICATION = 'fastmart.asgi.application'

# ─── Database ─────────────────────────────────────────────────────────────────
# Using the PostGIS backend instead of plain PostgreSQL backend.
# This activates Django's GeoDjango ORM extensions: PointField, distance_lte,
# ST_DWithin, etc. The database itself must have the PostGIS extension enabled
# (the postgis/postgis Docker image handles this automatically).

DATABASES = {
    'default': {
        'ENGINE': 'django.contrib.gis.db.backends.postgis',
        'NAME': os.environ['POSTGRES_DB'],
        'USER': os.environ['POSTGRES_USER'],
        'PASSWORD': os.environ['POSTGRES_PASSWORD'],
        'HOST': os.environ['POSTGRES_HOST'],
        'PORT': os.environ['POSTGRES_PORT'],
        'CONN_MAX_AGE': 60,  # reuse connections for 60s to reduce overhead
    }
}

# ─── Custom User Model ────────────────────────────────────────────────────────
# Single user table with a role field. Django requires this to be set before
# the first migration — changing it later requires a full migration reset.
AUTH_USER_MODEL = 'accounts.User'

# ─── Password validation ──────────────────────────────────────────────────────

AUTH_PASSWORD_VALIDATORS = [
    {'NAME': 'django.contrib.auth.password_validation.UserAttributeSimilarityValidator'},
    {'NAME': 'django.contrib.auth.password_validation.MinimumLengthValidator'},
    {'NAME': 'django.contrib.auth.password_validation.CommonPasswordValidator'},
    {'NAME': 'django.contrib.auth.password_validation.NumericPasswordValidator'},
]

# ─── Django REST Framework ────────────────────────────────────────────────────

REST_FRAMEWORK = {
    'DEFAULT_AUTHENTICATION_CLASSES': (
        # JWT tokens sent as "Authorization: Bearer <token>" header.
        # No sessions/cookies — stateless API that all three frontends can use.
        'rest_framework_simplejwt.authentication.JWTAuthentication',
    ),
    'DEFAULT_PERMISSION_CLASSES': (
        'rest_framework.permissions.IsAuthenticated',
    ),
    'DEFAULT_PAGINATION_CLASS': 'rest_framework.pagination.PageNumberPagination',
    'PAGE_SIZE': 20,
    # Tell drf-spectacular to use the OpenAPI 3.0 schema generator.
    'DEFAULT_SCHEMA_CLASS': 'drf_spectacular.openapi.AutoSchema',
}

# ─── drf-spectacular (OpenAPI docs) ───────────────────────────────────────────

SPECTACULAR_SETTINGS = {
    'TITLE': 'FastMart API',
    'DESCRIPTION': (
        'REST API for FastMart — A quick ecommerce delivery platform.\n\n'
        '**Auth:** All protected endpoints require `Authorization: Bearer <access_token>`.\n'
        'Obtain tokens via `POST /api/auth/token/`.\n\n'
        '**Roles:** Endpoints are role-restricted — customers, riders, and admins '
        'have separate permission classes. The role is embedded in the User model.'
    ),
    'VERSION': '1.0.0',
    'SERVE_INCLUDE_SCHEMA': False,   # hide the schema download endpoint from itself
    # Group endpoints by Django app rather than by URL prefix.
    'COMPONENT_SPLIT_REQUEST': True,
    'SORT_OPERATIONS': False,
}


# ─── CORS and CSRF configuration ─────────────────────────────────────────────
CORS_ALLOW_CREDENTIALS = True
CORS_ALLOWED_ORIGINS = os.environ.get('CORS_ALLOWED_ORIGINS', []).replace('\n', '').split(',')
CSRF_TRUSTED_ORIGINS = os.environ.get('CSRF_TRUSTED_ORIGINS', None)
if not CSRF_TRUSTED_ORIGINS:
    CSRF_TRUSTED_ORIGINS = CORS_ALLOWED_ORIGINS
else:
    CSRF_TRUSTED_ORIGINS = os.environ.get('CSRF_TRUSTED_ORIGINS', []).replace('\n', '').split(',')


# ─── JWT configuration ────────────────────────────────────────────────────────

SIMPLE_JWT = {
    'ACCESS_TOKEN_LIFETIME': timedelta(
        days=int(os.environ.get('JWT_ACCESS_TOKEN_LIFETIME_DAYS', 7))
    ),
    'REFRESH_TOKEN_LIFETIME': timedelta(
        days=int(os.environ.get('JWT_REFRESH_TOKEN_LIFETIME_DAYS', 30))
    ),
    'ROTATE_REFRESH_TOKENS': True,
    'BLACKLIST_AFTER_ROTATION': False,  # Keep simple — no token blacklist table needed
    'AUTH_HEADER_TYPES': ('Bearer',),
    'USER_ID_FIELD': 'id',
    'USER_ID_CLAIM': 'user_id',
}

# ─── Django Channels ──────────────────────────────────────────────────────────
# Redis channel layer on DB 0.
# Each WebSocket consumer joins named groups (e.g. "order_42", "rider_7") so
# broadcasts from the Django backend reach the correct connected clients.

CHANNEL_LAYERS = {
    'default': {
        'BACKEND': 'channels_redis.core.RedisChannelLayer',
        'CONFIG': {
            'hosts': [{
                'host': os.environ.get('REDIS_HOST', 'redis'),
                'port': int(os.environ.get('REDIS_PORT', 6379)),
                # channels_redis blocks on BRPOP for up to 5s (brpop_timeout) while
                # waiting for group messages. redis-py's own socket_timeout defaults
                # to 5s too, so the two race and redis-py raises a spurious
                # TimeoutError right as Redis would've returned an empty result.
                # Keep these comfortably above brpop_timeout (5s) to avoid that race.
                'socket_timeout': 20,
                'socket_connect_timeout': 20,
                'retry_on_timeout': True,
            }],
            'capacity': 1500,
            'expiry': 10,
        },
    },
}

# ─── Cache (rate limiting) ────────────────────────────────────────────────────
# Redis DB 1 — separate from Channels DB 0.
# Used for rate limiting auth and payment endpoints via Django cache.

CACHES = {
    'default': {
        'BACKEND': 'django_redis.cache.RedisCache',
        'LOCATION': (
            f"redis://{os.environ.get('REDIS_HOST', 'redis')}:"
            f"{os.environ.get('REDIS_PORT')}/1"
        ),
        'OPTIONS': {
            'CLIENT_CLASS': 'django_redis.client.DefaultClient',
        },
    }
}

# ─── Celery ───────────────────────────────────────────────────────────────────
# Broker on Redis DB 2 (separate from Channels and cache).
# Used primarily to sweep unpaid orders and release held stock after timeout.

CELERY_BROKER_URL = (
    f"redis://{os.environ.get('REDIS_HOST', 'redis')}:"
    f"{os.environ.get('REDIS_PORT')}/2"
)
CELERY_RESULT_BACKEND = CELERY_BROKER_URL
CELERY_BEAT_SCHEDULER = 'django_celery_beat.schedulers:DatabaseScheduler'

# ─── Razorpay ─────────────────────────────────────────────────────────────────
# The webhook secret is used to verify HMAC signatures on incoming webhook events.

RAZORPAY_KEY_ID = os.environ.get('RAZORPAY_KEY_ID', '')
RAZORPAY_KEY_SECRET = os.environ.get('RAZORPAY_KEY_SECRET', '')
RAZORPAY_WEBHOOK_SECRET = os.environ.get('RAZORPAY_WEBHOOK_SECRET', '')

# ─── Web Push / VAPID ─────────────────────────────────────────────────────────
# Generate keypair once: `python manage.py generate_vapid_keys`
# Public key goes to the browser (sent via API); private key stays server-side.

VAPID_PRIVATE_KEY = os.environ.get('VAPID_PRIVATE_KEY', '')
VAPID_PUBLIC_KEY = os.environ.get('VAPID_PUBLIC_KEY', '')
VAPID_CLAIMS = {'sub': os.environ.get('VAPID_CLAIMS_EMAIL', '')}

# ─── Business logic constants ─────────────────────────────────────────────────

# How long to hold stock after order placement before releasing on payment timeout.
STOCK_HOLD_MINUTES = int(os.environ.get('STOCK_HOLD_MINUTES', 10))

# Maximum radius (metres) to search for on-duty riders at assignment time.
RIDER_SEARCH_RADIUS_METRES = int(os.environ.get('RIDER_SEARCH_RADIUS_METRES', 50000))

# Maximum orders per DeliveryBatch before opening a new batch for the next rider.
MAX_BATCH_SIZE = int(os.environ.get('MAX_BATCH_SIZE', 4))

# OTP expiry in minutes for email verification.
OTP_EXPIRY_MINUTES = int(os.environ.get('OTP_EXPIRY_MINUTES', 10))

# Maximum distance (km) from warehouse to customer for delivery.
MAX_SERVICE_RADIUS_KM = int(os.environ.get('MAX_SERVICE_RADIUS_KM', 50))

# ─── Email ────────────────────────────────────────────────────────────────────
# Always uses SMTP. Set credentials in .env.
# For Gmail: enable 2FA, generate an App Password, set EMAIL_HOST_USER + EMAIL_HOST_PASSWORD.

EMAIL_BACKEND = 'django.core.mail.backends.smtp.EmailBackend'
EMAIL_HOST = os.environ.get('EMAIL_HOST', 'smtp.gmail.com')
EMAIL_PORT = int(os.environ.get('EMAIL_PORT', 587))
EMAIL_USE_TLS = os.environ.get('EMAIL_USE_TLS', 'True') == 'True'
EMAIL_HOST_USER = os.environ['EMAIL_HOST_USER']
EMAIL_HOST_PASSWORD = os.environ['EMAIL_HOST_PASSWORD']

# ─── Internationalisation ─────────────────────────────────────────────────────

LANGUAGE_CODE = 'en-us'
TIME_ZONE = 'Asia/Kolkata'
USE_I18N = True
USE_TZ = True

# ─── Static / Media ───────────────────────────────────────────────────────────

STATIC_URL = '/static/'
STATIC_ROOT = BASE_DIR / 'staticfiles'

MEDIA_URL = '/media/'
MEDIA_ROOT = BASE_DIR / 'media'

DEFAULT_AUTO_FIELD = 'django.db.models.BigAutoField'

# ─── Logging ───────────────────────────────────────────────────────────────────
# Logs are written to a dated file in the logs/ directory
from datetime import datetime

LOGS_DIR = BASE_DIR / 'logs'
LOGS_DIR.mkdir(exist_ok=True)

LOG_FILE_NAME = f"{datetime.now().strftime('%b_%d_%Y').lower()}.log"
LOG_FILE_PATH = LOGS_DIR / LOG_FILE_NAME

LOGGING = {
    'version': 1,
    'disable_existing_loggers': False,
    'formatters': {
        'verbose': {
            'format': '[{levelname}] {asctime} {name} {funcName}:{lineno} - {message}',
            'style': '{',
            'datefmt': '%Y-%m-%d %H:%M:%S',
        },
        'simple': {
            'format': '[{levelname}] {asctime} - {message}',
            'style': '{',
            'datefmt': '%Y-%m-%d %H:%M:%S',
        },
    },
    'handlers': {
        'file': {
            'level': 'DEBUG',
            'class': 'logging.handlers.RotatingFileHandler',
            'filename': str(LOG_FILE_PATH),
            'maxBytes': 20 * 1024 * 1024,  # 20 MB
            'backupCount': 30,  # Keep 30 backup files
            'formatter': 'verbose',
            'encoding': 'utf-8',
        },
        'console': {
            'level': 'INFO',
            'class': 'logging.StreamHandler',
            'formatter': 'simple',
        },
    },
    'loggers': {
        'django': {
            'handlers': ['file', 'console'],
            'level': 'INFO',
            'propagate': False,
        },
        'django.request': {
            'handlers': ['file', 'console'],
            'level': 'INFO',
            'propagate': False,
        },
        'fastmart': {
            'handlers': ['file', 'console'],
            'level': 'INFO',
            'propagate': False,
        },
        'apps': {
            'handlers': ['file', 'console'],
            'level': 'INFO',
            'propagate': False,
        },
    },
}


# ─── Rider Batch Assignment Configuration ──────────────────────────────────
# Configuration for batch delivery waiting logic.

BATCH_DELIVERY_CONFIG = {
    "MAX_BATCH_SIZE": int(os.environ.get('MAX_BATCH_SIZE', 4)),
    "WAITING_TIMES_SECONDS": [
        int(t) for t in os.environ.get('BATCH_WAITING_TIMES_SECONDS', '240,180,120').split(',')
    ],
    "RIDER_SEARCH_RADIUS_METRES": int(os.environ.get('RIDER_SEARCH_RADIUS_METRES', 50000)),
}

