"""
Rider auto-assignment logic (Step 6).

assign_order(order) — called after payment is confirmed.

Flow:
  1. Get the delivery address coordinates (PostGIS Point).
  2. Find on-duty riders within RIDER_SEARCH_RADIUS_METRES using a
     PostGIS ST_DWithin spatial query — this is why we store coordinates
     as PointField instead of plain lat/lng floats (can't use a spatial
     index on plain floats).
  3. Among those riders, prefer ones who have an open DeliveryBatch with
     fewer than MAX_BATCH_SIZE orders (batch them in) over creating a new batch.
  4. If no open batch with capacity exists for a near rider, create a new batch.
  5. Link the Order to the batch, set Order.status = 'assigned'.

Interview talking point on PostGIS:
  "ST_DWithin(geography, geography, radius_in_metres) uses a GiST spatial
   index, which is O(log n) — the database doesn't scan every rider row.
   With plain FloatFields and a bounding-box approximation you'd get the
   bounding box right but still have to post-filter for actual distance,
   and you'd lose the index benefit for diagonal distances."

Interview talking point on batching:
  "We prefer filling an existing open batch before creating a new one. This
   keeps one rider busy rather than dispatching two riders for adjacent orders,
   which improves efficiency. The MAX_BATCH_SIZE cap ensures deliveries don't
   get stale — a rider with 4 orders takes longer per drop but still within
   our SLA window."
"""

import logging

from django.conf import settings
from django.contrib.gis.db.models.functions import Distance
from django.contrib.gis.measure import D
from django.db import transaction
from django.utils import timezone

from apps.accounts.models import RiderProfile
from apps.orders.warehouse_service import get_warehouse_for_order
from apps.orders.tasks import calculate_batch_wait_duration

from .models import DeliveryBatch, Order, DeliveryBatchWaitWindow
from .status import update_order_status, create_batch_status_event

logger = logging.getLogger(__name__)


