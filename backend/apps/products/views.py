"""
Products views.

CategoryViewSet  — GET /api/products/categories/          list all categories
                   GET /api/products/categories/{id}/     retrieve one
                   POST/PATCH/DELETE  — admin only
ProductViewSet   — GET /api/products/                     list (filterable)
                   GET /api/products/{id}/                retrieve one
                   POST/PATCH/DELETE  — admin only

Design decisions:
- Read operations are public (AllowAny) so the catalogue is browseable without login.
- Write operations are restricted to IsAdminRole via get_permissions().
- ProductViewSet supports filtering by category_slug via ?category=<slug>
  query param, and a simple search via ?search=<term> that checks name and
  description. These are implemented manually (no django-filter dependency)
  to keep the requirements minimal.
- is_available=True filter is applied by default so out-of-stock or
  delisted products are hidden from the listing. Pass ?show_unavailable=1
  to include them (useful for admin-like dashboards).
"""

from rest_framework import viewsets
from rest_framework.permissions import AllowAny

from apps.accounts.permissions import IsAdminRole

from .models import Category, Product
from .serializers import CategorySerializer, ProductSerializer


class CategoryViewSet(viewsets.ModelViewSet):
    """
    GET    /api/products/categories/       — list (public)
    GET    /api/products/categories/{id}/  — retrieve (public)
    POST   /api/products/categories/       — create (admin only)
    PATCH  /api/products/categories/{id}/  — update (admin only)
    DELETE /api/products/categories/{id}/  — delete (admin only)
    """

    queryset = Category.objects.all().order_by('name')
    serializer_class = CategorySerializer

    def get_permissions(self):
        if self.action in ('list', 'retrieve'):
            return [AllowAny()]
        return [IsAdminRole()]


class ProductViewSet(viewsets.ModelViewSet):
    """
    GET    /api/products/                  — list available products (public)
    GET    /api/products/{id}/             — retrieve one (public)
    POST   /api/products/                  — create (admin only)
    PATCH  /api/products/{id}/             — update (admin only)
    DELETE /api/products/{id}/             — delete (admin only)

    Filtering:
      ?category=<slug>       — filter by category slug
      ?search=<term>         — search name + description
      ?show_unavailable=1    — include unavailable items
    """

    serializer_class = ProductSerializer

    def get_permissions(self):
        if self.action in ('list', 'retrieve'):
            return [AllowAny()]
        return [IsAdminRole()]

    def get_queryset(self):
        params = self.request.query_params
        qs = Product.objects.select_related('category').all()

        # Hide unavailable products by default.
        if not params.get('show_unavailable'):
            qs = qs.filter(is_available=True)

        # Filter by category slug, e.g. ?category=dairy
        category_slug = params.get('category')
        if category_slug:
            qs = qs.filter(category__slug=category_slug)

        # Simple name/description search, e.g. ?search=milk
        search_term = params.get('search', '').strip()
        if search_term:
            qs = qs.filter(name__icontains=search_term) | qs.filter(
                description__icontains=search_term
            )

        return qs.order_by('name')
