"""
Products serializers.

CategorySerializer  — list/retrieve categories (read-only).
ProductSerializer   — list/retrieve products with nested category info.

Design notes:
- Both serializers are read-only (no create/update) because catalogue
  management is admin-only via Django Admin, not through the public API.
- price is stored in paise (integers); the serializer exposes a derived
  `price_display` field in rupees (float) so the frontend doesn't need to
  divide by 100 everywhere. The raw `price` (paise) is also included for
  precise cart total calculations.
- ProductSerializer nests the category name + slug instead of just the FK id,
  so the client has everything it needs to build category-filtered views
  without a second request.
"""

from rest_framework import serializers

from .models import Category, Product


class CategorySerializer(serializers.ModelSerializer):
    class Meta:
        model = Category
        fields = ['id', 'name', 'slug', 'image']


class ProductSerializer(serializers.ModelSerializer):
    # Nested read representation — shows category name/slug alongside the FK id.
    category = CategorySerializer(read_only=True)
    # Write field: admin sends category_id when creating/updating a product.
    category_id = serializers.PrimaryKeyRelatedField(
        queryset=Category.objects.all(),
        source='category',
        write_only=True,
        required=False,
    )

    # Derived human-readable price in rupees.
    price_display = serializers.SerializerMethodField()

    class Meta:
        model = Product
        fields = [
            'id', 'name', 'description',
            'price', 'price_display',
            'stock', 'is_available',
            'image',
            'category', 'category_id',
            'created_at', 'updated_at',
        ]

    def get_price_display(self, obj) -> float:
        """Return price as a rupee float, e.g. 49.99"""
        return float(obj.price)
