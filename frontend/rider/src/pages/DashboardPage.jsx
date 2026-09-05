import React, { useCallback, useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { getRiderOrders, setDuty, getVapidKey, registerPushSubscription } from '../api/index'
import { useAuth } from '../contexts/AuthContext'
import { useLocationTracking } from '../contexts/LocationTrackingContext'

// Subscribe to push notifications so riders get notified of new batch assignments.
async function subscribePush() {
  if (!('PushManager' in window)) return
  const permission = await Notification.requestPermission()
  if (permission !== 'granted') return
  try {
    const sw = await navigator.serviceWorker.ready
    const { data } = await getVapidKey()
    const sub = await sw.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: data.vapid_public_key })
    await registerPushSubscription(sub)
  } catch (err) { console.warn('Push subscription failed:', err) }
}

const STATUS_COLOR = {
  assigned: 'bg-blue-100 text-blue-800',
  out_for_delivery: 'bg-yellow-100 text-yellow-800',
  delivered: 'bg-green-100 text-green-800',
}

export default function DashboardPage() {
  const { user, logout } = useAuth()
  const navigate = useNavigate()
  // isOnDuty and the location-broadcasting WebSocket live in
  // LocationTrackingProvider (mounted at the app root) so tracking keeps
  // running even when navigating away from this page (e.g. to view an
  // order's live route) — see contexts/LocationTrackingContext.jsx.
  const { isOnDuty, setIsOnDuty } = useLocationTracking()
  const [orders, setOrders] = useState([])
  const [toggling, setToggling] = useState(false)

  const fetchOrders = useCallback(() => {
    getRiderOrders().then(r => setOrders(r.data.results ?? r.data)).catch(() => {})
  }, [])

  useEffect(() => { fetchOrders() }, [fetchOrders])

  const toggleDuty = async () => {
    setToggling(true)
    try {
      const newDuty = !isOnDuty
      await setDuty(newDuty)
      setIsOnDuty(newDuty)
      if (newDuty) {
        subscribePush()
        fetchOrders()
      }
    } catch (err) {
      alert(err.response?.data?.detail || 'Could not update duty status.')
    } finally { setToggling(false) }
  }

  const handleLogout = () => { logout(); navigate('/login') }

  return (
    <div className="max-w-lg mx-auto p-4">
      {/* Header */}
      <div className="flex items-center justify-between mb-6 mt-2">
        <div>
          <h1 className="text-xl font-bold">🛵 FastMart Rider</h1>
          <p className="text-sm text-gray-500">{user?.email}</p>
        </div>
        <button onClick={handleLogout} className="text-sm text-gray-400 hover:text-gray-600">Logout</button>
      </div>

      {/* Duty toggle */}
      <div className={`rounded-xl p-5 mb-6 text-center transition-colors ${isOnDuty ? 'bg-green-50 border-2 border-green-400' : 'bg-gray-100 border-2 border-gray-300'}`}>
        <p className="text-sm font-medium text-gray-600 mb-3">
          {isOnDuty ? '🟢 You are ON DUTY — GPS tracking active' : '⚫ You are OFF DUTY'}
        </p>
        <button
          onClick={toggleDuty}
          disabled={toggling}
          className={`px-8 py-3 rounded-full font-bold text-white transition disabled:opacity-50 ${
            isOnDuty ? 'bg-red-500 hover:bg-red-600' : 'bg-green-600 hover:bg-green-700'
          }`}
        >
          {toggling ? '…' : isOnDuty ? 'Go Off Duty' : 'Go On Duty'}
        </button>
      </div>

      {/* Current batch orders */}
      <h2 className="font-semibold mb-3 text-gray-700">
        {isOnDuty ? 'Your Active Orders' : 'Last Batch'}
      </h2>

      {orders.length === 0 ? (
        <p className="text-center text-gray-400 py-10">No orders in your batch.</p>
      ) : (
        <div className="space-y-3">
          {orders.map(order => (
            <Link key={order.id} to={`/orders/${order.id}`}
              className="block bg-white rounded-xl shadow p-4 hover:shadow-md transition">
              <div className="flex justify-between items-center mb-1">
                <p className="font-semibold">Order #{order.id}</p>
                <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${STATUS_COLOR[order.status] || 'bg-gray-100 text-gray-600'}`}>
                  {order.status.replace(/_/g, ' ')}
                </span>
              </div>
              <p className="text-sm text-gray-500">{order.delivery_address_label}</p>
              <p className="text-sm font-bold mt-1">₹{order.total_display}</p>
            </Link>
          ))}
        </div>
      )}
    </div>
  )
}
