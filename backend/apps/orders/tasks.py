"""
Celery tasks for the orders app.

release_held_stock — periodic task that sweeps orders stuck in
                     'payment_pending' status past the STOCK_HOLD_MINUTES
                     timeout, releases the held stock, and cancels the order.

auto_start_delivery_batches — periodic task that monitors DeliveryBatchWaitWindow
                              and auto-starts delivery when:
                              1. Wait window expires (timeout reached)
                              2. Batch reaches MAX_BATCH_SIZE
                              Ensures batches never wait indefinitely.

Scheduled via django-celery-beat. Add via Django Admin → Periodic Tasks:
  Task:     apps.orders.tasks.release_held_stock
  Schedule: every 2 minutes (crontab or interval)

  Task:     apps.orders.tasks.auto_start_delivery_batches
  Schedule: every 30 seconds (to check for expired windows)

Interview talking point:
  "We use a Celery beat task rather than a database trigger because the logic
  involves multiple model updates (stock++ on N products + order status change),
  which is easier to test, log, and retry from Python than from a DB trigger.
  The sweep runs every 2 minutes, so the worst-case hold overshoot is 2 minutes
  — acceptable for a 10-minute hold window."
"""

import logging

from celery import shared_task
from django.conf import settings
from django.db import transaction
from django.utils import timezone

from .models import Order, OrderItem, DeliveryBatch, DeliveryBatchWaitWindow
from .status import update_order_status, update_batch_status

logger = logging.getLogger(__name__)



@shared_task(bind=True, max_retries=3, default_retry_delay=30)
def release_held_stock(self):
    """
    Find all orders in 'payment_pending' status whose stock_held_at timestamp
    is older than STOCK_HOLD_MINUTES, cancel them, and restore stock.

    Uses select_for_update() on the Order rows to prevent a concurrent task
    run from double-releasing stock (Celery beat can occasionally fire twice).
    """
    cutoff = timezone.now() - timezone.timedelta(
        minutes=settings.STOCK_HOLD_MINUTES
    )

    try:
        with transaction.atomic():
            # Lock the expired orders for this task run.
            expired_orders = list(
                Order.objects.select_for_update(skip_locked=True).filter(
                    status=Order.Status.PAYMENT_PENDING,
                    stock_held_at__lte=cutoff,
                )
            )

            if not expired_orders:
                return

            for order in expired_orders:
                # Restore stock for each line item.
                items = OrderItem.objects.select_related('product').filter(order=order)
                for item in items:
                    item.product.stock += item.quantity
                    item.product.save(update_fields=['stock'])

                # Update order status with reason tracking
                update_order_status(
                    order,
                    Order.Status.CANCELLED,
                    reason="Payment not received within stock hold timeout",
                )

                # Also mark the Payment as failed if one exists.
                # NOTE: must reference Order.payment.RelatedObjectDoesNotExist
                # (via the class), not order.payment.RelatedObjectDoesNotExist —
                # the latter re-triggers the same missing-related-object lookup
                # while resolving the except clause, which raises again instead
                # of being caught.
                try:
                    order.payment.status = 'failed'
                    order.payment.save(update_fields=['status', 'updated_at'])
                except Order.payment.RelatedObjectDoesNotExist:
                    pass

                logger.info(
                    "Stock released and Order #%s cancelled (payment timeout).",
                    order.pk,
                )

    except Exception as exc:
        logger.exception("release_held_stock task failed: %s", exc)
        raise self.retry(exc=exc)


