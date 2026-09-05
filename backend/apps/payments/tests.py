"""
Tests for the Razorpay webhook handler and order cancellation/refund flow.

Covers the new functionality added for:
  - payment.authorized / payment.failed / refund.created / refund.processed
    webhook events (payment.captured was already covered by the original
    implementation).
  - Customer-initiated order cancellation (apps.orders.services.cancel_order)
    and the resulting Razorpay refund kick-off.

Razorpay's HTTP API is never called for real here — apps.payments.services
._get_razorpay_client is patched wherever a refund would be initiated.
"""

import hashlib
import hmac
import json
from unittest.mock import MagicMock, patch

from django.contrib.gis.geos import Point
from django.test import TestCase, override_settings
from django.urls import reverse
from rest_framework.test import APIClient

from apps.accounts.models import Address, User
from apps.orders.models import Order, OrderItem
from apps.orders.services import cancel_order
from apps.payments.models import Payment
from apps.products.models import Category, Product

WEBHOOK_SECRET = 'test-webhook-secret'


def _sign(body: bytes) -> str:
    return hmac.new(WEBHOOK_SECRET.encode(), body, hashlib.sha256).hexdigest()


@override_settings(RAZORPAY_WEBHOOK_SECRET=WEBHOOK_SECRET)
class BaseOrderPaymentTestCase(TestCase):
    def setUp(self):
        self.customer = User.objects.create_user(
            email='customer@test.com', password='pass1234', role=User.Role.CUSTOMER,
        )
        self.address = Address.objects.create(
            user=self.customer,
            line1='12 MG Road',
            city='Mumbai',
            state='MH',
            pincode='400001',
            location=Point(72.877, 19.076),
        )
        category = Category.objects.create(name='Snacks', slug='snacks')
        self.product = Product.objects.create(
            category=category, name='Chips', price=50, stock=10,
        )
        self.order = Order.objects.create(
            customer=self.customer,
            delivery_address=self.address,
            status=Order.Status.CONFIRMED,
            total=100,
        )
        OrderItem.objects.create(
            order=self.order, product=self.product, quantity=2, price_at_order=50,
        )
        self.payment = Payment.objects.create(
            order=self.order,
            amount=100,
            razorpay_order_id='order_test123',
            razorpay_payment_id='pay_test123',
            status=Payment.Status.SUCCESS,
        )


class WebhookTests(BaseOrderPaymentTestCase):
    def _post_webhook(self, payload: dict):
        body = json.dumps(payload).encode()
        return self.client.post(
            reverse('razorpay_webhook'),
            data=body,
            content_type='application/json',
            HTTP_X_RAZORPAY_SIGNATURE=_sign(body),
        )

    def test_invalid_signature_is_ignored(self):
        body = json.dumps({'event': 'payment.captured'}).encode()
        resp = self.client.post(
            reverse('razorpay_webhook'),
            data=body,
            content_type='application/json',
            HTTP_X_RAZORPAY_SIGNATURE='bogus',
        )
        self.assertEqual(resp.status_code, 200)
        self.payment.refresh_from_db()
        self.assertEqual(self.payment.status, Payment.Status.SUCCESS)  # untouched

    def test_payment_authorized_is_noop(self):
        resp = self._post_webhook({
            'event': 'payment.authorized',
            'payload': {'payment': {'entity': {'order_id': 'order_test123', 'id': 'pay_test123'}}},
        })
        self.assertEqual(resp.status_code, 200)
        self.payment.refresh_from_db()
        self.assertEqual(self.payment.status, Payment.Status.SUCCESS)

    def test_payment_failed_restores_stock_and_marks_order(self):
        # Reset payment to pending, as it would be before capture.
        self.payment.status = Payment.Status.PENDING
        self.payment.save(update_fields=['status'])
        self.order.status = Order.Status.PAYMENT_PENDING
        self.order.save(update_fields=['status'])

        stock_before = self.product.stock

        resp = self._post_webhook({
            'event': 'payment.failed',
            'payload': {'payment': {'entity': {
                'order_id': 'order_test123', 'id': 'pay_test123',
                'error_description': 'Insufficient funds',
            }}},
        })
        self.assertEqual(resp.status_code, 200)

        self.payment.refresh_from_db()
        self.order.refresh_from_db()
        self.product.refresh_from_db()

        self.assertEqual(self.payment.status, Payment.Status.FAILED)
        self.assertEqual(self.order.status, Order.Status.PAYMENT_FAILED)
        self.assertEqual(self.product.stock, stock_before + 2)

    def test_payment_failed_does_not_override_successful_payment(self):
        # Payment already succeeded — a late/retried payment.failed webhook
        # must be a no-op.
        resp = self._post_webhook({
            'event': 'payment.failed',
            'payload': {'payment': {'entity': {'order_id': 'order_test123', 'id': 'pay_test123'}}},
        })
        self.assertEqual(resp.status_code, 200)
        self.payment.refresh_from_db()
        self.order.refresh_from_db()
        self.assertEqual(self.payment.status, Payment.Status.SUCCESS)
        self.assertEqual(self.order.status, Order.Status.CONFIRMED)

    def test_refund_created_marks_refund_pending(self):
        resp = self._post_webhook({
            'event': 'refund.created',
            'payload': {'refund': {'entity': {'id': 'rfnd_abc', 'payment_id': 'pay_test123'}}},
        })
        self.assertEqual(resp.status_code, 200)
        self.payment.refresh_from_db()
        self.assertEqual(self.payment.status, Payment.Status.REFUND_PENDING)
        self.assertEqual(self.payment.razorpay_refund_id, 'rfnd_abc')

    def test_refund_processed_marks_refunded(self):
        resp = self._post_webhook({
            'event': 'refund.processed',
            'payload': {'refund': {'entity': {'id': 'rfnd_abc', 'payment_id': 'pay_test123'}}},
        })
        self.assertEqual(resp.status_code, 200)
        self.payment.refresh_from_db()
        self.assertEqual(self.payment.status, Payment.Status.REFUNDED)

    def test_refund_processed_after_refund_created_is_idempotent(self):
        self._post_webhook({
            'event': 'refund.created',
            'payload': {'refund': {'entity': {'id': 'rfnd_abc', 'payment_id': 'pay_test123'}}},
        })
        self._post_webhook({
            'event': 'refund.processed',
            'payload': {'refund': {'entity': {'id': 'rfnd_abc', 'payment_id': 'pay_test123'}}},
        })
        self.payment.refresh_from_db()
        self.assertEqual(self.payment.status, Payment.Status.REFUNDED)
        # A retried refund.processed webhook should be a safe no-op.
        resp = self._post_webhook({
            'event': 'refund.processed',
            'payload': {'refund': {'entity': {'id': 'rfnd_abc', 'payment_id': 'pay_test123'}}},
        })
        self.assertEqual(resp.status_code, 200)
        self.payment.refresh_from_db()
        self.assertEqual(self.payment.status, Payment.Status.REFUNDED)


