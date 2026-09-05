import React, { createContext, useContext, useEffect, useRef, useState } from 'react'
import { useAuth } from './AuthContext'
import { createReconnectingSocket } from '../utils/reconnectingSocket'

const LocationTrackingContext = createContext(null)

/**
 * Owns the rider's "on duty" GPS-broadcasting WebSocket at the app root —
 * NOT inside a page component. It must keep running no matter which page
 * the rider is viewing (e.g. opening an order's live-route detail page)
 * otherwise the location feed to admins/customers would silently stop
 * every time the rider navigates away from the dashboard.
 */
export function LocationTrackingProvider({ children }) {
  const { user } = useAuth() || {}
  const [isOnDuty, setIsOnDuty] = useState(false)
  const wsRef = useRef(null)

  // Sync duty status from the profile whenever the user changes (login, refresh).
  useEffect(() => {
    if (user && user.role === 'rider') {
      setIsOnDuty(user.is_on_duty || false)
    }
  }, [user])

  // Send GPS location over WebSocket while on duty. Runs at the provider
  // level (mounted once for the whole app) so it survives route changes.
  useEffect(() => {
    if (!isOnDuty || !user) return

    const riderId = user.rider_profile_id

    // Verify we have a valid rider_profile_id
    if (!riderId) {
      console.warn('⚠️ Rider profile ID not found. Make sure RiderProfile was created during signup.')
      return
    }

    const token = localStorage.getItem('access_token')
    if (!token) {
      console.warn('⚠️ No auth token found')
      return
    }

    // Close any existing WebSocket before creating a new one
    if (wsRef.current) {
      wsRef.current.close()
    }

    const protocol = window.location.protocol === 'https:' ? 'wss' : 'ws'
    // Connect to backend (localhost:8000) instead of frontend server (localhost:3002)
    const backendHost = window.location.hostname === 'localhost' ? 'localhost:8000' : window.location.host
    const wsUrl = `${protocol}://${backendHost}/ws/riders/${riderId}/?token=${token}`

    console.log('📡 Connecting to WebSocket:', wsUrl)

    let lastLocationError = null
    let consecutiveErrors = 0
    // const MAX_CONSECUTIVE_ERRORS = 3

    const sendLocation = () => {
      const ws = wsHandle.socket
      if (!ws) return
      navigator.geolocation.getCurrentPosition(
        pos => {
          if (ws.readyState === WebSocket.OPEN) {
            const msg = JSON.stringify({
              type: 'location.ping',
              lat: pos.coords.latitude,
              lng: pos.coords.longitude
            })
            console.log('📍 Sending location:', { lat: pos.coords.latitude, lng: pos.coords.longitude })
            ws.send(msg)
            consecutiveErrors = 0  // Reset error counter on success
            if (lastLocationError) {
              lastLocationError = null
              console.log('✓ Location access restored')
            }
          }
        },
        err => {
          consecutiveErrors++
          const errorMessages = {
            1: 'Location permission denied. Please enable location access in browser settings.',
            2: 'Location unavailable. Make sure GPS/location services are enabled.',
            3: 'Location request timed out. Try moving to a location with better signal.',
          }
          const message = errorMessages[err.code] || `Location error: ${err.message}`

          // Only log unique errors (not every 10 seconds)
          // if (lastLocationError !== message) {
          //   console.warn(`⚠️ ${message}`)
          //   lastLocationError = message
          // }

          // // For development/testing without real GPS, send mock location after 3 consecutive errors
          // if (consecutiveErrors >= MAX_CONSECUTIVE_ERRORS && ws.readyState === WebSocket.OPEN) {
          //   // Mock location (example: Bangalore, India)
          //   const mockMsg = JSON.stringify({
          //     type: 'location.ping',
          //     lat: 12.9716 + (Math.random() - 0.5) * 0.01,
          //     lng: 77.5946 + (Math.random() - 0.5) * 0.01
          //   })
          //   console.log('📡 Using mock location (development mode):', mockMsg)
          //   ws.send(mockMsg)
          // }
        },
        { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
      )
    }

    // Auto-reconnects on drop/server-restart (exponential backoff) so the
    // rider doesn't silently stop sending location until they reload the page.
    const wsHandle = createReconnectingSocket(wsUrl, {
      onOpen: () => {
        console.log('✓ WebSocket connected')
        sendLocation()  // Send immediately on connect
      },
      onError: (event) => {
        console.error('✗ WebSocket error:', event)
      },
      onClose: (event) => {
        const reasons = {
          1000: 'Normal closure',
          1001: 'Going away',
          1002: 'Protocol error',
          1003: 'Unsupported data',
          1006: 'Abnormal closure (connection reset)',
          1008: 'Policy violation',
          1009: 'Message too big',
          1011: 'Server error',
          1012: 'Service restart',
        }
        console.log(`❌ WebSocket closed (code: ${event.code} - ${reasons[event.code] || 'Unknown'}), wasClean: ${event.wasClean} — will retry`)
      },
    })
    wsRef.current = wsHandle

    const interval = setInterval(sendLocation, 10000)

    return () => {
      clearInterval(interval)
      wsHandle.close()
    }
  }, [isOnDuty, user])

  return (
    <LocationTrackingContext.Provider value={{ isOnDuty, setIsOnDuty }}>
      {children}
    </LocationTrackingContext.Provider>
  )
}

export const useLocationTracking = () => useContext(LocationTrackingContext)
