"""
Tracking model: LocationPing.

Why two storage mechanisms for rider location?

1. RiderProfile.current_location (PointField) — the latest position.
   Updated on every WebSocket ping. Used at order assignment time:
   "find riders within 5km of this delivery address". Querying a single
   row per rider is fast; no aggregation needed.

2. LocationPing (this table) — the full history of all GPS pings.
   Used to draw the path trail on the admin map and for audit/debugging.
   Never queried for assignment — that would require MAX() or LAST() which
   is slower than a direct column read.

Keeping them separate avoids the N+1 problem in assignment:
  assignment → read RiderProfile.current_location (1 query, spatial filter)
  admin map trail → read LocationPing where rider=X (separate query)

Interview point: "Why not just look up the latest LocationPing instead of
storing current_location on RiderProfile?"
Answer: "Assignment runs on every new order. Looking up the latest ping per
rider requires either a correlated subquery or a window function. A direct
column read is O(1). The redundancy is intentional for performance."
"""

from django.db import models
from django.contrib.auth import get_user_model

User = get_user_model()


class LocationPing(models.Model):
    """
    One GPS reading from a rider's browser, stored for path history.

    Inserted on every WebSocket ping (every few seconds while on duty).
    Never updated — append-only.
    """

    from django.contrib.gis.db import models as gis_models

    rider = models.ForeignKey(
        "accounts.RiderProfile",
        on_delete=models.CASCADE,
        related_name="location_pings",
    )
    location = gis_models.PointField(
        geography=True,
        srid=4326,
    )
    recorded_at = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        return f"Ping from {self.rider} at {self.recorded_at}"

    class Meta:
        verbose_name = "Location Ping"
        verbose_name_plural = "Location Pings"
        ordering = ["-recorded_at"]
        indexes = [
            # Most common query: all pings for a rider in time order (path trail).
            models.Index(fields=["rider", "recorded_at"]),
        ]
