import React, { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import axios from 'axios'
import { getProfile, getVapidKey, registerPushSubscription, getAddresses } from '../api/auth'
import { checkServiceability } from '../api/payments'
import { useAuth } from '../contexts/AuthContext'
import { persistServiceability } from '../utils/serviceability'

// Separate API calls (no auth token needed — these are public endpoints)
const client = axios.create({ baseURL: import.meta.env.VITE_BACKEND_URL, headers: { 'Content-Type': 'application/json' } })
const registerApi = (data) => client.post('/auth/register/', data)
const verifyOtpApi = (email, code) => client.post('/auth/verify-otp/', { email, code })
const resendOtpApi = (email) => client.post('/auth/resend-otp/', { email })

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

export default function RegisterPage() {
  const { login: setAuth } = useAuth()
  const navigate = useNavigate()

  // Step 1: registration form
  const [form, setForm] = useState({ email: '', password: '', first_name: '', last_name: '', phone: '' })
  // Step 2: OTP entry
  // Step 3: Push notification
  const [step, setStep] = useState('register')   // 'register' | 'otp' | 'push'
  const [registeredEmail, setRegisteredEmail] = useState('')
  const [otp, setOtp] = useState('')

  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [pushLoading, setPushLoading] = useState(false)

  const set = (field) => (e) => setForm((f) => ({ ...f, [field]: e.target.value }))

  // ── Step 1: Submit registration ──────────────────────────────────────────
  const handleRegister = async (e) => {
    e.preventDefault(); setError(''); setLoading(true)
    try {
      await registerApi(form)
      setRegisteredEmail(form.email)
      setStep('otp')
      setSuccess(`We sent a 6-digit code to ${form.email}. Check your inbox.`)
    } catch (err) {
      const d = err.response?.data
      if (typeof d === 'object') setError(Object.values(d).flat().join(' '))
      else setError('Registration failed. Please try again.')
    } finally { setLoading(false) }
  }

  // ── Step 2: Submit OTP ───────────────────────────────────────────────────
  const handleVerify = async (e) => {
    e.preventDefault(); setError(''); setLoading(true)
    try {
      const res = await verifyOtpApi(registeredEmail, otp.trim())
      // verify-otp returns tokens on success — auto-login the user.
      localStorage.setItem('access_token', res.data.access)
      const profile = await getProfile()
      // Check serviceability BEFORE setting auth, so cache is ready when LocationContext mounts
      await checkPostAuthServiceability()
      // Now set auth, which will trigger LocationContext's useEffect with cache already populated
      setAuth(res.data.access, res.data.refresh, profile.data)
      // FEATURE 2: Show push notification registration step after signup
      setStep('push')
    } catch (err) {
      setError(err.response?.data?.detail || 'Invalid or expired code.')
    } finally { setLoading(false) }
  }

  const handlePushRegistration = async (register = true) => {
    if (register) {
      setPushLoading(true)
      try {
        await requestPushNotification()
        setSuccess('Push notifications enabled!')
      } catch (err) {
        console.warn('Push registration failed, continuing anyway')
      } finally {
        setPushLoading(false)
      }
    }
    // Mark that push registration was offered in this session
    sessionStorage.setItem('pushRegistrationDone', 'true')
    // Navigate to home whether they enabled push or not
    navigate('/')
  }

  // Helper function to check serviceability after signup
  const checkPostAuthServiceability = async () => {
    try {
      const { data: addressesData } = await getAddresses()
      // Handle both array and paginated response formats
      const addresses = (addressesData?.results ?? addressesData) || []
      
      if (!Array.isArray(addresses) || addresses.length === 0) {
        console.log('No saved addresses yet - will prompt on home')
        return
      }

      const defaultAddress = addresses.find((addr) => addr.is_default) || addresses[0]
      if (defaultAddress) {
        const { data: serviceData } = await checkServiceability(defaultAddress.id)
        
        // Cache the result so LocationContext can use it immediately
        persistServiceability(defaultAddress.id, serviceData.can_proceed, serviceData.message)
        console.log('Post-auth serviceability cached:', serviceData.can_proceed ? 'available' : 'unavailable')
      }
    } catch (err) {
      console.error('Post-auth serviceability check failed:', err)
    }
  }

  // ── Step 2: Resend OTP ───────────────────────────────────────────────────
  const handleResend = async () => {
    setError(''); setSuccess(''); setLoading(true)
    try {
      await resendOtpApi(registeredEmail)
      setSuccess('A new code has been sent to your email.')
      setOtp('')
    } catch (err) {
      if (err.response?.status === 429) setError('Too many requests. Please wait a while.')
      else setError('Could not resend. Please try again.')
    } finally { setLoading(false) }
  }

  // ── Render ───────────────────────────────────────────────────────────────
  return (
    <div className="max-w-sm mx-auto mt-12">
      {step === 'register' ? (
        <>
          <h1 className="text-2xl font-bold mb-6">Create Account</h1>
          {error && <div className="bg-red-50 text-red-700 border border-red-200 rounded p-3 mb-4 text-sm">{error}</div>}
          <form onSubmit={handleRegister} className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-sm font-medium mb-1">First name</label>
                <input type="text" value={form.first_name} onChange={set('first_name')}
                  className="w-full border rounded px-3 py-2 focus:outline-none focus:ring-2 focus:ring-brand" />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Last name</label>
                <input type="text" value={form.last_name} onChange={set('last_name')}
                  className="w-full border rounded px-3 py-2 focus:outline-none focus:ring-2 focus:ring-brand" />
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Email</label>
              <input type="email" required value={form.email} onChange={set('email')}
                className="w-full border rounded px-3 py-2 focus:outline-none focus:ring-2 focus:ring-brand" />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Phone</label>
              <input type="tel" value={form.phone} onChange={set('phone')}
                className="w-full border rounded px-3 py-2 focus:outline-none focus:ring-2 focus:ring-brand" />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Password</label>
              <input type="password" required value={form.password} onChange={set('password')}
                className="w-full border rounded px-3 py-2 focus:outline-none focus:ring-2 focus:ring-brand" />
            </div>
            <button type="submit" disabled={loading}
              className="w-full bg-brand text-white py-2 rounded font-medium hover:bg-brand-dark disabled:opacity-50 transition">
              {loading ? 'Creating account…' : 'Create Account'}
            </button>
          </form>
          <p className="mt-4 text-sm text-center text-gray-500">
            Already have an account? <Link to="/login" className="text-brand font-medium">Sign In</Link>
          </p>
        </>
      ) : step === 'otp' ? (
        /* ── OTP verification step ── */
        <>
          <div className="text-center mb-6">
            <div className="text-4xl mb-3">📧</div>
            <h1 className="text-2xl font-bold mb-1">Check your email</h1>
            <p className="text-gray-500 text-sm">
              We sent a 6-digit verification code to<br />
              <span className="font-medium text-gray-700">{registeredEmail}</span>
            </p>
          </div>

          {error && <div className="bg-red-50 text-red-700 border border-red-200 rounded p-3 mb-4 text-sm">{error}</div>}
          {success && <div className="bg-green-50 text-green-700 border border-green-200 rounded p-3 mb-4 text-sm">{success}</div>}

          <form onSubmit={handleVerify} className="space-y-4">
            <div>
              <label className="block text-sm font-medium mb-1 text-center">Enter 6-digit code</label>
              <input
                type="text"
                inputMode="numeric"
                pattern="[0-9]{6}"
                maxLength={6}
                required
                value={otp}
                onChange={(e) => setOtp(e.target.value.replace(/\D/g, ''))}
                placeholder="• • • • • •"
                className="w-full border-2 rounded-lg px-3 py-3 text-center text-2xl font-mono tracking-widest focus:outline-none focus:ring-2 focus:ring-brand focus:border-brand"
              />
            </div>
            <button type="submit" disabled={loading || otp.length !== 6}
              className="w-full bg-brand text-white py-2 rounded font-medium hover:bg-brand-dark disabled:opacity-50 transition">
              {loading ? 'Verifying…' : 'Verify & Sign In'}
            </button>
          </form>

          <div className="mt-4 text-center text-sm text-gray-500">
            Didn't receive the code?{' '}
            <button onClick={handleResend} disabled={loading}
              className="text-brand font-medium hover:underline disabled:opacity-50">
              Resend
            </button>
          </div>

          <div className="mt-3 text-center">
            <button onClick={() => { setStep('register'); setError(''); setSuccess('') }}
              className="text-xs text-gray-400 hover:underline">
              ← Use a different email
            </button>
          </div>
        </>
      ) : (
        /* ── Push notification registration step ── */
        <>
          <div className="text-center mb-6">
            <div className="text-5xl mb-3">🔔</div>
            <h1 className="text-2xl font-bold mb-2">Stay Connected</h1>
            <p className="text-gray-600 text-sm">
              Enable notifications to get real-time updates on your orders, deliveries, and special offers.
            </p>
          </div>

          {error && <div className="bg-red-50 text-red-700 border border-red-200 rounded p-3 mb-4 text-sm">{error}</div>}
          {success && <div className="bg-green-50 text-green-700 border border-green-200 rounded p-3 mb-4 text-sm">{success}</div>}

          <div className="space-y-3">
            <button
              type="button"
              onClick={() => handlePushRegistration(true)}
              disabled={pushLoading}
              className="w-full bg-brand text-white py-3 rounded font-medium hover:bg-brand-dark disabled:opacity-50 transition flex items-center justify-center gap-2"
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
              className="w-full border-2 border-gray-300 text-gray-700 py-3 rounded font-medium hover:bg-gray-50 disabled:opacity-50 transition"
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
  )
}