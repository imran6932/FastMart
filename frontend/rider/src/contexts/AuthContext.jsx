import React, { createContext, useCallback, useContext, useEffect, useState } from 'react'
import { getProfile } from '../api/index'

const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const token = localStorage.getItem('access_token')
    if (!token) { setLoading(false); return }
    getProfile().then(r => setUser(r.data)).catch(() => localStorage.clear()).finally(() => setLoading(false))
  }, [])

  const login = useCallback((access, refresh, userData) => {
    localStorage.setItem('access_token', access)
    localStorage.setItem('refresh_token', refresh)
    setUser(userData)
  }, [])

  const logout = useCallback(() => { localStorage.clear(); setUser(null) }, [])

  return <AuthContext.Provider value={{ user, loading, login, logout }}>{children}</AuthContext.Provider>
}

export const useAuth = () => useContext(AuthContext)
