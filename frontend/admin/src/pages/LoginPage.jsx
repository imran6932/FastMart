import React, { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { login, getProfile, getVapidKey, registerPushSubscription } from '../api/index'
import { useAuth } from '../contexts/AuthContext'

// Helper function to request push notification registration
async function requestPushNotification() {
  if (!('Notification' in window) || !('serviceWorker' in navigator)) {
    console.log('Push notifications not supported')
    return false
  }

  try {
    const permission = await Notification.requestPermission()
    if (permission !== 'granted') {
      console.log('Push notification permission denied')
      return false
    }

    // Ensure service worker is registered
    const registration = await navigator.serviceWorker.register('/sw.js').catch(err => {
      console.warn('Service worker registration failed:', err)
      return navigator.serviceWorker.ready
    })

    // Wait for service worker to be ready
    const sw = await navigator.serviceWorker.ready
    
    // Get VAPID key
    const { data } = await getVapidKey()
    const vapidKey = data.vapid_public_key
    
    console.log('VAPID key from server:', vapidKey.substring(0, 20) + '...')
    
    // Convert URL-safe base64 to standard base64
    const standardBase64 = vapidKey
      .replace(/-/g, '+')
      .replace(/_/g, '/')
    
    // Add padding
    const padded = standardBase64 + '='.repeat((4 - standardBase64.length % 4) % 4)
    
    console.log('Converted to standard base64')
    
    // Decode to binary
    const binaryString = atob(padded)
    const bytes = new Uint8Array(binaryString.length)
    for (let i = 0; i < binaryString.length; i++) {
      bytes[i] = binaryString.charCodeAt(i)
    }
    
    console.log('VAPID key as Uint8Array:', bytes.length, 'bytes')
    
    // Subscribe to push with the properly formatted key
    const subscription = await sw.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: bytes,
    })
    
    console.log('Push subscription successful:', subscription.endpoint.substring(0, 50) + '...')

    // Register with backend
    await registerPushSubscription(subscription)
    console.log('✅ Push notifications registered with backend')
    return true
  } catch (err) {
    console.error('Push subscription failed:', err.name, '-', err.message)
    console.error('Full error:', err)
    return false
  }
}

export default function LoginPage() {
  const { login: setAuth } = useAuth()
  const navigate = useNavigate()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [step, setStep] = useState('login') // 'login' | 'push'
  const [pushLoading, setPushLoading] = useState(false)

  const handleSubmit = async (e) => {
    e.preventDefault(); setError(''); setLoading(true)
    try {
      const res = await login(email, password)
      localStorage.setItem('access_token', res.data.access)
      const profile = await getProfile()
      if (profile.data.role !== 'admin') { localStorage.clear(); setError('Admin access only.'); return }
      setAuth(res.data.access, res.data.refresh, profile.data)
      // FEATURE 2: Show push notification registration step
      setStep('push')
    } catch { setError('Invalid credentials.') }
    finally { setLoading(false) }
  }

  const handlePushRegistration = async (register = true) => {
    if (register) {
      setPushLoading(true)
      try {
        await requestPushNotification()
      } catch (err) {
        console.warn('Push registration failed, continuing anyway')
      } finally {
        setPushLoading(false)
      }
    }
    // Mark that push registration was offered in this session
    sessionStorage.setItem('pushRegistrationDone', 'true')
    // Navigate to home whether they enabled push or not
    navigate('/products')
  }

  return (
    <div className="flex items-center justify-center min-h-screen bg-gray-900">
      <div className="bg-white rounded-xl shadow-xl p-8 w-full max-w-sm">
        {step === 'login' ? (
          <>
            <h1 className="text-2xl font-bold mb-1">FastMart Admin</h1>
            <p className="text-gray-500 text-sm mb-6">Sign in to the admin panel</p>
            {error && <div className="bg-red-50 text-red-600 border border-red-200 rounded p-3 mb-4 text-sm">{error}</div>}
            <form onSubmit={handleSubmit} className="space-y-4">
              <input type="email" required placeholder="Email" value={email} onChange={e => setEmail(e.target.value)}
                className="w-full border rounded-lg px-3 py-2.5 focus:outline-none focus:ring-2 focus:ring-indigo-500" />
              <input type="password" required placeholder="Password" value={password} onChange={e => setPassword(e.target.value)}
                className="w-full border rounded-lg px-3 py-2.5 focus:outline-none focus:ring-2 focus:ring-indigo-500" />
              <button type="submit" disabled={loading}
                className="w-full bg-indigo-600 text-white py-2.5 rounded-lg font-semibold hover:bg-indigo-700 disabled:opacity-50 transition">
                {loading ? 'Signing in…' : 'Sign In'}
              </button>
            </form>
          </>
        ) : (
          /* ── Push notification registration step ── */
          <>
            <div className="text-center mb-6">
              <div className="text-5xl mb-3">🔔</div>
              <h1 className="text-2xl font-bold mb-2">Enable Notifications</h1>
              <p className="text-gray-600 text-sm">
                Get instant alerts for warehouse updates, orders, and important system notifications.
              </p>
            </div>

            {error && <div className="bg-red-50 text-red-600 border border-red-200 rounded p-3 mb-4 text-sm">{error}</div>}

            <div className="space-y-3">
              <button
                type="button"
                onClick={() => handlePushRegistration(true)}
                disabled={pushLoading}
                className="w-full bg-indigo-600 text-white py-3 rounded-lg font-semibold hover:bg-indigo-700 disabled:opacity-50 transition flex items-center justify-center gap-2"
              >
                {pushLoading ? (
                  <>
                    <span className="animate-spin">⏳</span>
                    Setting up…
                  </>
                ) : (
                  <>
                    <span>✓</span>
                    Enable Notifications
                  </>
                )}
              </button>
              <button
                type="button"
                onClick={() => handlePushRegistration(false)}
                disabled={pushLoading}
                className="w-full border-2 border-gray-300 text-gray-700 py-3 rounded-lg font-semibold hover:bg-gray-50 disabled:opacity-50 transition"
              >
                Skip for now
              </button>
            </div>

            <p className="mt-4 text-xs text-gray-500 text-center">
              You can enable notifications anytime in your settings.
            </p>
          </>
        )}
      </div>
    </div>
  )
}
