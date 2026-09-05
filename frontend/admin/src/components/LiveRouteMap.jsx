import React, { useEffect, useRef, useState } from 'react'
import { MapContainer, Marker, Polyline, Popup, TileLayer, useMap } from 'react-leaflet'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import { fetchRoute } from '../utils/route'

// Fix Leaflet's default icon paths broken by Vite bundling.
delete L.Icon.Default.prototype._getIconUrl
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
  iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
  shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
})

const warehouseIcon = L.divIcon({ html: '🏢', className: 'text-2xl', iconSize: [30, 30], iconAnchor: [15, 15] })
const destinationIcon = L.divIcon({ html: '📍', className: 'text-2xl', iconSize: [30, 30], iconAnchor: [15, 28] })
const riderIcon = L.divIcon({ html: '🛵', className: 'text-2xl', iconSize: [30, 30], iconAnchor: [15, 15] })

// OpenStreetMap tiles — shows detailed street and shop names
const TILE_URL = 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png'
const TILE_ATTRIBUTION = '&copy; OpenStreetMap contributors'

// Re-fits the map bounds whenever the set of points to display changes
// (e.g. rider position updates, or the route finishes loading).
function FitBounds({ points }) {
  const map = useMap()
  useEffect(() => {
    if (points.length > 0) {
      map.fitBounds(L.latLngBounds(points), { padding: [40, 40] })
    }
  }, [points, map])
  return null
}

/**
 * Live route map: warehouse → destination, with the rider's live position.
 *
 * Props:
 *   warehouse:     { lat, lng, name } | null — route start (pickup point)
 *   destination:   { lat, lng, label } — route end (delivery address)
 *   riderPosition: { lat, lng } | null — live rider marker, updates as it changes
 *   height:        CSS height for the map container (default '16rem')
 */
export default function LiveRouteMap({ warehouse, destination, riderPosition, height = '16rem' }) {
  const [route, setRoute] = useState(null)
  const routeKeyRef = useRef(null)

  // Fetch the road route once per warehouse/destination pair — recalculating
  // on every rider GPS ping would be wasteful; only the rider marker moves live.
  useEffect(() => {
    if (!warehouse || !destination) return
    const key = `${warehouse.lat},${warehouse.lng}-${destination.lat},${destination.lng}`
    if (routeKeyRef.current === key) return
    routeKeyRef.current = key
    fetchRoute(warehouse, destination).then(setRoute)
  }, [warehouse, destination])

  // Allow "rider-only" mode (no destination yet) — used by the admin track
  // page when a rider has no active delivery to show a route for.
  if (!destination && !riderPosition) return null

  const points = [
    ...(warehouse ? [[warehouse.lat, warehouse.lng]] : []),
    ...(destination ? [[destination.lat, destination.lng]] : []),
    ...(riderPosition ? [[riderPosition.lat, riderPosition.lng]] : []),
  ]

  return (
    <div style={{ height }} className="rounded-lg overflow-hidden">
      <MapContainer center={points[0]} zoom={14} className="w-full h-full">
        <TileLayer url={TILE_URL} attribution={TILE_ATTRIBUTION} />
        <FitBounds points={points} />

        {warehouse && (
          <Marker position={[warehouse.lat, warehouse.lng]} icon={warehouseIcon}>
            <Popup>{warehouse.name || 'Warehouse'}</Popup>
          </Marker>
        )}

        {destination && (
          <Marker position={[destination.lat, destination.lng]} icon={destinationIcon}>
            <Popup>{destination.label || 'Delivery address'}</Popup>
          </Marker>
        )}

        {riderPosition && (
          <Marker position={[riderPosition.lat, riderPosition.lng]} icon={riderIcon}>
            <Popup>Rider — live position</Popup>
          </Marker>
        )}

        {route && <Polyline positions={route.points} pathOptions={{ color: '#2563eb', weight: 4, opacity: 0.7 }} />}
      </MapContainer>

      {route && route.distanceKm != null && (
        <div className="text-xs text-gray-500 mt-1 px-1">
          ~{route.distanceKm.toFixed(1)} km · ~{Math.round(route.durationMin)} min
        </div>
      )}
    </div>
  )
}
