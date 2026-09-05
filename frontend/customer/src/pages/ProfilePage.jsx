import React, { useState, useEffect } from 'react'
import { useAuth } from '../contexts/AuthContext'
import { getAddresses, createAddress, updateAddress, deleteAddress, getProfile, updateProfile } from '../api/auth'

export default function ProfilePage() {
  const { user, logout } = useAuth()
  const [activeTab, setActiveTab] = useState('profile') // profile | addresses
  const [profile, setProfile] = useState(user)
  const [addresses, setAddresses] = useState([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  
  // Profile form
  const [profileForm, setProfileForm] = useState({
    first_name: user?.first_name || '',
    last_name: user?.last_name || '',
    phone: user?.phone || '',
  })
  
  // Address form
  const [showAddressForm, setShowAddressForm] = useState(false)
  const [editingAddressId, setEditingAddressId] = useState(null)
  const [addressForm, setAddressForm] = useState({
    line1: '',
    city: '',
    state: '',
    pincode: '',
    is_default: false,
    latitude: null,
    longitude: null,
  })

  // Fetch data on mount
  useEffect(() => {
    const fetchData = async () => {
      try {
        setLoading(true)
        const [profileRes, addressesRes] = await Promise.all([
          getProfile(),
          getAddresses(),
        ])
        setProfile(profileRes.data)
        setProfileForm({
          first_name: profileRes.data.first_name || '',
          last_name: profileRes.data.last_name || '',
          phone: profileRes.data.phone || '',
        })
        setAddresses(addressesRes.data.results || addressesRes.data)
      } catch (err) {
        setError('Failed to load profile. Please try again.')
        console.error(err)
      } finally {
        setLoading(false)
      }
    }
    fetchData()
  }, [])

  const handleSaveProfile = async (e) => {
    e.preventDefault()
    setSaving(true)
    setError('')
    setSuccess('')
    try {
      const res = await updateProfile(profileForm)
      setProfile(res.data)
      setSuccess('Profile updated successfully!')
    } catch (err) {
      const d = err.response?.data
      setError(typeof d === 'object' ? Object.values(d).flat().join(' ') : 'Failed to update profile')
    } finally {
      setSaving(false)
    }
  }

  const handleAddAddress = () => {
    setEditingAddressId(null)
    setAddressForm({
      line1: '',
      city: '',
      state: '',
      pincode: '',
      is_default: false,
      latitude: null,
      longitude: null,
    })
    setShowAddressForm(true)
  }

  const handleEditAddress = (address) => {
    setEditingAddressId(address.id)
    setAddressForm({
      line1: address.line1,
      city: address.city,
      state: address.state,
      pincode: address.pincode,
      is_default: address.is_default,
      latitude: address.lat || null,
      longitude: address.lng || null,
    })
    setShowAddressForm(true)
  }

  const handleSaveAddress = async (e) => {
    e.preventDefault()
    setSaving(true)
    setError('')
    setSuccess('')
    try {
      const data = {
        line1: addressForm.line1,
        city: addressForm.city,
        state: addressForm.state,
        pincode: addressForm.pincode,
        is_default: addressForm.is_default,
        latitude: parseFloat(addressForm.latitude),
        longitude: parseFloat(addressForm.longitude),
      }

      if (editingAddressId) {
        await updateAddress(editingAddressId, data)
      } else {
        await createAddress(data)
      }

      const res = await getAddresses()
      setAddresses(res.data.results || res.data)
      setShowAddressForm(false)
      setSuccess('Address saved successfully!')
    } catch (err) {
      const d = err.response?.data
      setError(typeof d === 'object' ? Object.values(d).flat().join(' ') : 'Failed to save address')
    } finally {
      setSaving(false)
    }
  }

  const handleDeleteAddress = async (addressId) => {
    if (!window.confirm('Are you sure you want to delete this address?')) return
    
    setSaving(true)
    setError('')
    setSuccess('')
    try {
      await deleteAddress(addressId)
      const res = await getAddresses()
      setAddresses(res.data.results || res.data)
      setSuccess('Address deleted successfully!')
    } catch (err) {
      setError('Failed to delete address')
    } finally {
      setSaving(false)
    }
  }

  const handleGetLocation = () => {
    if (!navigator.geolocation) {
      setError('Geolocation is not supported by your browser.')
      return
    }

    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setAddressForm((prev) => ({
          ...prev,
          latitude: pos.coords.latitude,
          longitude: pos.coords.longitude,
        }))
        setSuccess('Location detected!')
      },
      (err) => {
        setError('Could not get your location: ' + err.message)
      }
    )
  }

  if (loading) return <div className="text-center py-16">Loading...</div>

  return (
    <div className="max-w-4xl mx-auto">
      <h1 className="text-3xl font-bold mb-6">My Account</h1>

      {error && <div className="bg-red-50 text-red-700 border border-red-200 rounded p-3 mb-4">{error}</div>}
      {success && <div className="bg-green-50 text-green-700 border border-green-200 rounded p-3 mb-4">{success}</div>}

      <div className="flex gap-4 mb-6 border-b">
        <button
          onClick={() => setActiveTab('profile')}
          className={`px-4 py-2 font-medium transition ${
            activeTab === 'profile'
              ? 'text-blue-600 border-b-2 border-blue-600'
              : 'text-gray-600 hover:text-gray-900'
          }`}
        >
          👤 Profile Information
        </button>
        <button
          onClick={() => setActiveTab('addresses')}
          className={`px-4 py-2 font-medium transition ${
            activeTab === 'addresses'
              ? 'text-blue-600 border-b-2 border-blue-600'
              : 'text-gray-600 hover:text-gray-900'
          }`}
        >
          📍 Addresses ({addresses.length})
        </button>
      </div>

      {activeTab === 'profile' && (
        <div className="bg-white rounded-lg shadow p-6 max-w-2xl">
          <h2 className="text-xl font-bold mb-6">Profile Information</h2>
          <form onSubmit={handleSaveProfile} className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium mb-1">First Name</label>
                <input
                  type="text"
                  value={profileForm.first_name}
                  onChange={(e) => setProfileForm({ ...profileForm, first_name: e.target.value })}
                  className="w-full border rounded px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Last Name</label>
                <input
                  type="text"
                  value={profileForm.last_name}
                  onChange={(e) => setProfileForm({ ...profileForm, last_name: e.target.value })}
                  className="w-full border rounded px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Email</label>
              <input
                type="email"
                value={profile?.email || ''}
                disabled
                className="w-full border rounded px-3 py-2 bg-gray-100 text-gray-600"
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Phone</label>
              <input
                type="tel"
                value={profileForm.phone}
                onChange={(e) => setProfileForm({ ...profileForm, phone: e.target.value })}
                className="w-full border rounded px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <button
              type="submit"
              disabled={saving}
              className="w-full bg-blue-600 text-white py-2 rounded font-medium hover:bg-blue-700 disabled:opacity-50 transition"
            >
              {saving ? 'Saving...' : 'Save Changes'}
            </button>
          </form>
        </div>
      )}

      {activeTab === 'addresses' && (
        <div>
          {!showAddressForm ? (
            <>
              <button
                onClick={handleAddAddress}
                className="mb-6 px-4 py-2 bg-blue-600 text-white rounded font-medium hover:bg-blue-700 transition"
              >
                + Add New Address
              </button>

              {addresses.length === 0 ? (
                <div className="bg-gray-50 rounded-lg p-8 text-center">
                  <p className="text-gray-600 mb-4">No addresses saved yet</p>
                  <button
                    onClick={handleAddAddress}
                    className="px-4 py-2 bg-blue-600 text-white rounded font-medium hover:bg-blue-700"
                  >
                    Add Your First Address
                  </button>
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {addresses.map((address) => (
                    <div key={address.id} className="border rounded-lg p-4 bg-white shadow-sm hover:shadow-md transition">
                      <div className="flex items-start justify-between mb-3">
                        <h3 className="font-semibold text-gray-900">{address.city}, {address.state}</h3>
                        {address.is_default && (
                          <span className="px-2 py-1 bg-green-100 text-green-800 text-xs font-medium rounded">
                            Default
                          </span>
                        )}
                      </div>
                      <p className="text-sm text-gray-600 mb-2">{address.line1}</p>
                      <p className="text-sm text-gray-600 mb-4">{address.pincode}</p>
                      <div className="flex gap-2">
                        <button
                          onClick={() => handleEditAddress(address)}
                          className="flex-1 px-3 py-2 border border-blue-600 text-blue-600 rounded text-sm font-medium hover:bg-blue-50 transition"
                        >
                          Edit
                        </button>
                        <button
                          onClick={() => handleDeleteAddress(address.id)}
                          className="flex-1 px-3 py-2 border border-red-500 text-red-500 rounded text-sm font-medium hover:bg-red-50 transition"
                        >
                          Delete
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </>
          ) : (
            <div className="bg-white rounded-lg shadow p-6">
              <h3 className="text-lg font-bold mb-4">{editingAddressId ? 'Edit Address' : 'Add New Address'}</h3>
              <form onSubmit={handleSaveAddress} className="space-y-4">
                <div>
                  <label className="block text-sm font-medium mb-1">Address *</label>
                  <input
                    type="text"
                    required
                    value={addressForm.line1}
                    onChange={(e) => setAddressForm({ ...addressForm, line1: e.target.value })}
                    placeholder="Street address"
                    className="w-full border rounded px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                <div className="grid grid-cols-3 gap-4">
                  <div>
                    <label className="block text-sm font-medium mb-1">City *</label>
                    <input
                      type="text"
                      required
                      value={addressForm.city}
                      onChange={(e) => setAddressForm({ ...addressForm, city: e.target.value })}
                      className="w-full border rounded px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium mb-1">State *</label>
                    <input
                      type="text"
                      required
                      value={addressForm.state}
                      onChange={(e) => setAddressForm({ ...addressForm, state: e.target.value })}
                      className="w-full border rounded px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium mb-1">Pincode *</label>
                    <input
                      type="text"
                      required
                      value={addressForm.pincode}
                      onChange={(e) => setAddressForm({ ...addressForm, pincode: e.target.value })}
                      className="w-full border rounded px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                </div>

                <div className="border-t pt-4">
                  <label className="block text-sm font-medium mb-3">📍 Location Coordinates</label>
                  <div className="grid grid-cols-2 gap-4 mb-3">
                    <div>
                      <label className="block text-xs text-gray-600 mb-1">Latitude *</label>
                      <input
                        type="number"
                        required
                        step="0.000001"
                        value={addressForm.latitude || ''}
                        onChange={(e) => setAddressForm({ ...addressForm, latitude: e.target.value })}
                        className="w-full border rounded px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                      />
                    </div>
                    <div>
                      <label className="block text-xs text-gray-600 mb-1">Longitude *</label>
                      <input
                        type="number"
                        required
                        step="0.000001"
                        value={addressForm.longitude || ''}
                        onChange={(e) => setAddressForm({ ...addressForm, longitude: e.target.value })}
                        className="w-full border rounded px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                      />
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={handleGetLocation}
                    className="w-full px-3 py-2 border border-gray-300 text-gray-700 rounded text-sm font-medium hover:bg-gray-50 transition"
                  >
                    📡 Use My Current Location
                  </button>
                </div>

                <div className="flex items-center">
                  <input
                    type="checkbox"
                    id="is_default"
                    checked={addressForm.is_default}
                    onChange={(e) => setAddressForm({ ...addressForm, is_default: e.target.checked })}
                    className="w-4 h-4 text-blue-600 rounded"
                  />
                  <label htmlFor="is_default" className="ml-2 text-sm text-gray-700">
                    Set as default address
                  </label>
                </div>

                <div className="flex gap-3 pt-4 border-t">
                  <button
                    type="button"
                    onClick={() => setShowAddressForm(false)}
                    className="flex-1 px-4 py-2 border border-gray-300 text-gray-700 rounded font-medium hover:bg-gray-50 transition"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={saving}
                    className="flex-1 px-4 py-2 bg-blue-600 text-white rounded font-medium hover:bg-blue-700 disabled:opacity-50 transition"
                  >
                    {saving ? 'Saving...' : 'Save Address'}
                  </button>
                </div>
              </form>
            </div>
          )}
        </div>
      )}

      <div className="mt-8 pt-6 border-t">
        <button
          onClick={logout}
          className="px-4 py-2 bg-red-600 text-white rounded font-medium hover:bg-red-700 transition"
        >
          Sign Out
        </button>
      </div>
    </div>
  )
}
