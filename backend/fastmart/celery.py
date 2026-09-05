"""
Celery application for FastMart.

Primary use: releasing stock holds when payment times out.

The beat schedule sweeps for unpaid orders older than STOCK_HOLD_MINUTES
and cancels them, releasing the held stock back to Product.stock. This
prevents abandoned checkouts from locking inventory indefinitely.
"""

import os
from celery import Celery

os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'fastmart.settings')

app = Celery('fastmart')

# Load config from Django settings, namespaced under CELERY_ prefix.
app.config_from_object('django.conf:settings', namespace='CELERY')

# Auto-discover tasks in each installed app's tasks.py.
app.autodiscover_tasks()
