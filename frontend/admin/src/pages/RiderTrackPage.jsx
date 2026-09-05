import React, { useEffect, useRef, useState } from 'react'
import { useParams, Link } from 'react-router-dom'
import { getRiderActiveOrder, getRiders } from '../api/index'
import LiveRouteMap from '../components/LiveRouteMap'
import { createReconnectingSocket } from '../utils/reconnectingSocket'

// Admin view of a single rider's live location, and — if they're currently
// out for delivery — the live route from their warehouse to the customer.
export default function RiderTrackPage() {
  const { riderId } = useParams()
  const [order, setOrder] = useState(null)
  const [orderError, setOrderError] = useState(null)
  const [riderInfo, setRiderInfo] = useState(null)
  const [riderPosition, setRiderPosition] = useState(null)
  const wsRef = useRef(null)

  // Load the rider's basic info (email, on-duty, last known position) from the list endpoint.
  useEffect(() => {
    getRiders().then(r => {
      const found = r.data.find(x => String(x.rider_id) === String(riderId))
      setRiderInfo(found ?? null)
      if (found?.lat != null) setRiderPosition({ lat: found.lat, lng: found.lng })
    })
  }, [riderId])

  // Load the rider's current active order (route info) — 404 just means
  // "no active delivery right now", which is a normal, expected state.
  useEffect(() => {
    setOrder(null)
    setOrderError(null)
    getRiderActiveOrder(riderId)
      .then(r => setOrder(r.data))
      .catch(err => {
        if (err.response?.status === 404) setOrderError('No active delivery for this rider right now.')
        else setOrderError('Could not load active order.')
      })
  }, [riderId])

  // Connect to the rider's live location channel (admin connects read-only —
  // the backend only allows the rider themselves to send location pings).
  // Auto-reconnects on drop/server-restart (exponential backoff).
  useEffect(() => {
    const token = localStorage.getItem('access_token')
    if (!token) return

    const protocol = window.location.protocol === 'https:' ? 'wss' : 'ws'
    const backendHost = window.location.hostname === 'localhost' ? 'localhost:8000' : window.location.host
    const wsHandle = createReconnectingSocket(`${protocol}://${backendHost}/ws/riders/${riderId}/?token=${token}`, {
      onMessage: (e) => {
        const data = JSON.parse(e.data)
        if (data.type === 'rider.location') setRiderPosition({ lat: data.lat, lng: data.lng })
      },
      onError: (e) => console.error('RiderTrackPage WebSocket error:', e),
    })
    wsRef.current = wsHandle

    return () => wsHandle.close()
  }, [riderId])

  const destination = order?.delivery_address?.lat != null
    ? { lat: order.delivery_address.lat, lng: order.delivery_address.lng, label: order.delivery_address.line1 }
    : null

  return (
    <div>
      <Link to="/riders" className="text-indigo-600 text-sm mb-4 inline-block hover:underline">← Back to Riders</Link>

      <div className="flex items-center justify-between mb-4">
        <div>
          <h1 className="text-2xl font-bold">{riderInfo?.email ?? `Rider #${riderId}`}</h1>
          <p className="text-sm text-gray-500">{riderInfo?.warehouse?.name ?? ''}</p>
        </div>
        {riderInfo && (
          <span className={`text-xs px-3 py-1 rounded-full font-semibold ${
            riderInfo.is_on_duty ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-600'
          }`}>
            {riderInfo.is_on_duty ? '🟢 On Duty' : '⚫ Off Duty'}
          </span>
        )}
      </div>

      {destination ? (
        <div className="bg-white rounded-xl shadow p-4 mb-4">
          <p className="text-sm font-semibold text-gray-700 mb-2">
            🗺 Live Route — Order #{order.id} ({order.status.replace(/_/g, ' ')})
          </p>
          <LiveRouteMap
            warehouse={order.warehouse}
            destination={destination}
            riderPosition={riderPosition}
            height="60vh"
          />
        </div>
      ) : riderPosition ? (
        <div className="bg-white rounded-xl shadow p-4 mb-4">
          <p className="text-sm text-gray-500 mb-2">{orderError}</p>
          <LiveRouteMap
            warehouse={null}
            destination={null}
            riderPosition={riderPosition}
            height="60vh"
          />
        </div>
      ) : (
        <div className="bg-white rounded-xl shadow p-8 text-center text-gray-400">
          No location data available for this rider yet.
        </div>
      )}
    </div>
  )
}
