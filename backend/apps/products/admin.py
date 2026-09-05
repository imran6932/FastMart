from django.contrib import admin
from .models import Category, Product


@admin.register(Category)
class CategoryAdmin(admin.ModelAdmin):
    list_display = ('name', 'slug')
    prepopulated_fields = {'slug': ('name',)}
    search_fields = ('name',)


@admin.register(Product)
class ProductAdmin(admin.ModelAdmin):
    list_display = ('name', 'category', 'price_display', 'stock', 'is_available')
    list_filter = ('category', 'is_available')
    search_fields = ('name',)
    list_editable = ('stock', 'is_available')

    @admin.display(description='Price')
    def price_display(self, obj):
        return f'₹{obj.price / 100:.2f}'
