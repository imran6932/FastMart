"""
Web Push notification helper using pywebpush.

send_push_notification(user, title, body, data) — send a push to all of a
user's registered browser subscriptions.

Called from order status change events. If a subscription is expired/gone,
the endpoint returns 410 Gone — we delete that subscription silently.

Interview note: push notifications work even when the browser tab is closed
because the browser's push service (FCM/Mozilla) holds the message and
wakes the service worker when the device comes online. The service worker's
`push` event listener then shows the OS notification.
"""

import logging

from django.conf import settings
from pywebpush import WebPushException, webpush

from apps.accounts.models import PushSubscription

logger = logging.getLogger(__name__)


def send_push_notification(user, title: str, body: str, data: dict = None):
    """
    Send a Web Push notification to every registered device for `user`.

    Silently skips if VAPID keys are not configured (e.g. in tests).
    Deletes stale subscriptions that return 410 Gone.
    """
    if not settings.VAPID_PRIVATE_KEY or not settings.VAPID_PUBLIC_KEY:
        logger.debug("VAPID keys not configured — skipping push notification.")
        return

    subscriptions = PushSubscription.objects.filter(user=user)
    if not subscriptions.exists():
        return

    payload = {"title": title, "body": body}
    if data:
        payload["data"] = data

    import json
    payload_str = json.dumps(payload)

    stale_ids = []
    for sub in subscriptions:
        try:
            webpush(
                subscription_info={
                    "endpoint": sub.endpoint,
                    "keys": {
                        "p256dh": sub.p256dh_key,
                        "auth": sub.auth_key,
                    },
                },
                data=payload_str,
                vapid_private_key=settings.VAPID_PRIVATE_KEY,
                vapid_claims=settings.VAPID_CLAIMS,
            )
        except WebPushException as exc:
            # 410 Gone means the subscription was revoked by the user or browser.
            if exc.response is not None and exc.response.status_code == 410:
                logger.info("Removing stale push subscription %s for user %s", sub.pk, user.pk)
                stale_ids.append(sub.pk)
            else:
                logger.exception("Push notification failed for sub %s: %s", sub.pk, exc)

    if stale_ids:
        PushSubscription.objects.filter(pk__in=stale_ids).delete()
