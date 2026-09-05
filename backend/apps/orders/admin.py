from django.contrib import admin
from .models import CartItem, DeliveryBatch, Order, OrderItem, OrderStatusEvent, DeliveryBatchStatusEvent


class OrderItemInline(admin.TabularInline):
    model = OrderItem
    extra = 0
    readonly_fields = ('product', 'quantity', 'price_at_order')


class OrderStatusEventInline(admin.TabularInline):
    model = OrderStatusEvent
    extra = 0
    readonly_fields = ('from_status', 'to_status', 'changed_by_user', 'reason', 'changed_at')
    can_delete = False
    ordering = ['-changed_at']


@admin.register(Order)
class OrderAdmin(admin.ModelAdmin):
    list_display = ('id', 'customer', 'status', 'total_display', 'created_at', 'delivery_batch')
    list_filter = ('status',)
    search_fields = ('customer__email', 'id')
    readonly_fields = ('created_at', 'updated_at', 'stock_held_at')
    inlines = [OrderItemInline, OrderStatusEventInline]

    @admin.display(description='Total')
    def total_display(self, obj):
        return f'₹{obj.total / 100:.2f}'


class DeliveryBatchStatusEventInline(admin.TabularInline):
    model = DeliveryBatchStatusEvent
    extra = 0
    readonly_fields = ('from_status', 'to_status', 'changed_by_user', 'reason', 'changed_at')
    can_delete = False
    ordering = ['-changed_at']


@admin.register(DeliveryBatch)
class DeliveryBatchAdmin(admin.ModelAdmin):
    list_display = ('id', 'rider', 'status', 'assigned_at', 'order_count')
    list_filter = ('status',)
    search_fields = ('rider__user__email',)
    inlines = [DeliveryBatchStatusEventInline]

    @admin.display(description='Orders')
    def order_count(self, obj):
        return obj.orders.count()


@admin.register(OrderStatusEvent)
class OrderStatusEventAdmin(admin.ModelAdmin):
    list_display = ('order_id', 'from_status', 'to_status', 'changed_by_email', 'changed_at')
    list_filter = ('to_status', 'changed_at')
    search_fields = ('order__id', 'changed_by_user__email', 'reason')
    readonly_fields = ('order', 'from_status', 'to_status', 'changed_by_user', 'reason', 'changed_at')
    can_delete = False

    @admin.display(description='Changed By')
    def changed_by_email(self, obj):
        return obj.changed_by_user.email if obj.changed_by_user else 'System'

    def has_add_permission(self, request):
        return False


@admin.register(DeliveryBatchStatusEvent)
class DeliveryBatchStatusEventAdmin(admin.ModelAdmin):
    list_display = ('batch_id', 'from_status', 'to_status', 'changed_by_email', 'changed_at')
    list_filter = ('to_status', 'changed_at')
    search_fields = ('batch__id', 'changed_by_user__email', 'reason')
    readonly_fields = ('batch', 'from_status', 'to_status', 'changed_by_user', 'reason', 'changed_at')
    can_delete = False

    @admin.display(description='Changed By')
    def changed_by_email(self, obj):
        return obj.changed_by_user.email if obj.changed_by_user else 'System'

    def has_add_permission(self, request):
        return False


@admin.register(CartItem)
class CartItemAdmin(admin.ModelAdmin):
    list_display = ('user', 'product', 'quantity', 'added_at')
    search_fields = ('user__email', 'product__name')

