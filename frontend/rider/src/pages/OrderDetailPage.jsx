import React, { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { advanceOrderStatus, getRiderOrder } from '../api/index'
import LiveRouteMap from '../components/LiveRouteMap'

const NEXT_LABEL = {
  assigned: 'Mark Out for Delivery',
  out_for_delivery: 'Mark as Delivered',
}

export default function OrderDetailPage() {
  const { id } = useParams()
  const navigate = useNavigate()
  const [order, setOrder] = useState(null)
  const [advancing, setAdvancing] = useState(false)
  const [myPosition, setMyPosition] = useState(null)

  useEffect(() => {
    getRiderOrder(id).then(r => setOrder(r.data)).catch(() => navigate('/'))
  }, [id, navigate])

  // Track the rider's own live GPS position directly (no need to round-trip
  // through the WebSocket for their own marker — it's their own device).
  useEffect(() => {
    if (!order || !['assigned', 'out_for_delivery'].includes(order.status)) return
    if (!navigator.geolocation) return

    const watchId = navigator.geolocation.watchPosition(
      (pos) => setMyPosition({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
      (err) => console.warn('OrderDetailPage geolocation error:', err.message),
      { enableHighAccuracy: false, timeout: 10000, maximumAge: 5000 }
    )
    return () => navigator.geolocation.clearWatch(watchId)
  }, [order])

  const handleAdvance = async () => {
    setAdvancing(true)
    try {
      const res = await advanceOrderStatus(id)
      setOrder(res.data)
      if (res.data.status === 'delivered') {
        setTimeout(() => navigate('/'), 2000)
      }
    } catch (err) {
      alert(err.response?.data?.detail || 'Could not update status.')
    } finally { setAdvancing(false) }
  }

  if (!order) return <div className="text-center py-16 text-gray-400">Loading…</div>

  const canAdvance = NEXT_LABEL[order.status]

  return (
    <div className="max-w-lg mx-auto p-4">
      <button onClick={() => navigate('/')} className="text-blue-600 text-sm mb-4 hover:underline">← Back</button>

      <div className="bg-white rounded-xl shadow p-5 mb-4">
        <div className="flex justify-between items-start mb-4">
          <div>
            <h1 className="text-xl font-bold">Order #{order.id}</h1>
            <p className="text-sm text-gray-500 mt-0.5">
              Customer: {order.customer?.email || '—'}
            </p>
          </div>
          <span className={`text-xs px-3 py-1 rounded-full font-semibold ${
            order.status === 'delivered' ? 'bg-green-100 text-green-800' : 'bg-blue-100 text-blue-800'
          }`}>
            {order.status.replace(/_/g, ' ')}
          </span>
        </div>

        <div className="border-t pt-3">
          <p className="text-sm font-medium text-gray-600 mb-1">Delivery Address</p>
          <p className="text-sm">{order.delivery_address?.line1}</p>
          {order.delivery_address?.line2 && <p className="text-sm text-gray-500">{order.delivery_address.line2}</p>}
          <p className="text-sm text-gray-500">
            {order.delivery_address?.city}, {order.delivery_address?.state} – {order.delivery_address?.pincode}
          </p>
        </div>
      </div>

      {/* Live route: warehouse → customer, with your live GPS position */}
      {['assigned', 'out_for_delivery'].includes(order.status) && order.delivery_address?.lat && (
        <div className="bg-white rounded-xl shadow p-4 mb-4">
          <p className="text-sm font-semibold text-gray-700 mb-2">🗺 Live Route</p>
          <LiveRouteMap
            warehouse={order.warehouse}
            destination={{
              lat: order.delivery_address.lat,
              lng: order.delivery_address.lng,
              label: order.delivery_address.line1,
            }}
            riderPosition={myPosition}
          />
        </div>
      )}

      {/* Items */}
      <div className="bg-white rounded-xl shadow p-5 mb-4">
        <h2 className="font-semibold mb-3">Items</h2>
        <div className="space-y-2">
          {order.items?.map(item => (
            <div key={item.id} className="flex justify-between text-sm">
              <span>{item.quantity}× {item.product_name}</span>
              <span className="font-medium">₹{item.subtotal_display}</span>
            </div>
          ))}
          <div className="border-t pt-2 flex justify-between font-bold">
            <span>Total</span>
            <span>₹{order.total_display}</span>
          </div>
        </div>
      </div>

      {/* Action button */}
      {order.status === 'delivered' ? (
        <div className="bg-green-50 border border-green-300 rounded-xl p-4 text-center text-green-700 font-semibold">
          ✓ Delivered! Returning to dashboard…
        </div>
      ) : canAdvance ? (
        <button
          onClick={handleAdvance}
          disabled={advancing}
          className="w-full bg-blue-600 text-white py-3 rounded-xl font-bold text-lg hover:bg-blue-700 disabled:opacity-50 transition"
        >
          {advancing ? '…' : canAdvance}
        </button>
      ) : null}
    </div>
  )
}
