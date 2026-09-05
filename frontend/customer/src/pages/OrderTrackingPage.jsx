import React, { useEffect, useRef, useState } from 'react'
import { useParams } from 'react-router-dom'
import { getOrder, cancelOrder } from '../api/orders'
import LiveRouteMap from '../components/LiveRouteMap'
import { createReconnectingSocket } from '../utils/reconnectingSocket'

const STATUS_LABELS = {
  placed: 'Order Placed',
  payment_pending: 'Awaiting Payment',
  confirmed: 'Confirmed — finding rider',
  assigned: 'Rider Assigned',
  out_for_delivery: 'Out for Delivery 🛵',
  delivered: 'Delivered ✓',
  cancelled: 'Cancelled',
  payment_failed: 'Payment Failed',
}

const STATUS_STEPS = ['confirmed', 'assigned', 'out_for_delivery', 'delivered']

// Orders can only be self-service-cancelled before a rider has picked them
// up — matches CANCELLABLE_ORDER_STATUSES in the backend (apps/orders/services.py).
const CANCELLABLE_STATUSES = ['placed', 'payment_pending', 'confirmed', 'assigned']

const PAYMENT_STATUS_LABELS = {
  success: null, // nothing extra to show once captured — order status covers it
  refund_pending: '💸 Refund in progress — should reflect in 5-7 business days.',
  refunded: '✅ Refund completed.',
  failed: null,
}

