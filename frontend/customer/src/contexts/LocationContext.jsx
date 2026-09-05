import React, { createContext, useContext, useEffect, useState } from 'react'
import { checkServiceability } from '../api/payments'
import { getAddresses, createAddress, updateAddress } from '../api/auth'
import { useAuth } from './AuthContext'
import { persistServiceability } from '../utils/serviceability'

const LocationContext = createContext(null)

export function LocationProvider({ children }) {
  const { user, loading: authLoading } = useAuth() || {}
  const [locationStatus, setLocationStatus] = useState('idle') // idle | checking | available | unavailable | denied
  const [locationError, setLocationError] = useState('')
  const [showLocationModal, setShowLocationModal] = useState(false)
  const [showAddressForm, setShowAddressForm] = useState(false)
  const [showAddressSelection, setShowAddressSelection] = useState(false)
  const [cartEnabled, setCartEnabled] = useState(false)
  const [savedAddressId, setSavedAddressId] = useState(null)
  const [savedAddresses, setSavedAddresses] = useState([])

  // Address form state
  const [addressForm, setAddressForm] = useState({
    line1: '',
    city: '',
    state: '',
    pincode: '',
    latitude: null,
    longitude: null,
  })
  const [savingAddress, setSavingAddress] = useState(false)

  // FEATURE 1: Location Check — runs ONCE PER SESSION, globally, regardless of page.
  // Only runs once the user is authenticated (address/serviceability endpoints
  // require auth) — running it for guests would otherwise trigger a 401 and
  // force-redirect to /login via the API client's response interceptor.
  useEffect(() => {
    // When user logs out (user becomes null), reset all location state
    if (!authLoading && !user) {
      setLocationStatus('idle')
      setLocationError('')
      setSavedAddressId(null)
      setSavedAddresses([])
      setCartEnabled(false)
      setShowLocationModal(false)
      setShowAddressForm(false)
      setShowAddressSelection(false)
      return
    }

    if (authLoading || !user) return

    const locationCheckDone = sessionStorage.getItem('locationCheckDone')
    if (!locationCheckDone) {
      checkLocationAndServiceability()
      sessionStorage.setItem('locationCheckDone', 'true')
    } else {
      // Already checked in this session - just load the default address for display
      restoreDefaultAddress()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, authLoading])

  // FEATURE 2: Check availability on page refresh/focus (window focus)
  // Re-check serviceability when user returns to the page or refreshes
  useEffect(() => {
    if (!user || authLoading) return

    const handleWindowFocus = async () => {
      // Recheck serviceability when user returns to the page
      if (savedAddressId) {
        try {
          setLocationStatus('checking')
          const { data: serviceData } = await checkServiceability(savedAddressId)
          if (serviceData.can_proceed) {
            setLocationStatus('available')
            setCartEnabled(true)
            setLocationError('')
          } else {
            setLocationStatus('unavailable')
            setLocationError(serviceData.message || 'Service is not available in your area. Please try another address.')
            setCartEnabled(false)
          }
          persistServiceability(savedAddressId, serviceData.can_proceed, serviceData.message)
        } catch (err) {
          console.error('Serviceability recheck failed:', err)
        }
      }
    }

    // Check every time window gets focus (user returns to tab)
    window.addEventListener('focus', handleWindowFocus)
    return () => window.removeEventListener('focus', handleWindowFocus)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, authLoading, savedAddressId])

  const restoreDefaultAddress = async () => {
    try {
      // Check if serviceability was already checked post-auth BEFORE fetching addresses
      const serviceabilityStatus = sessionStorage.getItem('serviceabilityStatus')
      const serviceabilityError = sessionStorage.getItem('serviceabilityError')
      
      const { data: addressesData } = await getAddresses()
      const addresses = addressesData.results ?? addressesData

      if (addresses && addresses.length > 0) {
        const defaultAddress = addresses.find((a) => a.is_default) || addresses[0]
        if (defaultAddress) {
          setSavedAddresses(addresses)
          setSavedAddressId(defaultAddress.id)
          
          // Use pre-checked serviceability result if available
          if (serviceabilityStatus) {
            const isAvailable = serviceabilityStatus === 'available'
            console.log('Using cached serviceability status:', isAvailable)
            setLocationStatus(isAvailable ? 'available' : 'unavailable')
            if (!isAvailable) {
              setLocationError(serviceabilityError || 'Service is not available in your area. Please try another address.')
            } else {
              setLocationError('')
            }
            setCartEnabled(isAvailable)
          } else if (defaultAddress.location) {
            // Re-check if not already cached
            console.log('No cached status, checking serviceability now')
            checkAddressServiceability(defaultAddress)
          }
        }
      }
    } catch (err) {
      console.error('Failed to restore address:', err)
    }
  }

  const checkLocationAndServiceability = async () => {
    setLocationStatus('checking')

    try {
      // Get saved addresses
      const { data: addressesData } = await getAddresses()
      const addresses = addressesData.results ?? addressesData

      if (addresses && addresses.length > 0) {
        setSavedAddresses(addresses)

        // Check if serviceability was already checked post-auth
        const serviceabilityStatus = sessionStorage.getItem('serviceabilityStatus')
        if (serviceabilityStatus) {
          // Use the pre-checked result
          const isAvailable = serviceabilityStatus === 'available'
          setLocationStatus(isAvailable ? 'available' : 'unavailable')
          if (!isAvailable) {
            const error = sessionStorage.getItem('serviceabilityError')
            setLocationError(error || 'Service is not available in your area. Please try another address.')
          }
          setCartEnabled(isAvailable)
          const addressId = sessionStorage.getItem('serviceabilityAddressId')
          if (addressId) setSavedAddressId(parseInt(addressId))
        } else {
          // Silently check the default/first address's serviceability.
          // Do NOT auto-open the selection modal — it would cover the banner.
          // Users can open it manually via "Change Address".
          const defaultAddress = addresses.find((a) => a.is_default) || addresses[0]
          if (defaultAddress && defaultAddress.location) {
            checkAddressServiceability(defaultAddress)
          } else {
            setLocationStatus('idle')
          }
        }
      } else {
        // No addresses - request location
        setLocationStatus('idle')
        requestLocationPermission()
      }
    } catch (err) {
      console.error('Location check failed:', err)
      setLocationStatus('idle')
      requestLocationPermission()
    }
  }

  const checkAddressServiceability = async (address) => {
    try {
      setLocationStatus('checking')
      const { data: serviceData } = await checkServiceability(address.id)

      if (serviceData.can_proceed) {
        setLocationStatus('available')
        setCartEnabled(true)
        setSavedAddressId(address.id)
        setLocationError('')
      } else {
        setLocationStatus('unavailable')
        setLocationError(serviceData.message || 'Service is not available in your area. Please try another address.')
        setCartEnabled(false)
        setSavedAddressId(address.id)
      }
      persistServiceability(address.id, serviceData.can_proceed, serviceData.message)
    } catch (err) {
      console.error('Serviceability check failed:', err)
      setLocationStatus('unavailable')
      setLocationError('Could not verify service availability.')
      setCartEnabled(false)
      persistServiceability(address.id, false, 'Could not verify service availability.')
    }
  }

  const handleSelectAddress = (address) => {
    checkAddressServiceability(address)
    setShowAddressSelection(false)
  }

  const requestLocationPermission = () => {
    // Just show the modal - don't request geolocation yet
    setShowLocationModal(true)
  }

  const handleAllowLocation = () => {
    if (!navigator.geolocation) {
      setLocationStatus('denied')
      setLocationError('Geolocation is not supported by your browser.')
      setCartEnabled(false)
      setShowLocationModal(false)
      return
    }

    setLocationStatus('checking')
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        // Successfully got location - now show address form
        const { latitude, longitude } = pos.coords
        setAddressForm((prev) => ({
          ...prev,
          latitude,
          longitude,
        }))
        setShowLocationModal(false)
        setShowAddressForm(true)
      },
      (err) => {
        console.error('Geolocation error:', err)
        setLocationStatus('denied')
        setLocationError('Please enable location access to continue shopping.')
        setCartEnabled(false)
        setShowLocationModal(false)
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
    )
  }

  const handleAddressInputChange = (e) => {
    const { name, value } = e.target
    setAddressForm((prev) => ({
      ...prev,
      [name]: value,
    }))
  }

  const handleSaveAddress = async (e) => {
    e.preventDefault()

    if (!addressForm.line1 || !addressForm.city || !addressForm.state || !addressForm.pincode) {
      alert('Please fill all address fields')
      return
    }

    setSavingAddress(true)
    try {
      const addressData = {
        line1: addressForm.line1,
        city: addressForm.city,
        state: addressForm.state,
        pincode: addressForm.pincode,
        latitude: addressForm.latitude,
        longitude: addressForm.longitude,
        is_default: true,
      }

      // Try to get existing default address to update
      const { data: addressesData } = await getAddresses()
      const addresses = addressesData.results ?? addressesData
      const defaultAddress = addresses.find((a) => a.is_default)

      let newSavedAddressId = null
      if (defaultAddress) {
        // Update existing default address
        await updateAddress(defaultAddress.id, addressData)
        newSavedAddressId = defaultAddress.id
      } else {
        // Create new address
        const { data: newAddress } = await createAddress(addressData)
        newSavedAddressId = newAddress.id
      }

      setSavedAddressId(newSavedAddressId)
      setShowAddressForm(false)

      // Refresh saved addresses list
      const { data: refreshedData } = await getAddresses()
      setSavedAddresses(refreshedData.results ?? refreshedData)

      // Check serviceability with saved address
      try {
        const { data: serviceData } = await checkServiceability(newSavedAddressId)

        if (serviceData.can_proceed) {
          setLocationStatus('available')
          setCartEnabled(true)
        } else {
          setLocationStatus('unavailable')
          setLocationError(serviceData.message || 'Service is not available in your area. Please try another address.')
          setCartEnabled(false)
        }
        persistServiceability(newSavedAddressId, serviceData.can_proceed, serviceData.message)
      } catch (serviceErr) {
        console.error('Serviceability check failed:', serviceErr)
        setLocationStatus('unavailable')
        setLocationError('Could not verify service availability.')
        setCartEnabled(false)
        persistServiceability(newSavedAddressId, false, 'Could not verify service availability.')
      }
    } catch (err) {
      console.error('Error saving address:', err)
      alert('Failed to save address. Please try again.')
    } finally {
      setSavingAddress(false)
    }
  }

  const handleSkipAddressForm = () => {
    setShowAddressForm(false)
    setLocationStatus('unavailable')
    setLocationError('Please add a delivery address to continue shopping.')
    setCartEnabled(false)
  }

  const retryLocation = () => {
    checkLocationAndServiceability()
  }

  const changeAddress = () => {
    // Show address selection modal to let user change address
    if (savedAddresses.length > 0) {
      setShowAddressSelection(true)
    } else {
      requestLocationPermission()
    }
  }

  const addNewAddress = () => {
    setShowAddressSelection(false)
    // Reset form and ask for location
    setAddressForm({
      line1: '',
      city: '',
      state: '',
      pincode: '',
      latitude: null,
      longitude: null,
    })
    requestLocationPermission()
  }

  const value = {
    locationStatus,
    locationError,
    showLocationModal,
    showAddressForm,
    showAddressSelection,
    cartEnabled,
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
    retryLocation,
    changeAddress,
    addNewAddress,
  }

  return <LocationContext.Provider value={value}>{children}</LocationContext.Provider>
}

export const useServiceLocation = () => useContext(LocationContext)
