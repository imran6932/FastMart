// Fetches a road-following route between two points using the public OSRM
// demo routing server (router.project-osrm.org — free, no API key needed).
// Falls back to a straight line between the two points if the request fails
// (offline, demo server rate-limited, etc.) so the map always has something
// to draw instead of erroring out.
export async function fetchRoute(from, to) {
  try {
    const url = `https://router.project-osrm.org/route/v1/driving/${from.lng},${from.lat};${to.lng},${to.lat}?overview=full&geometries=geojson`
    const res = await fetch(url)
    if (!res.ok) throw new Error(`OSRM responded ${res.status}`)
    const data = await res.json()
    const route = data.routes && data.routes[0]
    if (!route) throw new Error('No route found')
    return {
      points: route.geometry.coordinates.map(([lng, lat]) => [lat, lng]),
      distanceKm: route.distance / 1000,
      durationMin: route.duration / 60,
    }
  } catch (err) {
    console.warn('Route fetch failed, falling back to straight line:', err)
    return {
      points: [[from.lat, from.lng], [to.lat, to.lng]],
      distanceKm: null,
      durationMin: null,
    }
  }
}
