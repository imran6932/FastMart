"""
OTP generation, storage, and email sending for email verification.

generate_and_send_otp(user) — the single entry point.
  1. Invalidates any existing unused OTPs for this user.
  2. Generates a cryptographically random 6-digit code.
  3. Hashes it with Django's password hasher before storing — same defence
     as User passwords, so a DB dump doesn't expose live OTPs.
  4. Sends a plain-text email via Django's email backend.
  5. Returns the EmailVerification instance (useful in tests to read the code).

verify_otp(user, code) — checks a submitted OTP code.
  Returns (True, None) on success, (False, error_message) on failure.
  Marks the record as is_used=True and activates the user on success.

Rate limiting is enforced at the VIEW layer (not here) using Django's cache
to avoid extra DB queries on every request.

Interview note on the hashing approach:
  "A 6-digit OTP has only 1,000,000 possible values, so brute-forcing the
   hash offline is trivial. What hashing buys you is protection against the
   common scenario where an attacker has read-only access to the DB (e.g. a
   SQL injection vulnerability). In that case they can read the hash but
   can't use it directly, and the OTP expires in 10 minutes anyway."
"""

import logging
import secrets

from django.conf import settings
from django.contrib.auth.hashers import check_password, make_password
from django.core.mail import send_mail
from django.utils import timezone

from .models import EmailVerification

logger = logging.getLogger(__name__)

OTP_EXPIRY_MINUTES = int(getattr(settings, 'OTP_EXPIRY_MINUTES', 10))
OTP_LENGTH = 6


def generate_and_send_otp(user, warehouse_id=None) -> EmailVerification:
    """
    Generate a new OTP for `user`, store it hashed, and send it by email.
    Any previously unused OTPs for this user are invalidated first.
    
    Args:
        user: The User instance to generate OTP for
        warehouse_id: Optional warehouse ID for rider registration. Used to create
                     RiderProfile after email verification.
    """
    # Invalidate all previous unused OTPs for this user.
    invalidated = EmailVerification.objects.filter(user=user, is_used=False).update(is_used=True)
    if invalidated:
        logger.info("Invalidated %d previous OTPs for user %s", invalidated, user.email)

    # Generate a zero-padded 6-digit code, e.g. "042731"
    code = str(secrets.randbelow(10 ** OTP_LENGTH)).zfill(OTP_LENGTH)
    logger.debug("Generated new OTP for user %s", user.email)

    ev = EmailVerification.objects.create(
        user=user,
        code_hash=make_password(code),
        expires_at=timezone.now() + timezone.timedelta(minutes=OTP_EXPIRY_MINUTES),
        warehouse_id=warehouse_id,
    )
    logger.debug("Created EmailVerification record for user %s", user.email)

    try:
        _send_otp_email(user, code)
        logger.info("✓ OTP successfully sent to %s (expires in %sm)", user.email, OTP_EXPIRY_MINUTES)
    except Exception as e:
        logger.error("Failed to send OTP to %s: %s", user.email, str(e), exc_info=True)
        raise
    
    return ev


def verify_otp(user, submitted_code: str):
    """
    Verify `submitted_code` against the user's latest pending OTP.

    Returns (True, None, warehouse_id) on success.
    Returns (False, error_message, None) on failure.
    warehouse_id is only returned for rider registrations, None for others.

    On success: marks the OTP as used, sets user.is_active = True.
    """
    logger.debug("Attempting OTP verification for user %s", user.email)
    
    try:
        ev = (
            EmailVerification.objects
            .filter(user=user, is_used=False)
            .latest('created_at')
        )
    except EmailVerification.DoesNotExist:
        logger.warning("⚠ No pending OTP found for user %s", user.email)
        return False, "No pending OTP found. Please request a new one.", None

    if timezone.now() > ev.expires_at:
        ev.is_used = True
        ev.save(update_fields=['is_used'])
        logger.warning("⚠ OTP expired for user %s (expired at %s)", user.email, ev.expires_at)
        return False, f"OTP has expired. Please request a new one.", None

    if not check_password(submitted_code.strip(), ev.code_hash):
        logger.warning("⚠ Invalid OTP submitted for user %s", user.email)
        return False, "Invalid OTP. Please check and try again.", None

    # Mark used and activate the user — both in one save.
    warehouse_id = ev.warehouse_id
    ev.is_used = True
    ev.save(update_fields=['is_used'])

    user.is_active = True
    user.save(update_fields=['is_active'])

    logger.info("✓ User %s successfully verified email via OTP", user.email)
    return True, None, warehouse_id


def _send_otp_email(user, code: str):
    """Send the OTP to the user's email address."""
    subject = "Your FastMart verification code"
    message = (
        f"Hi {user.first_name or user.email},\n\n"
        f"Your FastMart verification code is:\n\n"
        f"    {code}\n\n"
        f"This code expires in {OTP_EXPIRY_MINUTES} minutes.\n\n"
        f"If you didn't create a FastMart account, you can safely ignore this email.\n\n"
        f"— The FastMart Team"
    )
    logger.debug("Sending OTP email to %s", user.email)
    try:
        send_mail(
            subject=subject,
            message=message,
            from_email=settings.DEFAULT_FROM_EMAIL,
            recipient_list=[user.email],
            fail_silently=False,
        )
        logger.info("✓ OTP email sent successfully to %s", user.email)
    except Exception as e:
        logger.error("✗ Failed to send OTP email to %s: %s", user.email, str(e), exc_info=True)
        raise
