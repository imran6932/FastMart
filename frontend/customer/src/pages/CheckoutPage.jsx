import React, { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { getAddresses, createAddress } from '../api/auth'
import { checkout, verifyPayment, getVapidKey, registerPushSubscription, checkServiceability } from '../api/payments'
import { useCart } from '../contexts/CartContext'
import { persistServiceability } from '../utils/serviceability'

// Dynamically load the Razorpay checkout script.
// We load it here (not in index.html) so it's only fetched when the user
// actually reaches the checkout page.
function loadRazorpay() {
  return new Promise((resolve) => {
    if (window.Razorpay) { resolve(true); return }
    const script = document.createElement('script')
    script.src = 'https://checkout.razorpay.com/v1/checkout.js'
    script.onload = () => resolve(true)
    script.onerror = () => resolve(false)
    document.body.appendChild(script)
  })
}

// Request push permission and register subscription.
// Called after first successful order so we don't auto-prompt on page load
// (browsers penalise/block sites that auto-prompt without user context).
async function subscribeToPush() {
  if (!('PushManager' in window)) return
  const permission = await Notification.requestPermission()
  if (permission !== 'granted') return

  try {
    const sw = await navigator.serviceWorker.ready
    const { data } = await getVapidKey()
    const sub = await sw.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: data.vapid_public_key,
    })
    await registerPushSubscription(sub)
  } catch (err) {
    console.warn('Push subscription failed:', err)
  }
}

