from django.contrib import admin
from .models import Payment


@admin.register(Payment)
class PaymentAdmin(admin.ModelAdmin):
    list_display = ('order', 'amount_display', 'status', 'razorpay_order_id', 'razorpay_payment_id', 'razorpay_refund_id', 'created_at')
    list_filter = ('status',)
    search_fields = ('order__id', 'razorpay_order_id', 'razorpay_payment_id', 'razorpay_refund_id')
    readonly_fields = ('razorpay_order_id', 'razorpay_payment_id', 'razorpay_refund_id', 'created_at', 'updated_at')

    @admin.display(description='Amount')
    def amount_display(self, obj):
        return f'₹{obj.amount / 100:.2f}'
