import React, { useState, useEffect } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import axios from 'axios'
import { getProfile } from '../api/index'
import { useAuth } from '../contexts/AuthContext'

// Separate API calls (no auth token needed — these are public endpoints)
const client = axios.create({ baseURL: import.meta.env.VITE_BACKEND_URL, headers: { 'Content-Type': 'application/json' } })
const registerApi = (data) => client.post('/auth/register/', data)
const verifyOtpApi = (email, code) => client.post('/auth/verify-otp/', { email, code })
const resendOtpApi = (email) => client.post('/auth/resend-otp/', { email })
const getWarehouses = () => client.get('/tracking/warehouses/')

export default function RegisterPage() {
  const { login: setAuth } = useAuth()
  const navigate = useNavigate()

  // Step 1: registration form
  const [form, setForm] = useState({ 
    email: '', 
    password: '', 
    first_name: '', 
    last_name: '', 
    phone: '',
    warehouse_id: '',
    role: 'rider'  // Always rider for this page
  })
  // Step 2: OTP entry
  const [step, setStep] = useState('register')   // 'register' | 'otp'
  const [registeredEmail, setRegisteredEmail] = useState('')
  const [otp, setOtp] = useState('')
  const [warehouses, setWarehouses] = useState([])

  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [warehousesLoading, setWarehousesLoading] = useState(true)

  const set = (field) => (e) => setForm((f) => ({ ...f, [field]: e.target.value }))

  // Fetch warehouses on mount
  useEffect(() => {
    const fetchWarehouses = async () => {
      try {
        const res = await getWarehouses()
        const data = res.data.results || res.data
        setWarehouses(Array.isArray(data) ? data.filter(w => w.is_active) : [])
      } catch (err) {
        console.error('Failed to fetch warehouses:', err)
        setError('Could not load warehouses. Please refresh the page.')
      } finally {
        setWarehousesLoading(false)
      }
    }
    fetchWarehouses()
  }, [])

  // ── Step 1: Submit registration ──────────────────────────────────────────
  const handleRegister = async (e) => {
    e.preventDefault()
    
    if (!form.warehouse_id) {
      setError('Please select a warehouse')
      return
    }

    setError('')
    setLoading(true)
    try {
      await registerApi({
        ...form,
        warehouse_id: parseInt(form.warehouse_id)
      })
      setRegisteredEmail(form.email)
      setStep('otp')
      setSuccess(`We sent a 6-digit code to ${form.email}. Check your inbox.`)
    } catch (err) {
      const d = err.response?.data
      if (typeof d === 'object') setError(Object.values(d).flat().join(' '))
      else setError('Registration failed. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  // ── Step 2: Submit OTP ───────────────────────────────────────────────────
  const handleVerify = async (e) => {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      const res = await verifyOtpApi(registeredEmail, otp.trim())
      // verify-otp returns tokens on success — auto-login the user.
      localStorage.setItem('access_token', res.data.access)
      const profile = await getProfile()
      setAuth(res.data.access, res.data.refresh, profile.data)
      // Navigate to dashboard
      navigate('/')
    } catch (err) {
      setError(err.response?.data?.detail || 'Invalid or expired code.')
    } finally {
      setLoading(false)
    }
  }

  // ── Step 2: Resend OTP ───────────────────────────────────────────────────
  const handleResend = async () => {
    setError('')
    setSuccess('')
    setLoading(true)
    try {
      await resendOtpApi(registeredEmail)
      setSuccess('A new code has been sent to your email.')
      setOtp('')
    } catch (err) {
      if (err.response?.status === 429) setError('Too many requests. Please wait a while.')
      else setError('Could not resend. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  // ── Render ───────────────────────────────────────────────────────────────
  return (
    <div className="max-w-sm mx-auto mt-12 px-4">
      {step === 'register' ? (
        <>
          <h1 className="text-2xl font-bold mb-2">Join as a Rider</h1>
          <p className="text-gray-600 text-sm mb-6">Start delivering and earn money with FastMart</p>
          {error && <div className="bg-red-50 text-red-700 border border-red-200 rounded p-3 mb-4 text-sm">{error}</div>}
          <form onSubmit={handleRegister} className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-sm font-medium mb-1">First name</label>
                <input 
                  type="text" 
                  required
                  value={form.first_name} 
                  onChange={set('first_name')}
                  className="w-full border rounded px-3 py-2 focus:outline-none focus:ring-2 focus:ring-orange-400"
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Last name</label>
                <input 
                  type="text" 
                  required
                  value={form.last_name} 
                  onChange={set('last_name')}
                  className="w-full border rounded px-3 py-2 focus:outline-none focus:ring-2 focus:ring-orange-400"
                />
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Email</label>
              <input 
                type="email" 
                required 
                value={form.email} 
                onChange={set('email')}
                className="w-full border rounded px-3 py-2 focus:outline-none focus:ring-2 focus:ring-orange-400"
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Phone</label>
              <input 
                type="tel" 
                required
                value={form.phone} 
                onChange={set('phone')}
                className="w-full border rounded px-3 py-2 focus:outline-none focus:ring-2 focus:ring-orange-400"
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Warehouse *</label>
              <select 
                required 
                value={form.warehouse_id} 
                onChange={set('warehouse_id')}
                disabled={warehousesLoading}
                className="w-full border rounded px-3 py-2 focus:outline-none focus:ring-2 focus:ring-orange-400 disabled:opacity-50"
              >
                <option value="">{warehousesLoading ? 'Loading warehouses...' : 'Select warehouse'}</option>
                {warehouses.map(w => (
                  <option key={w.id} value={w.id}>
                    {w.name} ({w.city}, {w.state})
                  </option>
                ))}
              </select>
              {warehouses.length === 0 && !warehousesLoading && (
                <p className="text-xs text-red-600 mt-1">No warehouses available</p>
              )}
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Password</label>
              <input 
                type="password" 
                required 
                value={form.password} 
                onChange={set('password')}
                className="w-full border rounded px-3 py-2 focus:outline-none focus:ring-2 focus:ring-orange-400"
              />
            </div>
            <button 
              type="submit" 
              disabled={loading || !form.warehouse_id}
              className="w-full bg-orange-500 text-white py-2 rounded font-medium hover:bg-orange-600 disabled:opacity-50 transition"
            >
              {loading ? 'Creating account…' : 'Create Account'}
            </button>
          </form>
          <p className="mt-4 text-sm text-center text-gray-600">
            Already have an account? <Link to="/login" className="text-orange-500 font-medium hover:underline">Sign In</Link>
          </p>
        </>
      ) : (
        /* ── OTP verification step ── */
        <>
          <div className="text-center mb-6">
            <div className="text-4xl mb-3">📧</div>
            <h1 className="text-2xl font-bold mb-1">Check your email</h1>
            <p className="text-gray-600 text-sm">
              We sent a 6-digit verification code to<br />
              <span className="font-medium text-gray-700">{registeredEmail}</span>
            </p>
          </div>

          {error && <div className="bg-red-50 text-red-700 border border-red-200 rounded p-3 mb-4 text-sm">{error}</div>}
          {success && <div className="bg-green-50 text-green-700 border border-green-200 rounded p-3 mb-4 text-sm">{success}</div>}

          <form onSubmit={handleVerify} className="space-y-4">
            <div>
              <label className="block text-sm font-medium mb-2 text-center">Enter 6-digit code</label>
              <input
                type="text"
                inputMode="numeric"
                pattern="[0-9]{6}"
                maxLength={6}
                required
                value={otp}
                onChange={(e) => setOtp(e.target.value.replace(/\D/g, ''))}
                placeholder="• • • • • •"
                className="w-full border-2 rounded-lg px-3 py-3 text-center text-2xl font-mono tracking-widest focus:outline-none focus:ring-2 focus:ring-orange-400 focus:border-orange-400"
              />
            </div>
            <button 
              type="submit" 
              disabled={loading || otp.length !== 6}
              className="w-full bg-orange-500 text-white py-2 rounded font-medium hover:bg-orange-600 disabled:opacity-50 transition"
            >
              {loading ? 'Verifying…' : 'Verify & Sign In'}
            </button>
          </form>

          <div className="mt-4 text-center text-sm text-gray-600">
            Didn't receive the code?{' '}
            <button 
              onClick={handleResend} 
              disabled={loading}
              className="text-orange-500 font-medium hover:underline disabled:opacity-50"
            >
              Resend
            </button>
          </div>

          <div className="mt-3 text-center">
            <button 
              onClick={() => { setStep('register'); setError(''); setSuccess('') }}
              className="text-xs text-gray-400 hover:underline"
            >
              ← Use a different email
            </button>
          </div>
        </>
      )}
    </div>
  )
}