export default function OrderTrackingPage() {
  const { id } = useParams()
  const [order, setOrder] = useState(null)
  const [status, setStatus] = useState(null)
  const [riderLocation, setRiderLocation] = useState(null)
  const [cancelling, setCancelling] = useState(false)
  const wsRef = useRef(null)

  useEffect(() => {
    getOrder(id).then((r) => {
      setOrder(r.data)
      setStatus(r.data.status)
    })
  }, [id])

  const handleCancel = async () => {
    if (!window.confirm('Cancel this order? Any payment made will be refunded.')) return
    setCancelling(true)
    try {
      const r = await cancelOrder(id, 'Cancelled by customer')
      setOrder(r.data)
      setStatus(r.data.status)
    } catch (err) {
      alert(err.response?.data?.detail || 'Could not cancel this order. Please try again.')
    } finally {
      setCancelling(false)
    }
  }

  // Connect to WebSocket for live status updates.
  // Auto-reconnects on drop/server-restart so status/rider-location stay
  // live without requiring the user to manually refresh the page.
  useEffect(() => {
    const token = localStorage.getItem('access_token')
    if (!token) return

    const protocol = window.location.protocol === 'https:' ? 'wss' : 'ws'
    // Connect to backend (localhost:8000), not the frontend dev server's own host/port.
    const backendHost = window.location.hostname === 'localhost' ? 'localhost:8000' : window.location.host
    const wsHandle = createReconnectingSocket(`${protocol}://${backendHost}/ws/orders/${id}/?token=${token}`, {
      onMessage: (e) => {
        const data = JSON.parse(e.data)
        if (data.type === 'order.status') setStatus(data.status)
        if (data.type === 'rider.location') setRiderLocation({ lat: data.lat, lng: data.lng })
      },
    })
    wsRef.current = wsHandle

    return () => wsHandle.close()
  }, [id])

  if (!order) return <div className="text-center py-16 text-gray-400">Loading order…</div>

  const currentStep = STATUS_STEPS.indexOf(status)
  const deliveryLat = order.delivery_address?.lat ?? 19.076
  const deliveryLng = order.delivery_address?.lng ?? 72.877
  // Seed the rider marker from its last known position (returned by the API)
  // so the map isn't empty before the first live WebSocket ping arrives.
  const effectiveRiderLocation = riderLocation
    ?? (order.rider?.lat != null ? { lat: order.rider.lat, lng: order.rider.lng } : null)

  return (
    <div className="max-w-2xl mx-auto">
      <h1 className="text-2xl font-bold mb-2">Order #{order.id}</h1>
      <p className="text-gray-500 text-sm mb-6">
        {new Date(order.created_at).toLocaleString()} · ₹{order.total_display}
      </p>

      {/* Status pill */}
      <div className="mb-6 flex items-center gap-3 flex-wrap">
        <span className={`inline-block px-4 py-1.5 rounded-full font-medium text-sm ${
          status === 'delivered' ? 'bg-green-100 text-green-800' :
          status === 'cancelled' || status === 'payment_failed' ? 'bg-red-100 text-red-700' :
          'bg-blue-100 text-blue-800'
        }`}>
          {STATUS_LABELS[status] ?? status}
        </span>

        {CANCELLABLE_STATUSES.includes(status) && (
          <button
            onClick={handleCancel}
            disabled={cancelling}
            className="text-sm font-medium text-red-600 border border-red-200 rounded-full px-4 py-1.5 hover:bg-red-50 disabled:opacity-50 transition"
          >
            {cancelling ? 'Cancelling…' : 'Cancel Order'}
          </button>
        )}
      </div>

      {/* Refund status banner */}
      {PAYMENT_STATUS_LABELS[order.payment_status] && (
        <div className="mb-6 bg-amber-50 border border-amber-200 text-amber-800 text-sm rounded-lg px-4 py-3">
          {PAYMENT_STATUS_LABELS[order.payment_status]}
        </div>
      )}

      {/* Progress steps */}
      {currentStep >= 0 && (
        <div className="flex items-center gap-1 mb-6">
          {STATUS_STEPS.map((step, i) => (
            <React.Fragment key={step}>
              <div className={`flex-1 h-2 rounded-full ${i <= currentStep ? 'bg-brand' : 'bg-gray-200'}`} />
            </React.Fragment>
          ))}
        </div>
      )}

      {/* Delivery Address & Rider Details */}
      <div className="grid grid-cols-2 gap-4 mb-6">
        {/* Delivery Address */}
        {order.delivery_address && (
          <div className="bg-white rounded-lg shadow p-4">
            <h3 className="font-semibold text-sm mb-2">📍 Delivery Address</h3>
            <p className="text-sm text-gray-700">{order.delivery_address.address_line1}</p>
            {order.delivery_address.address_line2 && (
              <p className="text-sm text-gray-700">{order.delivery_address.address_line2}</p>
            )}
            <p className="text-sm text-gray-600">
              {order.delivery_address.city}, {order.delivery_address.state} {order.delivery_address.pincode}
            </p>
            {order.delivery_address.phone && (
              <p className="text-sm text-gray-600 mt-2">📞 {order.delivery_address.phone}</p>
            )}
          </div>
        )}

        {/* Rider Details */}
        {order.rider && (
          <div className="bg-white rounded-lg shadow p-4">
            <h3 className="font-semibold text-sm mb-2">🛵 Assigned Rider</h3>
            <p className="text-sm text-gray-700 font-medium">{order.rider.name}</p>
            {order.rider.phone && (
              <p className="text-sm text-gray-600 mt-2">📞 {order.rider.phone}</p>
            )}
          </div>
        )}
      </div>

      {/* Map — shown while assigned or out for delivery */}
      {['assigned', 'out_for_delivery'].includes(status) && (
        <div className="mb-6">
          <LiveRouteMap
            warehouse={order.warehouse}
            destination={{ lat: deliveryLat, lng: deliveryLng, label: 'Delivery address' }}
            riderPosition={effectiveRiderLocation}
            height="16rem"
          />
        </div>
      )}

      {/* Order items */}
      <h2 className="font-semibold mb-3">Items</h2>
      <div className="bg-white rounded-lg shadow divide-y">
        {order.items?.map((item) => (
          <div key={item.id} className="flex items-center justify-between p-3">
            <div>
              <p className="font-medium text-sm">{item.product_name}</p>
              <p className="text-xs text-gray-400">{item.quantity} × ₹{item.price_at_order_display}</p>
            </div>
            <p className="font-semibold text-sm">₹{item.subtotal_display}</p>
          </div>
        ))}
        <div className="flex justify-between p-3 font-bold">
          <span>Total</span>
          <span>₹{order.total_display}</span>
        </div>
      </div>
    </div>
  )
}
