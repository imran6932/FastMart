"""
Payments serializers.

CheckoutSerializer        — validates checkout request (delivery_address_id).
                            The actual order creation happens in services.py,
                            not in serializer.create(), because it involves
                            transactions, stock locking, and an external API call.

PaymentVerifySerializer   — validates the frontend payment callback:
                            razorpay_order_id, razorpay_payment_id, razorpay_signature.
                            The view performs HMAC-SHA256 signature verification
                            before trusting any of these values.
"""

from rest_framework import serializers


class CheckoutSerializer(serializers.Serializer):
    """
    POST /api/payments/checkout/

    Frontend sends the delivery address the customer selected.
    The service function picks up the cart from the database.
    """

    delivery_address_id = serializers.IntegerField()


class PaymentVerifySerializer(serializers.Serializer):
    """
    POST /api/payments/verify/

    Called by the frontend immediately after the Razorpay widget fires its
    onSuccess callback. The three fields are passed back exactly as Razorpay
    returns them — the view verifies the HMAC signature before doing anything.

    This is a secondary confirmation path. The Razorpay webhook
    (POST /api/payments/webhook/) is the primary source of truth and fires
    independently of the browser tab being open.
    """

    razorpay_order_id = serializers.CharField(max_length=100)
    razorpay_payment_id = serializers.CharField(max_length=100)
    razorpay_signature = serializers.CharField(max_length=256)
