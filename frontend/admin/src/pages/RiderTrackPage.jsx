import React, { useEffect, useRef, useState } from 'react'
import { useParams, Link } from 'react-router-dom'

import {
  getRiderActiveOrder,
  getRiders,
} from '../api/index'

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

  // Load the rider's basic info
  useEffect(() => {
    getRiders().then((r) => {
      const found = r.data.find(
        (x) => String(x.rider_id) === String(riderId)
      )

      setRiderInfo(found ?? null)

      if (found?.lat != null) {
        setRiderPosition({
          lat: found.lat,
          lng: found.lng,
        })
      }
    })
  }, [riderId])

  // Load the rider's current active order
  useEffect(() => {
    setOrder(null)
    setOrderError(null)

    getRiderActiveOrder(riderId)
      .then((r) => setOrder(r.data))
      .catch((err) => {
        if (err.response?.status === 404) {
          setOrderError(
            'No active delivery for this rider right now.'
          )
        } else {
          setOrderError(
            'Could not load active order.'
          )
        }
      })
  }, [riderId])

  // Connect to rider's live location channel
  useEffect(() => {
    const token = localStorage.getItem('access_token')

    if (!token) return

    const protocol =
      window.location.protocol === 'https:'
        ? 'wss'
        : 'ws'

    const backendHost =
      window.location.hostname === 'localhost'
        ? 'localhost:8000'
        : window.location.host

    const wsHandle = createReconnectingSocket(
      `${protocol}://${backendHost}/ws/riders/${riderId}/?token=${token}`,
      {
        onMessage: (e) => {
          const data = JSON.parse(e.data)

          if (data.type === 'rider.location') {
            setRiderPosition({
              lat: data.lat,
              lng: data.lng,
            })
          }
        },

        onError: (e) =>
          console.error(
            'RiderTrackPage WebSocket error:',
            e
          ),
      }
    )

    wsRef.current = wsHandle

    return () => wsHandle.close()
  }, [riderId])

  const destination =
    order?.delivery_address?.lat != null
      ? {
          lat: order.delivery_address.lat,
          lng: order.delivery_address.lng,
          label: order.delivery_address.line1,
        }
      : null

  return (
    <div className="w-full">

      {/* Back Button */}
      <Link
        to="/riders"
        className="
          inline-flex
          items-center
          text-indigo-600
          text-sm
          mb-4
          hover:underline
        "
      >
        ← Back to Riders
      </Link>

      {/* Rider Header */}
      <div
        className="
          flex
          flex-col
          sm:flex-row
          sm:items-center
          sm:justify-between
          gap-3
          mb-4
        "
      >
        {/* Rider Information */}
        <div className="min-w-0">
          <h1
            className="
              text-xl
              sm:text-2xl
              font-bold
              text-gray-900
              break-words
            "
          >
            {riderInfo?.email ??
              `Rider #${riderId}`}
          </h1>

          {riderInfo?.warehouse?.name && (
            <p className="text-sm text-gray-500 mt-1">
              {riderInfo.warehouse.name}
            </p>
          )}
        </div>

        {/* Duty Status */}
        {riderInfo && (
          <span
            className={`
              self-start
              sm:self-auto
              inline-flex
              items-center
              text-xs
              px-3
              py-1
              rounded-full
              font-semibold
              whitespace-nowrap
              ${
                riderInfo.is_on_duty
                  ? 'bg-green-100 text-green-800'
                  : 'bg-gray-100 text-gray-600'
              }
            `}
          >
            {riderInfo.is_on_duty
              ? '🟢 On Duty'
              : '⚫ Off Duty'}
          </span>
        )}
      </div>

      {/* Live Route */}
      {destination ? (

        <div className="bg-white rounded-xl shadow p-3 sm:p-4 mb-4">

          {/* Map Header */}
          <p
            className="
              text-sm
              font-semibold
              text-gray-700
              mb-3
              leading-relaxed
            "
          >
            🗺 Live Route — Order #{order.id}{' '}
            <span className="text-gray-500">
              ({order.status.replace(/_/g, ' ')})
            </span>
          </p>

          {/* Map */}
          <div className="w-full overflow-hidden rounded-lg">
            <LiveRouteMap
              warehouse={order.warehouse}
              destination={destination}
              riderPosition={riderPosition}
              height="clamp(350px, 60vh, 650px)"
            />
          </div>

        </div>

      ) : riderPosition ? (

        <div className="bg-white rounded-xl shadow p-3 sm:p-4 mb-4">

          {/* Message */}
          <p className="text-sm text-gray-500 mb-3">
            {orderError}
          </p>

          {/* Rider Location Map */}
          <div className="w-full overflow-hidden rounded-lg">
            <LiveRouteMap
              warehouse={null}
              destination={null}
              riderPosition={riderPosition}
              height="clamp(350px, 60vh, 650px)"
            />
          </div>

        </div>

      ) : (

        <div
          className="
            bg-white
            rounded-xl
            shadow
            p-6
            sm:p-8
            text-center
            text-gray-400
          "
        >
          No location data available for this rider yet.
        </div>

      )}

    </div>
  )
}