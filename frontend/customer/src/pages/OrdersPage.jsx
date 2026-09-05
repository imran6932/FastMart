import React, { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { getOrders, cancelOrder } from '../api/orders'

const STATUS_COLORS = {
  delivered: 'bg-green-100 text-green-800',
  cancelled: 'bg-red-100 text-red-700',
  payment_failed: 'bg-red-100 text-red-700',
  confirmed: 'bg-blue-100 text-blue-800',
  out_for_delivery: 'bg-yellow-100 text-yellow-800',
}

// Orders can only be self-service-cancelled before a rider has picked them
// up — matches CANCELLABLE_ORDER_STATUSES in the backend (apps/orders/services.py).
const CANCELLABLE_STATUSES = ['placed', 'payment_pending', 'confirmed', 'assigned']

export default function OrdersPage() {
  const [orders, setOrders] = useState([])
  const [loading, setLoading] = useState(true)
  const [cancellingId, setCancellingId] = useState(null)

  useEffect(() => {
    getOrders()
      .then((r) => setOrders(r.data.results ?? r.data))
      .finally(() => setLoading(false))
  }, [])

  const handleCancel = async (e, order) => {
    e.preventDefault()
    e.stopPropagation()
    if (!window.confirm(`Cancel Order #${order.id}? Any payment made will be refunded.`)) return

    setCancellingId(order.id)
    try {
      await cancelOrder(order.id, 'Cancelled by customer')
      setOrders((prev) => prev.map((o) => (o.id === order.id ? { ...o, status: 'cancelled' } : o)))
    } catch (err) {
      alert(err.response?.data?.detail || 'Could not cancel this order. Please try again.')
    } finally {
      setCancellingId(null)
    }
  }

  if (loading) return <div className="text-center py-16 text-gray-400">Loading…</div>
  if (orders.length === 0) return (
    <div className="text-center py-16">
      <p className="text-gray-500 mb-3">No orders yet.</p>
      <Link to="/" className="text-brand font-medium hover:underline">Start Shopping</Link>
    </div>
  )

  return (
    <div className="max-w-2xl mx-auto">
      <h1 className="text-2xl font-bold mb-6">My Orders</h1>
      <div className="space-y-3">
        {orders.map((order) => (
          <Link
            key={order.id}
            to={`/orders/${order.id}`}
            className="block bg-white rounded-lg shadow p-4 hover:shadow-md transition"
          >
            <div className="flex items-center justify-between mb-1">
              <p className="font-semibold">Order #{order.id}</p>
              <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${STATUS_COLORS[order.status] || 'bg-gray-100 text-gray-700'}`}>
                {order.status.replace(/_/g, ' ')}
              </span>
            </div>
            <p className="text-sm text-gray-500">{order.delivery_address_label}</p>
            <div className="flex justify-between items-center mt-2 text-sm">
              <span className="text-gray-400">{new Date(order.created_at).toLocaleDateString()}</span>
              <span className="font-bold">₹{order.total_display}</span>
            </div>
            {CANCELLABLE_STATUSES.includes(order.status) && (
              <button
                onClick={(e) => handleCancel(e, order)}
                disabled={cancellingId === order.id}
                className="mt-3 w-full text-sm font-medium text-red-600 border border-red-200 rounded-md py-1.5 hover:bg-red-50 disabled:opacity-50 transition"
              >
                {cancellingId === order.id ? 'Cancelling…' : 'Cancel Order'}
              </button>
            )}
          </Link>
        ))}
      </div>
    </div>
  )
}

