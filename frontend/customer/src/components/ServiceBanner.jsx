import React, { useEffect, useState } from 'react'
import { useServiceLocation } from '../contexts/LocationContext'

// Full-width status strip shown directly below the Navbar on every page.
// Shows the current availability status based on selected address.
export default function ServiceBanner() {
  const { locationStatus, locationError, cartEnabled, changeAddress, retryLocation } = useServiceLocation() || {}
  const [showAvailableBanner, setShowAvailableBanner] = useState(true)

  // Auto-hide the "available" success banner after 5 seconds — once the user
  // knows service is available there's no need to keep taking up screen space.
  // Re-shows itself whenever locationStatus transitions back to 'available'
  // (e.g. user switches to a different serviceable address).
  useEffect(() => {
    if (locationStatus === 'available') {
      setShowAvailableBanner(true)
      const timer = setTimeout(() => setShowAvailableBanner(false), 5000)
      return () => clearTimeout(timer)
    }
  }, [locationStatus])

  // Always show status if not idle (e.g., unavailable, available, checking, denied)
  // This ensures user sees availability on every page
  if (!locationStatus || locationStatus === 'idle') return null

  if (locationStatus === 'unavailable') {
    return (
      <div className="sticky top-0 z-40 bg-red-50 border-b-4 border-red-500 px-4 py-3">
        <div className="max-w-6xl mx-auto flex items-center justify-between flex-wrap gap-2">
          <div className="flex items-center gap-3 flex-1">
            <span className="text-2xl flex-shrink-0">⚠️</span>
            <div className="min-w-0">
              <p className="font-semibold text-red-800">Service temporarily unavailable</p>
              {locationError && <p className="text-red-700 text-sm">{locationError}</p>}
            </div>
          </div>
          <div className="flex gap-2 flex-shrink-0">
            <button
              onClick={changeAddress}
              className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-medium transition"
            >
              Change Address
            </button>
            <button
              onClick={retryLocation}
              className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg text-sm font-medium transition"
            >
              Try Again
            </button>
          </div>
        </div>
      </div>
    )
  }

  if (locationStatus === 'checking') {
    return (
      <div className="sticky top-0 z-40 bg-blue-50 border-b-4 border-blue-500 px-4 py-3">
        <div className="max-w-6xl mx-auto flex items-center gap-3">
          <svg className="animate-spin w-5 h-5 text-blue-600 flex-shrink-0" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" />
          </svg>
          <p className="text-blue-800 font-medium">Checking service availability...</p>
        </div>
      </div>
    )
  }

  if (locationStatus === 'available') {
    if (!showAvailableBanner) return null
    return (
      <div className="sticky top-0 z-40 bg-green-50 border-b-4 border-green-500 px-4 py-3">
        <div className="max-w-6xl mx-auto flex items-center justify-between flex-wrap gap-2">
          <div className="flex items-center gap-3">
            <span className="text-2xl">✅</span>
            <p className="text-green-800 font-medium">Service available in your area - Start shopping!</p>
          </div>
          <button
            onClick={changeAddress}
            className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-medium transition whitespace-nowrap"
          >
            Change Address
          </button>
        </div>
      </div>
    )
  }

  if (locationStatus === 'denied') {
    return (
      <div className="sticky top-0 z-40 bg-yellow-50 border-b-4 border-yellow-500 px-4 py-3">
        <div className="max-w-6xl mx-auto flex items-center justify-between flex-wrap gap-2">
          <div className="flex items-center gap-3">
            <span className="text-2xl">📍</span>
            <p className="text-yellow-800 font-medium">
              {locationError || 'Please enable location access to continue shopping.'}
            </p>
          </div>
          <button
            onClick={retryLocation}
            className="px-4 py-2 bg-yellow-600 hover:bg-yellow-700 text-white rounded-lg text-sm font-medium transition"
          >
            Enable Location
          </button>
        </div>
      </div>
    )
  }

  return null
}
