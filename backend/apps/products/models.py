"""
Products models: Category, Product.

Key decisions:
- Product.stock is decremented at order creation time (before payment),
  not at payment confirmation. This prevents two concurrent checkouts from
  both seeing stock=1 and both succeeding. The decrement is done inside a
  transaction with select_for_update() row locking in the order placement
  service (see apps/orders/services.py). If payment doesn't arrive within
  STOCK_HOLD_MINUTES, Celery releases the hold by incrementing stock back
  and cancelling the order.
- price is stored on Product for display/browse. The price at the time of
  purchase is separately stored on OrderItem.price_at_order — we never
  recalculate order totals from current Product.price, because prices can
  change after the order is placed.
"""

from django.db import models


class Category(models.Model):
    name = models.CharField(max_length=100, unique=True)
    # slug for clean URLs in the customer app
    slug = models.SlugField(max_length=100, unique=True)
    image = models.ImageField(upload_to='categories/', null=True, blank=True)

    def __str__(self):
        return self.name

    class Meta:
        verbose_name = 'Category'
        verbose_name_plural = 'Categories'
        ordering = ['name']


class Product(models.Model):
    """
    A product listed on FastMart.

    stock — decremented at order creation with select_for_update() locking.
    is_available — manual on/off switch independent of stock level (e.g. for
    seasonal items or items temporarily pulled from the catalogue).
    """

    category = models.ForeignKey(
        Category,
        on_delete=models.PROTECT,  # Prevent accidental category deletion that would orphan products
        related_name='products',
    )
    name = models.CharField(max_length=255)
    description = models.TextField(blank=True)
    # price in smallest currency unit (rupees) to avoid floating-point issues.
    # Always store money as integers (rupees), display as rupees in the UI.
    price = models.PositiveIntegerField(help_text='Price in rupees')
    stock = models.PositiveIntegerField(default=0)
    image = models.ImageField(upload_to='products/', null=True, blank=True)
    is_available = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    def __str__(self):
        return f'{self.name} (₹{self.price:.2f})'

    class Meta:
        verbose_name = 'Product'
        verbose_name_plural = 'Products'
        ordering = ['name']
        indexes = [
            models.Index(fields=['category', 'is_available']),
        ]