@transaction.atomic
def assign_order(order: Order) -> None:
    """
    Find the nearest available rider and assign `order` to their batch.

    If no on-duty riders are within the search radius, the order stays
    'confirmed' and will be picked up on the next assignment attempt
    (e.g. a retry, a manual admin trigger, or a future periodic sweep).
    
    Key change: Orders are now assigned only to riders from the same warehouse.
    1. Determine the warehouse that should serve this order (based on delivery address)
    2. Filter riders to only those assigned to that warehouse
    3. Find nearest on-duty rider within search radius
    4. Assign to their batch or create new batch
    """

    delivery_point = order.delivery_address.location  # PostGIS Point

    # ── PHASE 3: Warehouse-aware assignment ─────────────────────────────────────
    # Determine which warehouse should serve this order
    warehouse = get_warehouse_for_order(order)
    if not warehouse:
        logger.warning(
            "No serviceable warehouse found for Order #%s at location %s",
            order.pk, delivery_point
        )
        return

    logger.info(
        "Order #%s will be served by Warehouse #%s (%s)",
        order.pk, warehouse.id, warehouse.name
    )

    # ── 1. Find on-duty riders within radius, filtered by warehouse ──────────────
    # current_location__distance_lte uses ST_DWithin under the hood with a
    # GiST spatial index — fast even with many riders.
    # KEY FILTER: warehouse=warehouse to ensure cross-warehouse assignment never occurs
    nearby_riders = (
        RiderProfile.objects
        .filter(
            warehouse=warehouse,  # ← CRITICAL: Same warehouse only
            is_on_duty=True,
            current_location__isnull=False,
            current_location__distance_lte=(
                delivery_point,
                D(m=settings.RIDER_SEARCH_RADIUS_METRES),
            ),
        )
        # Order by distance so we assign to the nearest rider first.
        # Note: GeoQuerySet.distance() was removed in Django 2.0 — the modern
        # API annotates with the Distance() function instead.
        .annotate(distance=Distance('current_location', delivery_point))
        .order_by('distance')
        .select_for_update(skip_locked=True)  # lock to avoid double-assignment races
    )

    if not nearby_riders.exists():
        logger.info(
            "No on-duty riders within %sm for Order #%s in Warehouse #%s. Will retry later.",
            settings.RIDER_SEARCH_RADIUS_METRES,
            order.pk,
            warehouse.id,
        )
        return

    # ── 2. Find a rider with an open batch that has capacity ──────────────────
    assigned_batch = None

    for rider in nearby_riders:
        # Lock candidate batches for this rider first — Postgres doesn't allow
        # SELECT ... FOR UPDATE combined with GROUP BY, so the order-count
        # annotation (which produces a GROUP BY) can't be combined with
        # select_for_update() in a single query. Lock the rows, then filter
        # by capacity in Python with a plain (non-locking) count() per batch.
        candidate_batches = list(
            DeliveryBatch.objects
            .filter(rider=rider, status=DeliveryBatch.Status.PENDING)
            .select_for_update(skip_locked=True)
        )
        open_batch = next(
            (b for b in candidate_batches if b.orders.count() < settings.MAX_BATCH_SIZE),
            None,
        )

        if open_batch:
            assigned_batch = open_batch
            break

    # ── 3. If no open batch with capacity found, create a new one ─────────────
    if assigned_batch is None:
        # Use the nearest rider (first in queryset).
        nearest_rider = nearby_riders.first()
        assigned_batch = DeliveryBatch.objects.create(
            rider=nearest_rider,
            status=DeliveryBatch.Status.PENDING,
        )
        # Create initial status event for the new batch
        create_batch_status_event(
            assigned_batch,
            DeliveryBatch.Status.PENDING,
            reason=f"New batch created for Order #{order.pk} in Warehouse #{warehouse.id}",
        )
        logger.info(
            "Created new DeliveryBatch #%s for Rider #%s in Warehouse #%s.",
            assigned_batch.pk,
            nearest_rider.pk,
            warehouse.id,
        )

    # ── 4. Assign order to the batch ──────────────────────────────────────────
    order.delivery_batch = assigned_batch
    # Persist delivery_batch explicitly — update_order_status() below only
    # writes update_fields=['status', 'updated_at'], so any other in-memory
    # changes (like this FK) would silently NOT be saved otherwise.
    order.save(update_fields=['delivery_batch', 'updated_at'])
    # Use status update helper to log the transition
    update_order_status(
        order,
        Order.Status.ASSIGNED,
        reason=f"Auto-assigned to DeliveryBatch #{assigned_batch.pk}, Rider #{assigned_batch.rider_id} in Warehouse #{warehouse.id}",
    )

    # ── PHASE 4: Create/update batch wait window ──────────────────────────────
    # When an order is assigned, start/update the batch's wait window.
    # This timer determines how long to wait before auto-starting delivery.
    order_count = assigned_batch.orders.count()
    wait_duration = calculate_batch_wait_duration(order_count)

    if wait_duration > 0:
        # Calculate expiration time
        expires_at = timezone.now() + timezone.timedelta(seconds=wait_duration)

        # Create or update the wait window
        wait_window, created = DeliveryBatchWaitWindow.objects.update_or_create(
            batch=assigned_batch,
            defaults={
                'order_count_at_assignment': order_count,
                'wait_duration_seconds': wait_duration,
                'expires_at': expires_at,
                'is_expired': False,
            }
        )

        if created:
            logger.info(
                "Created wait window for Batch #%s: %d orders, wait %d seconds",
                assigned_batch.pk, order_count, wait_duration
            )
        else:
            logger.info(
                "Updated wait window for Batch #%s: now %d orders, new wait %d seconds",
                assigned_batch.pk, order_count, wait_duration
            )
    else:
        logger.info(
            "Batch #%s reached MAX_BATCH_SIZE (%d orders), no wait window needed",
            assigned_batch.pk, order_count
        )

    logger.info(
        "Order #%s assigned to DeliveryBatch #%s (Rider #%s, Warehouse #%s).",
        order.pk,
        assigned_batch.pk,
        assigned_batch.rider_id,
        warehouse.id,
    )

    # Notify WebSocket clients that a rider has been assigned.
    try:
        from apps.orders.channels import broadcast_order_status  # noqa: PLC0415
        broadcast_order_status(order, message='Rider assigned.')
    except Exception:
        logger.exception("broadcast_order_status failed for Order #%s", order.pk)