export default function CheckoutPage() {
  const navigate = useNavigate()
  const { fetchCart } = useCart()
  const [addresses, setAddresses] = useState([])
  const [selectedAddress, setSelectedAddress] = useState(null)
  const [newAddr, setNewAddr] = useState({ line1: '', line2: '', city: '', state: '', pincode: '' })
  const [coords, setCoords] = useState(null)          // { latitude, longitude } — filled by browser GPS
  const [geoStatus, setGeoStatus] = useState('idle')  // 'idle' | 'loading' | 'ok' | 'error'
  const [showNewAddr, setShowNewAddr] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [checkingService, setCheckingService] = useState(false)
  const [serviceStatus, setServiceStatus] = useState(null) // null | 'checking' | 'available' | 'unavailable'
  const [serviceMessage, setServiceMessage] = useState('')

  useEffect(() => {
    getAddresses().then((r) => {
      const list = r.data.results ?? r.data
      setAddresses(list)
      const def = list.find((a) => a.is_default) || list[0]
      if (def) {
        setSelectedAddress(def.id)
        // Check serviceability for the pre-selected address immediately —
        // otherwise serviceStatus stays null and checkout blocks with
        // "Please wait..." even though the address is actually serviceable.
        checkAddressServiceability(def.id)
      }
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Called when user opens the new-address form.
  // Immediately tries to get location so it's ready by the time they finish typing.
  const openNewAddrForm = () => {
    setShowNewAddr(true)
    setCoords(null)
    setGeoStatus('loading')
    if (!navigator.geolocation) {
      setGeoStatus('error')
      return
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setCoords({ latitude: pos.coords.latitude, longitude: pos.coords.longitude })
        setGeoStatus('ok')
      },
      () => setGeoStatus('error'),
      { enableHighAccuracy: true, timeout: 10000 }
    )
  }

  // Retry if user initially denied and then re-grants in browser settings.
  const retryGeo = () => {
    setGeoStatus('loading')
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setCoords({ latitude: pos.coords.latitude, longitude: pos.coords.longitude })
        setGeoStatus('ok')
      },
      () => setGeoStatus('error'),
      { enableHighAccuracy: true, timeout: 10000 }
    )
  }

  const handleAddAddress = async (e) => {
    e.preventDefault()
    if (!coords) { setError('Location is required. Please allow location access.'); return }
    try {
      const r = await createAddress({ ...newAddr, latitude: coords.latitude, longitude: coords.longitude })
      setAddresses((prev) => [...prev, r.data])
      setSelectedAddress(r.data.id)
      setShowNewAddr(false)
      setNewAddr({ line1: '', line2: '', city: '', state: '', pincode: '' })
      setCoords(null)
      // Check serviceability for new address
      checkAddressServiceability(r.data.id)
    } catch (err) {
      setError('Could not save address.')
    }
  }

  const checkAddressServiceability = async (addressId) => {
    setCheckingService(true)
    setServiceStatus('checking')
    try {
      const { data } = await checkServiceability(addressId)
      if (data.can_proceed) {
        setServiceStatus('available')
        setServiceMessage('✓ Service available in your area')
      } else {
        setServiceStatus('unavailable')
        setServiceMessage('✗ ' + (data.message || 'Service is not available in your area. Please try another address.'))
      }
      persistServiceability(addressId, data.can_proceed, data.message)
    } catch (err) {
      setServiceStatus('unavailable')
      setServiceMessage('Service temporarily unavailable in your area. Please try again later.')
      persistServiceability(addressId, false, 'Service temporarily unavailable in your area. Please try again later.')
    } finally {
      setCheckingService(false)
    }
  }

  const handleSelectAddress = (addressId) => {
    setSelectedAddress(addressId)
    checkAddressServiceability(addressId)
  }

  const handleCheckout = async () => {
    if (!selectedAddress) { setError('Please select a delivery address.'); return }
    if (serviceStatus === 'unavailable') { setError('Service is not available in your area. Please try another address.'); return }
    if (serviceStatus !== 'available') { setError('Please wait while we check service availability.'); return }
    
    setError('')
    setLoading(true)

    const scriptLoaded = await loadRazorpay()
    if (!scriptLoaded) { setError('Payment provider unavailable. Please try again.'); setLoading(false); return }

    try {
      const { data: order } = await checkout(selectedAddress)

      const options = {
        key: order.key_id,
        amount: order.amount,
        currency: order.currency,
        name: 'FastMart',
        description: `Order #${order.order_id}`,
        order_id: order.razorpay_order_id,
        handler: async (response) => {
          // Frontend verification call (fast-path). Webhook is the source of truth.
          try {
            await verifyPayment(response)
          } catch {
            // Verification endpoint failure — the webhook will still confirm the order.
            console.warn('Verify endpoint failed — webhook will confirm.')
          }
          // Subscribe to push notifications after first successful order.
          subscribeToPush()
          fetchCart()
          navigate(`/orders/${order.order_id}`)
        },
        prefill: {},
        theme: { color: '#2e7d32' },
        modal: {
          ondismiss: () => setLoading(false),
        },
      }

      const rzp = new window.Razorpay(options)
      rzp.open()
    } catch (err) {
      setError(err.response?.data?.detail || err.response?.data?.[0] || 'Checkout failed.')
      setLoading(false)
    }
  }

  return (
    <div className="max-w-lg mx-auto">
      <h1 className="text-2xl font-bold mb-6">Checkout</h1>
      {error && <div className="bg-red-50 text-red-700 border border-red-200 rounded p-3 mb-4 text-sm">{error}</div>}

      <h2 className="font-semibold mb-3">Select Delivery Address</h2>
      <div className="space-y-3 mb-4">
        {addresses.map((addr) => (
          <label key={addr.id} className={`flex items-start gap-3 p-3 border rounded-lg cursor-pointer transition ${selectedAddress === addr.id ? 'border-brand bg-green-50' : 'border-gray-200 hover:border-brand'}`}>
            <input type="radio" name="address" value={addr.id} checked={selectedAddress === addr.id}
              onChange={() => handleSelectAddress(addr.id)} className="mt-1" />
            <div className="text-sm flex-1">
              <p className="font-medium">{addr.line1}</p>
              {addr.line2 && <p className="text-gray-500">{addr.line2}</p>}
              <p className="text-gray-500">{addr.city}, {addr.state} – {addr.pincode}</p>
            </div>
          </label>
        ))}
      </div>

      {/* Serviceability status for selected address */}
      {selectedAddress && (
        <div className={`rounded-lg px-4 py-3 mb-6 text-sm font-medium ${
          serviceStatus === 'available' ? 'bg-green-50 text-green-700 border border-green-200' :
          serviceStatus === 'unavailable' ? 'bg-red-50 text-red-700 border border-red-200' :
          'bg-blue-50 text-blue-700 border border-blue-200'
        }`}>
          {serviceStatus === 'checking' && (
            <div className="flex items-center gap-2">
              <svg className="animate-spin w-4 h-4" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" />
              </svg>
              Checking service availability...
            </div>
          )}
          {serviceStatus && serviceStatus !== 'checking' && serviceMessage}
        </div>
      )}

      {!showNewAddr ? (
        <button onClick={openNewAddrForm} className="text-brand text-sm font-medium hover:underline mb-6">
          + Add new address
        </button>
      ) : (
        <form onSubmit={handleAddAddress} className="border rounded-lg p-4 mb-6 space-y-3">
          <h3 className="font-medium text-sm">New Address</h3>

          {/* Location status indicator — no lat/lng visible to user */}
          <div className={`flex items-center gap-2 text-sm rounded-lg px-3 py-2 ${
            geoStatus === 'ok'      ? 'bg-green-50 text-green-700 border border-green-200' :
            geoStatus === 'error'   ? 'bg-red-50 text-red-600 border border-red-200' :
                                      'bg-blue-50 text-blue-600 border border-blue-200'
          }`}>
            {geoStatus === 'loading' && <>
              <svg className="animate-spin w-4 h-4" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" />
              </svg>
              Detecting your location…
            </>}
            {geoStatus === 'ok' && <>
              <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M16.707 5.293a1 1 0 00-1.414 0L8 12.586 4.707 9.293a1 1 0 00-1.414 1.414l4 4a1 1 0 001.414 0l8-8a1 1 0 000-1.414z" clipRule="evenodd" />
              </svg>
              Location detected
            </>}
            {geoStatus === 'error' && <>
              <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
              </svg>
              <span>Location access denied.</span>
              <button type="button" onClick={retryGeo} className="underline font-medium ml-1">Try again</button>
            </>}
          </div>

          <input required placeholder="Street address" value={newAddr.line1}
            onChange={(e) => setNewAddr(p => ({ ...p, line1: e.target.value }))}
            className="w-full border rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand" />
          <input placeholder="Apartment / Floor (optional)" value={newAddr.line2}
            onChange={(e) => setNewAddr(p => ({ ...p, line2: e.target.value }))}
            className="w-full border rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand" />
          <div className="grid grid-cols-2 gap-2">
            <input required placeholder="City" value={newAddr.city}
              onChange={(e) => setNewAddr(p => ({ ...p, city: e.target.value }))}
              className="w-full border rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand" />
            <input required placeholder="State" value={newAddr.state}
              onChange={(e) => setNewAddr(p => ({ ...p, state: e.target.value }))}
              className="w-full border rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand" />
          </div>
          <input required placeholder="Pincode" value={newAddr.pincode}
            onChange={(e) => setNewAddr(p => ({ ...p, pincode: e.target.value }))}
            className="w-full border rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand" />

          <div className="flex gap-2">
            <button type="submit" disabled={geoStatus === 'loading'}
              className="bg-brand text-white text-sm px-4 py-2 rounded disabled:opacity-50">
              {geoStatus === 'loading' ? 'Detecting location…' : 'Save Address'}
            </button>
            <button type="button" onClick={() => setShowNewAddr(false)}
              className="text-sm text-gray-500 hover:underline">Cancel</button>
          </div>
        </form>
      )}

      <button
        onClick={handleCheckout}
        disabled={loading || !selectedAddress}
        className="w-full bg-brand text-white py-3 rounded-lg font-bold text-lg hover:bg-brand-dark disabled:opacity-50 transition"
      >
        {loading ? 'Processing…' : 'Pay with Razorpay'}
      </button>

      <p className="text-xs text-gray-400 mt-3 text-center">
        Payments are processed securely by Razorpay. Test mode — no real money is charged.
      </p>
    </div>
  )
}
