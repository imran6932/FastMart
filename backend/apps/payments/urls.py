from django.urls import path

from .views import CheckoutView, PaymentVerifyView, RazorpayWebhookView

urlpatterns = [
    # POST /api/payments/checkout/ — convert cart to order, return Razorpay order data
    path('checkout/', CheckoutView.as_view(), name='checkout'),

    # POST /api/payments/verify/  — frontend confirms payment after widget success
    path('verify/', PaymentVerifyView.as_view(), name='payment_verify'),

    # POST /api/payments/webhook/ — Razorpay server-to-server payment.captured event
    path('webhook/', RazorpayWebhookView.as_view(), name='razorpay_webhook'),
]
