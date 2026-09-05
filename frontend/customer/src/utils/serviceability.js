// Shared helper to persist a serviceability check result to sessionStorage.
//
// LocationContext reads these keys on page load/refresh (restoreDefaultAddress)
// so the availability banner shows the correct status immediately, without
// waiting for a fresh API call. Every place that calls checkServiceability and
// gets a fresh result must call this so the cache never goes stale — otherwise
// a refresh right after the cache was set (e.g. at login) would show an old
// status even though the user has since selected a different/unavailable address.
export function persistServiceability(addressId, isAvailable, message) {
  sessionStorage.setItem('serviceabilityStatus', isAvailable ? 'available' : 'unavailable')
  sessionStorage.setItem('serviceabilityError', message || '')
  if (addressId != null) sessionStorage.setItem('serviceabilityAddressId', String(addressId))
}