class CancelOrderServiceTests(BaseOrderPaymentTestCase):
    @patch('apps.payments.services._get_razorpay_client')
    def test_cancel_restores_stock_and_schedules_refund(self, mock_get_client):
        mock_client = MagicMock()
        mock_client.payment.refund.return_value = {'id': 'rfnd_new'}
        mock_get_client.return_value = mock_client

        stock_before = self.product.stock

        with self.captureOnCommitCallbacks(execute=True):
            cancel_order(self.order, reason='Changed my mind', cancelled_by=self.customer)

        self.order.refresh_from_db()
        self.product.refresh_from_db()
        self.payment.refresh_from_db()

        self.assertEqual(self.order.status, Order.Status.CANCELLED)
        self.assertEqual(self.product.stock, stock_before + 2)
        mock_client.payment.refund.assert_called_once()
        self.assertEqual(self.payment.status, Payment.Status.REFUND_PENDING)
        self.assertEqual(self.payment.razorpay_refund_id, 'rfnd_new')

    def test_cancel_without_capture_just_voids_payment(self):
        self.payment.status = Payment.Status.PENDING
        self.payment.save(update_fields=['status'])
        self.order.status = Order.Status.PAYMENT_PENDING
        self.order.save(update_fields=['status'])

        with self.captureOnCommitCallbacks(execute=True):
            cancel_order(self.order, reason='No longer needed')

        self.order.refresh_from_db()
        self.payment.refresh_from_db()
        self.assertEqual(self.order.status, Order.Status.CANCELLED)
        self.assertEqual(self.payment.status, Payment.Status.FAILED)

    def test_cannot_cancel_out_for_delivery_order(self):
        self.order.status = Order.Status.OUT_FOR_DELIVERY
        self.order.save(update_fields=['status'])

        from rest_framework.exceptions import ValidationError
        with self.assertRaises(ValidationError):
            cancel_order(self.order)


class CancelOrderAPITests(BaseOrderPaymentTestCase):
    def setUp(self):
        super().setUp()
        self.client = APIClient()
        self.client.force_authenticate(user=self.customer)

    @patch('apps.payments.services._get_razorpay_client')
    def test_customer_can_cancel_own_order(self, mock_get_client):
        mock_client = MagicMock()
        mock_client.payment.refund.return_value = {'id': 'rfnd_api'}
        mock_get_client.return_value = mock_client

        with self.captureOnCommitCallbacks(execute=True):
            resp = self.client.post(f'/api/orders/{self.order.pk}/cancel/', {'reason': 'test'}, format='json')

        # The on_commit refund callback only actually runs once this block
        # exits (TestCase wraps everything in an outer transaction, so the
        # response above was serialized before the callback fired — same as
        # in production, where the HTTP response for a fast endpoint can
        # race the refund's own commit). Check the DB state afterwards.
        self.assertEqual(resp.status_code, 200)
        self.assertEqual(resp.data['status'], Order.Status.CANCELLED)
        self.payment.refresh_from_db()
        self.assertEqual(self.payment.status, Payment.Status.REFUND_PENDING)
        mock_client.payment.refund.assert_called_once()

    def test_cannot_cancel_delivered_order(self):
        self.order.status = Order.Status.DELIVERED
        self.order.save(update_fields=['status'])

        resp = self.client.post(f'/api/orders/{self.order.pk}/cancel/', {}, format='json')
        self.assertEqual(resp.status_code, 400)

    def test_cannot_cancel_someone_elses_order(self):
        other_customer = User.objects.create_user(
            email='other@test.com', password='pass1234', role=User.Role.CUSTOMER,
        )
        self.client.force_authenticate(user=other_customer)
        resp = self.client.post(f'/api/orders/{self.order.pk}/cancel/', {}, format='json')
        self.assertEqual(resp.status_code, 404)  # not in this user's queryset
