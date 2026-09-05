import React, { useEffect, useRef, useState } from 'react'
import { MapContainer, Marker, Popup, TileLayer, useMap } from 'react-leaflet'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import { getRiders, getWarehouses } from '../api/index'
import { createReconnectingSocket } from '../utils/reconnectingSocket'

// Fix Leaflet icon bundling issue with Vite.
delete L.Icon.Default.prototype._getIconUrl
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
  iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
  shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
})

const riderIcon = L.divIcon({ html: '🛵', className: 'text-2xl', iconSize: [30, 30], iconAnchor: [15, 15] })
const warehouseIcon = L.divIcon({ html: '🏪', className: 'text-2xl', iconSize: [30, 30], iconAnchor: [15, 15] })

// Inner component to handle map re-centering when data loads
function MapContent({ warehouses, onDutyRiders }) {
  const map = useMap()

  useEffect(() => {
    console.log('🗺 MapContent rendering with:', { warehouses: warehouses.length, riders: onDutyRiders.length })
    console.log('  Warehouses:', warehouses)
    console.log('  Riders:', onDutyRiders)
    
    const allLocations = [
      ...onDutyRiders.map(r => [r.lat, r.lng]),
      ...warehouses.filter(w => w.latitude && w.longitude).map(w => [w.latitude, w.longitude])
    ]

    if (allLocations.length > 0) {
      // Create bounds from all locations
      const bounds = L.latLngBounds(allLocations)
      map.fitBounds(bounds, { padding: [50, 50] })
    }
  }, [warehouses, onDutyRiders, map])

  return (
    <>
      <div className="absolute top-4 left-4 bg-white px-3 py-2 rounded-lg shadow z-10 text-sm">
        <p className="font-semibold text-gray-700">🗺 OpenStreetMap</p>
      </div>
      <TileLayer
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        attribution="&copy; OpenStreetMap contributors"
      />
      {warehouses.map(warehouse => 
        warehouse.latitude && warehouse.longitude ? (
          <Marker key={`warehouse-${warehouse.id}`} position={[warehouse.latitude, warehouse.longitude]} icon={warehouseIcon}>
            <Popup>
              <p className="font-semibold">{warehouse.name}</p>
              <p className="text-xs text-gray-500">{warehouse.city}, {warehouse.state}</p>
              <p className="text-xs text-gray-500">Warehouse #{warehouse.id}</p>
            </Popup>
          </Marker>
        ) : null
      )}
      {onDutyRiders.map(rider => (
        <Marker key={rider.rider_id} position={[rider.lat, rider.lng]} icon={riderIcon}>
          <Popup>
            <p className="font-semibold">{rider.email}</p>
            <p className="text-xs text-gray-500">Rider #{rider.rider_id}</p>
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

  // Poll REST endpoint every 10s as fallback, AND subscribe to each rider's WS for real-time updates.
  // Each WS auto-reconnects on drop (see reconnectingSocket.js) instead of
  // relying solely on the next 10s poll to notice and reopen it.
  useEffect(() => {
    const fetchRiders = () => {
      getRiders().then(r => {
        const list = r.data
        setRiders(list)
        // Open a WebSocket for each on-duty rider we don't already have a connection for.
        const token = localStorage.getItem('access_token')
        const protocol = window.location.protocol === 'https:' ? 'wss' : 'ws'
        // Connect to backend (localhost:8000), not the frontend dev server's own host/port.
        const backendHost = window.location.hostname === 'localhost' ? 'localhost:8000' : window.location.host
        list.forEach(rider => {
          if (!rider.lat || wsRefs.current[rider.rider_id]) return
          wsRefs.current[rider.rider_id] = createReconnectingSocket(
            `${protocol}://${backendHost}/ws/riders/${rider.rider_id}/?token=${token}`,
            {
              onMessage: (e) => {
                const data = JSON.parse(e.data)
                if (data.type === 'rider.location') {
                  setRiders(prev => prev.map(r => r.rider_id === data.rider_id ? { ...r, lat: data.lat, lng: data.lng } : r))
                }
              },
            }
          )
        })
      })
    }
    fetchRiders()
    const interval = setInterval(fetchRiders, 10000)
    return () => {
      clearInterval(interval)
      Object.values(wsRefs.current).forEach(handle => handle.close())
      wsRefs.current = {}
    }
  }, [])

  // Fetch warehouses on mount
  useEffect(() => {
    getWarehouses().then(r => {
      console.log('📦 Warehouses fetched:', r.data)
      setWarehouses(r.data)
    }).catch(err => {
      console.error('❌ Failed to fetch warehouses:', err)
    })
  }, [])

  const onDutyRiders = riders.filter(r => r.is_on_duty && r.lat)

  return (
    <div>
      <h1 className="text-2xl font-bold mb-4">Live Map - Warehouses & Riders</h1>
      <div className="flex gap-4 mb-4">
        <div className="bg-white rounded-lg shadow px-4 py-3">
          <p className="text-2xl font-bold text-blue-600">{warehouses.length}</p>
          <p className="text-xs text-gray-500 mt-0.5">Warehouses</p>
        </div>
        <div className="bg-white rounded-lg shadow px-4 py-3">
          <p className="text-2xl font-bold text-indigo-600">{riders.filter(r => r.is_on_duty).length}</p>
          <p className="text-xs text-gray-500 mt-0.5">On Duty</p>
        </div>
        <div className="bg-white rounded-lg shadow px-4 py-3">
          <p className="text-2xl font-bold text-green-600">{onDutyRiders.length}</p>
          <p className="text-xs text-gray-500 mt-0.5">Riders with Location</p>
        </div>
      </div>

      <div className="rounded-xl overflow-hidden shadow" style={{ height: '65vh' }}>
        <MapContainer center={[20.5937, 78.9629]} zoom={10} className="w-full h-full">
          <MapContent warehouses={warehouses} onDutyRiders={onDutyRiders} />
        </MapContainer>
      </div>
    </div>
  )
}
