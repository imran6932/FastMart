# Expose the Celery app here so `celery -A fastmart` discovers it automatically.
from .celery import app as celery_app  # noqa: F401

__all__ = ('celery_app',)
