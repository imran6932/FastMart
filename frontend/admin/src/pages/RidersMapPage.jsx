import React, { useEffect, useRef, useState } from 'react'

import {
  MapContainer,
  Marker,
  Popup,
  TileLayer,
  useMap,
} from 'react-leaflet'

import L from 'leaflet'
import 'leaflet/dist/leaflet.css'

import { getRiders, getWarehouses } from '../api/index'
import { createReconnectingSocket } from '../utils/reconnectingSocket'


// Fix Leaflet icon bundling issue with Vite.
delete L.Icon.Default.prototype._getIconUrl

L.Icon.Default.mergeOptions({
  iconRetinaUrl:
    'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',

  iconUrl:
    'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',

  shadowUrl:
    'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
})


const riderIcon = L.divIcon({
  html: '🛵',
  className: 'text-2xl',
  iconSize: [30, 30],
  iconAnchor: [15, 15],
})


const warehouseIcon = L.divIcon({
  html: '🏪',
  className: 'text-2xl',
  iconSize: [30, 30],
  iconAnchor: [15, 15],
})


// Inner component to handle map re-centering when data loads
function MapContent({ warehouses, onDutyRiders }) {
  const map = useMap()

  useEffect(() => {
    console.log('🗺 MapContent rendering with:', {
      warehouses: warehouses.length,
      riders: onDutyRiders.length,
    })

    console.log('  Warehouses:', warehouses)
    console.log('  Riders:', onDutyRiders)

    const allLocations = [
      ...onDutyRiders.map((r) => [r.lat, r.lng]),

      ...warehouses
        .filter(
          (w) =>
            w.latitude != null &&
            w.longitude != null
        )
        .map((w) => [
          w.latitude,
          w.longitude,
        ]),
    ]

    if (allLocations.length > 0) {
      const bounds = L.latLngBounds(allLocations)

      map.fitBounds(bounds, {
        padding: [50, 50],
      })
    }
  }, [warehouses, onDutyRiders, map])


  return (
    <>
      {/* OpenStreetMap label */}
      <div
        className="
          absolute
          top-2
          left-2
          sm:top-4
          sm:left-4
          bg-white
          px-2
          py-1
          sm:px-3
          sm:py-2
          rounded-lg
          shadow
          z-10
          text-xs
          sm:text-sm
        "
      >
        <p className="font-semibold text-gray-700">
          🗺 OpenStreetMap
        </p>
      </div>


      {/* Map Tiles */}
      <TileLayer
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        attribution="&copy; OpenStreetMap contributors"
      />


      {/* Warehouses */}
      {warehouses.map((warehouse) =>
        warehouse.latitude != null &&
        warehouse.longitude != null ? (
          <Marker
            key={`warehouse-${warehouse.id}`}
            position={[
              warehouse.latitude,
              warehouse.longitude,
            ]}
            icon={warehouseIcon}
          >
            <Popup>
              <p className="font-semibold">
                {warehouse.name}
              </p>

              <p className="text-xs text-gray-500">
                {warehouse.city}, {warehouse.state}
              </p>

              <p className="text-xs text-gray-500">
                Warehouse #{warehouse.id}
              </p>
            </Popup>
          </Marker>
        ) : null
      )}


      {/* On-duty Riders */}
      {onDutyRiders.map((rider) => (
        <Marker
          key={rider.rider_id}
          position={[
            rider.lat,
            rider.lng,
          ]}
          icon={riderIcon}
        >
          <Popup>
            <p className="font-semibold">
              {rider.email}
            </p>

            <p className="text-xs text-gray-500">
              Rider #{rider.rider_id}
            </p>
          </Popup>
        </Marker>
      ))}
    </>
  )
}


