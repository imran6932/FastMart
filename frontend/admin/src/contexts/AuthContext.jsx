import React, { createContext, useCallback, useContext, useEffect, useState } from 'react'
import { getProfile } from '../api/index'
const Ctx = createContext(null)
export function AuthProvider({ children }) {
  const [user, setUser] = useState(null)
  const [loading, setLoading] = useState(true)
  useEffect(() => {
    const t = localStorage.getItem('access_token')
    if (!t) { setLoading(false); return }
    getProfile().then(r => setUser(r.data)).catch(() => localStorage.clear()).finally(() => setLoading(false))
  }, [])
  const login = useCallback((a, r, u) => { localStorage.setItem('access_token', a); localStorage.setItem('refresh_token', r); setUser(u) }, [])
  const logout = useCallback(() => { localStorage.clear(); setUser(null) }, [])
  return <Ctx.Provider value={{ user, loading, login, logout }}>{children}</Ctx.Provider>
}
export const useAuth = () => useContext(Ctx)
