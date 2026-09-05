import React, { createContext, useCallback, useContext, useEffect, useState } from 'react'
import { getProfile } from '../api/auth'

const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null)
  const [loading, setLoading] = useState(true)

  // On mount, fetch the profile if we have a stored token.
  useEffect(() => {
    const token = localStorage.getItem('access_token')
    if (!token) {
      setLoading(false)
      return
    }
    getProfile()
      .then((res) => setUser(res.data))
      .catch(() => {
        localStorage.removeItem('access_token')
        localStorage.removeItem('refresh_token')
      })
      .finally(() => setLoading(false))
  }, [])

  const login = useCallback((accessToken, refreshToken, userData) => {
    localStorage.setItem('access_token', accessToken)
    localStorage.setItem('refresh_token', refreshToken)
    setUser(userData)
  }, [])

  const logout = useCallback(() => {
    localStorage.removeItem('access_token')
    localStorage.removeItem('refresh_token')
    // Clear location-related sessionStorage on logout
    sessionStorage.removeItem('locationCheckDone')
    sessionStorage.removeItem('serviceabilityStatus')
    sessionStorage.removeItem('serviceabilityError')
    sessionStorage.removeItem('serviceabilityAddressId')
    sessionStorage.removeItem('pushRegistrationDone')
    setUser(null)
  }, [])

  return (
    <AuthContext.Provider value={{ user, loading, login, logout }}>
      {children}
    </AuthContext.Provider>
  )
}

export const useAuth = () => useContext(AuthContext)
