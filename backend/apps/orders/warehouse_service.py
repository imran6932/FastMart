"""
Warehouse and serviceability check functions.

find_nearest_warehouse(location_point) — Find the closest active warehouse
  serving a customer's location using PostGIS spatial queries.

check_serviceability(user, delivery_address) — Comprehensive availability check
  Determines whether a customer can order from a given location by:
  1. Finding the nearest warehouse
  2. Checking if warehouse is active
  3. Checking if warehouse has riders assigned
  4. Checking if at least one rider is currently on-duty
  
can_proceed_with_order(user, delivery_address) — Customer-facing availability
  Returns (True, warehouse) if order can proceed, or (False, reason_message)
"""

import logging

from django.conf import settings
from django.contrib.gis.measure import D
from django.contrib.gis.db.models.functions import Distance

from apps.accounts.models import Warehouse, RiderProfile
from apps.orders.models import Order

logger = logging.getLogger(__name__)


def find_nearest_warehouse(location_point):
    """
    Find the nearest active warehouse to a given location (PointField)
    within the configured service radius.
    
    Args:
        location_point: Django GIS PointField representing customer location
        
    Returns:
        Warehouse instance if found within service radius, else None
        
    Uses PostGIS Distance() to calculate closest warehouse.
    Only active warehouses within MAX_SERVICE_RADIUS_KM are considered.
    """
    try:
        # Get max service radius from settings (in km, convert to meters for D())
        max_radius_km = int(settings.MAX_SERVICE_RADIUS_KM or 15)
        
        warehouse = (
            Warehouse.objects
            .filter(is_active=True)
            .annotate(distance=Distance('location', location_point))
            .filter(distance__lte=D(km=max_radius_km))
            .order_by('distance')
            .first()
        )
        
        if warehouse:
            logger.debug(
                "Found nearest warehouse #%s (%s) at %.2f m from location (max radius: %d km)",
                warehouse.id, warehouse.name, warehouse.distance.m, max_radius_km
            )
        else:
            logger.warning(
                "No active warehouses found within %d km service radius",
                max_radius_km
            )
            
        return warehouse
    except Exception as e:
        logger.error("Error finding nearest warehouse: %s", str(e), exc_info=True)
        return None


def check_warehouse_rider_availability(warehouse):
    """
    Check if a warehouse has at least one on-duty rider available.
    
    Args:
        warehouse: Warehouse instance
        
    Returns:
        (has_riders, on_duty_count, total_riders)
        
    A warehouse is serviceable if:
    - It has at least one rider assigned
    - At least one of those riders is currently on-duty
    """
    try:
        riders = RiderProfile.objects.filter(warehouse=warehouse)
        total = riders.count()
        on_duty = riders.filter(is_on_duty=True).count()
        
        has_riders = on_duty > 0
        
        if not has_riders:
            logger.info(
                "Warehouse #%s (%s): %d riders total, %d on-duty",
                warehouse.id, warehouse.name, total, on_duty
            )
        
        return has_riders, on_duty, total
    except Exception as e:
        logger.error(
            "Error checking rider availability for warehouse #%s: %s",
            warehouse.id, str(e), exc_info=True
        )
        return False, 0, 0


def can_proceed_with_order(user, delivery_address):
    """
    Check if a customer can proceed with an order from a specific address.
    
    Comprehensive serviceability check:
    1. Validate address has location coordinates
    2. Find nearest warehouse
    3. Check warehouse is active
    4. Check warehouse has on-duty riders
    
    Args:
        user: Customer User instance
        delivery_address: Address instance with location PointField
        
    Returns:
        (can_order, warehouse_or_message)
        
        If can_order is True:
            warehouse_or_message is the Warehouse instance
        Else:
            warehouse_or_message is an error message string
    
    Used by frontend to decide whether to show "Service Unavailable" message.
    """
    
    # Validate address has coordinates
    if not delivery_address or not delivery_address.location:
        msg = "Delivery address does not have valid coordinates."
        logger.warning("Address validation failed for user #%s: %s", user.id, msg)
        return False, msg
    
    # Find nearest warehouse
    warehouse = find_nearest_warehouse(delivery_address.location)
    if not warehouse:
        msg = "Service temporarily unavailable in your area. Please try again later."
        logger.warning(
            "No serviceable warehouse found for user #%s at location %s",
            user.id, delivery_address.location
        )
        return False, msg
    
    # Check warehouse is active (should already be from find_nearest_warehouse,
    # but explicit check for safety)
    if not warehouse.is_active:
        msg = "Service temporarily unavailable in your area. Please try again later."
        logger.warning("Selected warehouse #%s is not active", warehouse.id)
        return False, msg
    
    # Check riders available
    has_riders, on_duty, total = check_warehouse_rider_availability(warehouse)
    if not has_riders:
        msg = "Service temporarily unavailable in your area. Please try again later."
        logger.info(
            "No on-duty riders for warehouse #%s; user #%s cannot proceed",
            warehouse.id, user.id
        )
        return False, msg
    
    logger.info(
        "✓ User #%s can proceed with order from warehouse #%s (%s)",
        user.id, warehouse.id, warehouse.name
    )
    
    return True, warehouse


def get_warehouse_for_order(order):
    """
    Determine which warehouse should serve an order based on delivery address.
    
    This is called during order assignment to ensure the order is assigned
    to a rider from the correct warehouse.
    
    Args:
        order: Order instance with delivery_address
        
    Returns:
        Warehouse instance or None
    """
    if not order or not order.delivery_address or not order.delivery_address.location:
        logger.error("Order #%s has invalid delivery address", order.id)
        return None
    
    warehouse = find_nearest_warehouse(order.delivery_address.location)
    if warehouse:
        logger.debug("Order #%s assigned to warehouse #%s", order.id, warehouse.id)
    return warehouse