export default function RidersMapPage() {
  const [riders, setRiders] = useState([])
  const [warehouses, setWarehouses] = useState([])

  const wsRefs = useRef({})


  // Poll REST endpoint every 10s as fallback,
  // AND subscribe to each rider's WS for real-time updates.
  useEffect(() => {
    const fetchRiders = () => {
      getRiders().then((r) => {
        const list = r.data

        setRiders(list)

        // Open a WebSocket for each rider
        // that has a location and doesn't already
        // have a connection.
        const token =
          localStorage.getItem('access_token')

        if (!token) return

        const protocol =
          window.location.protocol === 'https:'
            ? 'wss'
            : 'ws'

        const backendHost =
          window.location.hostname === 'localhost'
            ? 'localhost:8000'
            : window.location.host


        list.forEach((rider) => {
          if (
            !rider.lat ||
            wsRefs.current[rider.rider_id]
          ) {
            return
          }


          wsRefs.current[rider.rider_id] =
            createReconnectingSocket(
              `${protocol}://${backendHost}/ws/riders/${rider.rider_id}/?token=${token}`,
              {
                onMessage: (e) => {
                  const data = JSON.parse(e.data)

                  if (
                    data.type === 'rider.location'
                  ) {
                    setRiders((prev) =>
                      prev.map((r) =>
                        r.rider_id ===
                        data.rider_id
                          ? {
                              ...r,
                              lat: data.lat,
                              lng: data.lng,
                            }
                          : r
                      )
                    )
                  }
                },
              }
            )
        })
      })
    }


    fetchRiders()

    const interval = setInterval(
      fetchRiders,
      10000
    )


    return () => {
      clearInterval(interval)

      Object.values(
        wsRefs.current
      ).forEach((handle) =>
        handle.close()
      )

      wsRefs.current = {}
    }
  }, [])


  // Fetch warehouses on mount
  useEffect(() => {
    getWarehouses()
      .then((r) => {
        console.log(
          '📦 Warehouses fetched:',
          r.data
        )

        setWarehouses(r.data)
      })
      .catch((err) => {
        console.error(
          '❌ Failed to fetch warehouses:',
          err
        )
      })
  }, [])


  const onDutyRiders = riders.filter(
    (r) =>
      r.is_on_duty &&
      r.lat != null &&
      r.lng != null
  )


  const onDutyCount = riders.filter(
    (r) => r.is_on_duty
  ).length


  return (
    <div className="w-full min-w-0">

      {/* Page Title */}
      <h1
        className="
          text-xl
          sm:text-2xl
          font-bold
          text-gray-900
          mb-4
          leading-tight
        "
      >
        Live Map - Warehouses & Riders
      </h1>


      {/* Statistics */}
      <div
        className="
          grid
          grid-cols-1
          xs:grid-cols-2
          sm:grid-cols-3
          gap-3
          sm:gap-4
          mb-4
        "
      >

        {/* Warehouses */}
        <div
          className="
            bg-white
            rounded-lg
            shadow
            px-4
            py-3
          "
        >
          <p className="text-xl sm:text-2xl font-bold text-blue-600">
            {warehouses.length}
          </p>

          <p className="text-xs text-gray-500 mt-0.5">
            Warehouses
          </p>
        </div>


        {/* On Duty */}
        <div
          className="
            bg-white
            rounded-lg
            shadow
            px-4
            py-3
          "
        >
          <p className="text-xl sm:text-2xl font-bold text-indigo-600">
            {onDutyCount}
          </p>

          <p className="text-xs text-gray-500 mt-0.5">
            On Duty
          </p>
        </div>


        {/* Riders with Location */}
        <div
          className="
            bg-white
            rounded-lg
            shadow
            px-4
            py-3
          "
        >
          <p className="text-xl sm:text-2xl font-bold text-green-600">
            {onDutyRiders.length}
          </p>

          <p className="text-xs text-gray-500 mt-0.5">
            Riders with Location
          </p>
        </div>

      </div>


      {/* Map */}
      <div
        className="
          w-full
          rounded-xl
          overflow-hidden
          shadow
          h-[55vh]
          min-h-[350px]
          max-h-[650px]
          sm:h-[60vh]
          lg:h-[65vh]
        "
      >
        <MapContainer
          center={[20.5937, 78.9629]}
          zoom={10}
          className="w-full h-full"
        >
          <MapContent
            warehouses={warehouses}
            onDutyRiders={onDutyRiders}
          />
        </MapContainer>
      </div>

    </div>
  )
}