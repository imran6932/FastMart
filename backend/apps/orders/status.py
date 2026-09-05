"""
Status update utilities for Order and DeliveryBatch.

Provides safe status transitions with automatic audit logging.
Use these functions instead of directly setting status fields.
"""

from django.utils import timezone
from .models import Order, OrderStatusEvent, DeliveryBatch, DeliveryBatchStatusEvent


def update_order_status(order, new_status, reason="", changed_by_user=None):
    """
    Safely update Order status with automatic event logging.

    Args:
        order: Order instance
        new_status: New status value (e.g., Order.Status.DELIVERED)
        reason: Human-readable reason for change (optional)
        changed_by_user: User who triggered the change (optional, None=system)

    Returns:
        OrderStatusEvent instance

    Example:
        update_order_status(
            order,
            Order.Status.CONFIRMED,
            reason="Payment confirmed via Razorpay",
            changed_by_user=request.user
        )
    """
    old_status = order.status

    # Create the event log (BEFORE changing the actual status)
    event = OrderStatusEvent.objects.create(
        order=order,
        from_status=old_status,
        to_status=new_status,
        changed_by_user=changed_by_user,
        reason=reason,
    )

    # NOW update the actual order
    order.status = new_status
    order.save(update_fields=['status', 'updated_at'])

    return event


def create_order_status_event(order, initial_status, reason=""):
    """
    Create the initial status event for a newly created order.

    Used at order creation time to log the transition from None → initial_status.

    Args:
        order: Order instance (already saved with status set)
        initial_status: The initial status (should match order.status)
        reason: Human-readable reason (optional)

    Returns:
        OrderStatusEvent instance
    """
    event = OrderStatusEvent.objects.create(
        order=order,
        from_status=None,  # No previous status
        to_status=initial_status,
        changed_by_user=None,  # System-triggered
        reason=reason,
    )
    return event


def update_batch_status(batch, new_status, reason="", changed_by_user=None):
    """
    Safely update DeliveryBatch status with automatic event logging.

    Same pattern as update_order_status.

    Args:
        batch: DeliveryBatch instance
        new_status: New status value (e.g., DeliveryBatch.Status.COMPLETED)
        reason: Human-readable reason for change (optional)
        changed_by_user: User who triggered the change (optional, None=system)

    Returns:
        DeliveryBatchStatusEvent instance
    """
    old_status = batch.status

    event = DeliveryBatchStatusEvent.objects.create(
        batch=batch,
        from_status=old_status,
        to_status=new_status,
        changed_by_user=changed_by_user,
        reason=reason,
    )

    batch.status = new_status
    batch.save(update_fields=['status', 'updated_at'] if hasattr(batch, 'updated_at') else ['status'])

    return event


def create_batch_status_event(batch, initial_status, reason=""):
    """
    Create the initial status event for a newly created batch.

    Used at batch creation time to log the transition from None → initial_status.

    Args:
        batch: DeliveryBatch instance (already saved with status set)
        initial_status: The initial status (should match batch.status)
        reason: Human-readable reason (optional)

    Returns:
        DeliveryBatchStatusEvent instance
    """
    event = DeliveryBatchStatusEvent.objects.create(
        batch=batch,
        from_status=None,  # No previous status
        to_status=initial_status,
        changed_by_user=None,  # System-triggered
        reason=reason,
    )
    return event
