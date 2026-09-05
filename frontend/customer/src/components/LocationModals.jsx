import React from 'react'
import { useServiceLocation } from '../contexts/LocationContext'

// Global modals for location permission, address form, and address selection.
// Rendered once in App.jsx so they can appear over any page.
export default function LocationModals() {
  const ctx = useServiceLocation()
  if (!ctx) return null

  const {
    locationStatus,
    locationError,
    showLocationModal,
    showAddressForm,
    showAddressSelection,
    savedAddressId,
    savedAddresses,
    addressForm,
    savingAddress,
    setShowLocationModal,
    setShowAddressForm,
    setShowAddressSelection,
    handleSelectAddress,
    handleAllowLocation,
    handleAddressInputChange,
    handleSaveAddress,
    handleSkipAddressForm,
    addNewAddress,
  } = ctx

  return (
    <>
      {/* Location Permission Modal */}
      {showLocationModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-2xl p-8 max-w-md mx-4 shadow-2xl">
            <div className="text-center mb-6">
              <div className="text-6xl mb-4">📍</div>
              <h2 className="text-2xl font-bold text-gray-800 mb-2">Enable Location Access</h2>
              <p className="text-gray-600">We need your location to check if service is available in your area.</p>
            </div>

            <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-6">
              <p className="text-sm text-gray-700">
                <strong>Why?</strong> This helps us find nearby warehouses and ensure timely delivery to your location.
              </p>
            </div>

            <div className="space-y-3">
              <button
                onClick={handleAllowLocation}
                className="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold py-3 rounded-lg transition"
              >
                Allow Location Access
              </button>
              <button
                onClick={() => setShowLocationModal(false)}
                className="w-full bg-gray-200 hover:bg-gray-300 text-gray-800 font-bold py-3 rounded-lg transition"
              >
                Ask Later
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Address Form Modal */}
      {showAddressForm && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-2xl p-8 max-w-md mx-4 shadow-2xl max-h-[90vh] overflow-y-auto">
            <div className="text-center mb-6">
              <div className="text-6xl mb-4">📮</div>
              <h2 className="text-2xl font-bold text-gray-800 mb-2">Delivery Address</h2>
              <p className="text-gray-600 text-sm">Please confirm your delivery address</p>
            </div>

            <form onSubmit={handleSaveAddress} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Address *</label>
                <input
                  type="text"
                  name="line1"
                  value={addressForm.line1}
                  onChange={handleAddressInputChange}
                  placeholder="Street address, building name, etc."
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-600"
                  required
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">City *</label>
                <input
                  type="text"
                  name="city"
                  value={addressForm.city}
                  onChange={handleAddressInputChange}
                  placeholder="City name"
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-600"
                  required
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">State *</label>
                <input
                  type="text"
                  name="state"
                  value={addressForm.state}
                  onChange={handleAddressInputChange}
                  placeholder="State"
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-600"
                  required
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Pincode *</label>
                <input
                  type="text"
                  name="pincode"
                  value={addressForm.pincode}
                  onChange={handleAddressInputChange}
                  placeholder="6-digit pincode"
                  maxLength="6"
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-600"
                  required
                />
              </div>

              <div className="bg-gray-50 border border-gray-200 rounded-lg p-3 text-xs text-gray-600">
                <strong>Location:</strong> {addressForm.latitude?.toFixed(4)}, {addressForm.longitude?.toFixed(4)}
              </div>

              <div className="space-y-3 pt-4">
                <button
                  type="submit"
                  disabled={savingAddress}
                  className="w-full bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white font-bold py-3 rounded-lg transition"
                >
                  {savingAddress ? 'Saving...' : '✓ Save Address & Continue'}
                </button>
                <button
                  type="button"
                  onClick={handleSkipAddressForm}
                  disabled={savingAddress}
                  className="w-full bg-gray-200 hover:bg-gray-300 disabled:opacity-50 text-gray-800 font-bold py-3 rounded-lg transition"
                >
                  Ask Later
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Address Selection Modal */}
      {showAddressSelection && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-2xl p-8 max-w-md mx-4 shadow-2xl max-h-[90vh] overflow-y-auto">
            <div className="text-center mb-6">
              <div className="text-6xl mb-4">📍</div>
              <h2 className="text-2xl font-bold text-gray-800 mb-2">Select Delivery Address</h2>
              <p className="text-gray-600 text-sm">Choose an address to check service availability</p>
            </div>

            {/* Service Status */}
            {locationStatus === 'checking' && (
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 mb-4 flex items-center gap-2">
                <svg className="animate-spin w-4 h-4 text-blue-600" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" />
                </svg>
                <span className="text-sm text-blue-800">Checking availability...</span>
              </div>
            )}

            {locationStatus === 'available' && (
              <div className="bg-green-50 border border-green-200 rounded-lg p-3 mb-4 flex items-center gap-2">
                <span className="text-lg">✅</span>
                <span className="text-sm text-green-800 font-medium">Service available</span>
              </div>
            )}

            {locationStatus === 'unavailable' && locationError && (
              <div className="bg-red-50 border border-red-200 rounded-lg p-3 mb-4">
                <p className="text-sm text-red-800"><strong>⚠️ Service unavailable</strong></p>
                <p className="text-xs text-red-700 mt-1">{locationError}</p>
              </div>
            )}

            {/* Saved Addresses List */}
            <div className="space-y-3 mb-4">
              {savedAddresses.map((address) => (
                <button
                  key={address.id}
                  onClick={() => handleSelectAddress(address)}
                  className={`w-full p-4 rounded-lg border-2 text-left transition ${
                    savedAddressId === address.id
                      ? 'border-blue-600 bg-blue-50'
                      : 'border-gray-200 bg-white hover:border-blue-300'
                  }`}
                >
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <p className="font-semibold text-gray-800">{address.line1}</p>
                      <p className="text-sm text-gray-600">
                        {address.city}, {address.state} {address.pincode}
                      </p>
                      {address.is_default && (
                        <span className="inline-block mt-2 px-2 py-1 bg-blue-100 text-blue-700 text-xs font-semibold rounded">
                          Default
                        </span>
                      )}
                    </div>
                    {savedAddressId === address.id && (
                      <span className="text-2xl">✓</span>
                    )}
                  </div>
                </button>
              ))}
            </div>

            {/* Add New Address Button */}
            <div className="space-y-3 pt-4 border-t border-gray-200">
              <button
                onClick={addNewAddress}
                className="w-full bg-green-600 hover:bg-green-700 text-white font-bold py-3 rounded-lg transition"
              >
                + Add New Address
              </button>
              <button
                onClick={() => setShowAddressSelection(false)}
                className="w-full bg-gray-200 hover:bg-gray-300 text-gray-800 font-bold py-3 rounded-lg transition"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