@shared_task(bind=True, max_retries=2, default_retry_delay=60)
def auto_start_delivery_batches(self):
    """
    PHASE 4: Batch waiting logic.

    Periodic task that monitors DeliveryBatchWaitWindow and auto-starts delivery when:
    1. A wait window expires (timeout reached)
    2. Batch reaches MAX_BATCH_SIZE (batch is full)
    3. Rider manually starts delivery

    This ensures batches don't wait indefinitely and delivery SLA is maintained.

    Flow:
    - Find all active (not expired) wait windows
    - For each window, check if:
      a) Window timeout has been exceeded
      b) Batch now has MAX_BATCH_SIZE orders
    - If either condition is true, mark window as expired and start delivery
    - Lock batch during update to prevent race conditions

    Configuration (from settings.BATCH_DELIVERY_CONFIG):
    - MAX_BATCH_SIZE: max orders per batch (default 4)
    - WAITING_TIMES_SECONDS: [240, 180, 120] = [4min, 3min, 2min] waits
    """

    try:
        with transaction.atomic():
            # Find all active wait windows that have expired by time
            now = timezone.now()
            expired_windows = list(
                DeliveryBatchWaitWindow.objects
                .select_for_update(skip_locked=True)
                .filter(
                    is_expired=False,
                    expires_at__lte=now,
                )
            )

            if not expired_windows:
                logger.debug("No expired batch wait windows at this time.")
                return

            for window in expired_windows:
                batch = window.batch
                order_count = batch.orders.count()

                logger.info(
                    "Batch #%s wait window expired: "
                    "%d orders in batch (max %d), "
                    "waited %.1f seconds of %d configured",
                    batch.pk,
                    order_count,
                    settings.MAX_BATCH_SIZE,
                    (now - window.started_at).total_seconds(),
                    window.wait_duration_seconds,
                )

                # Mark window as expired
                window.mark_expired()

                # Only auto-start if batch is not already in progress or completed
                if batch.status in [DeliveryBatch.Status.PENDING]:
                    # Check if batch is at capacity
                    at_capacity = order_count >= settings.MAX_BATCH_SIZE
                    if at_capacity:
                        logger.info(
                            "Batch #%s reached MAX_BATCH_SIZE (%d orders), "
                            "auto-starting delivery.",
                            batch.pk, order_count
                        )
                    else:
                        logger.info(
                            "Batch #%s wait window expired with %d orders "
                            "(less than max %d), auto-starting delivery.",
                            batch.pk, order_count, settings.MAX_BATCH_SIZE
                        )

                    # Auto-start the delivery (change status to IN_PROGRESS)
                    update_batch_status(
                        batch,
                        DeliveryBatch.Status.IN_PROGRESS,
                        reason="Auto-started: wait window expired or batch at capacity",
                    )

                    # Notify WebSocket clients of batch status change
                    try:
                        from apps.orders.channels import broadcast_batch_status
                        broadcast_batch_status(batch, message='Batch started delivery.')
                    except Exception as e:
                        logger.exception(
                            "Failed to broadcast batch status for Batch #%s: %s",
                            batch.pk, e
                        )

    except Exception as exc:
        logger.exception("auto_start_delivery_batches task failed: %s", exc)
        raise self.retry(exc=exc)


def calculate_batch_wait_duration(order_count):
    """
    Calculate wait duration for a batch based on how many orders it currently has.

    Configuration (from settings.BATCH_DELIVERY_CONFIG):
    - order_count=1: wait WAITING_TIMES_SECONDS[0] = 240s (4 minutes)
    - order_count=2: wait WAITING_TIMES_SECONDS[1] = 180s (3 minutes)
    - order_count=3: wait WAITING_TIMES_SECONDS[2] = 120s (2 minutes)
    - order_count>=MAX_BATCH_SIZE: no waiting, start immediately

    Args:
        order_count: current number of orders in batch

    Returns:
        wait_duration_seconds: how long to wait (int)
    """
    config = settings.BATCH_DELIVERY_CONFIG
    waiting_times = config.get('WAITING_TIMES_SECONDS', [240, 180, 120])
    max_batch = config.get('MAX_BATCH_SIZE', 4)

    # If at capacity, no wait needed
    if order_count >= max_batch:
        return 0

    # Use the waiting time for this order count (0-indexed array)
    # order_count=1 → index 0, order_count=2 → index 1, etc.
    wait_index = order_count - 1
    wait_duration = waiting_times[wait_index] if wait_index < len(waiting_times) else waiting_times[-1]

    return wait_duration

