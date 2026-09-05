/**
 * Axios client with JWT auth interceptors.
 *
 * Every outgoing request gets an Authorization: Bearer <token> header from
 * localStorage. On a 401 response the interceptor automatically tries to
 * refresh the token using the stored refresh token, then retries the original
 * request once. If the refresh also fails (expired/revoked), the user is
 * redirected to /login.
 *
 * Why interceptors instead of passing the token manually?
 * Avoids duplicating the auth header logic in every API call site. The
 * interceptor is a single, testable place for the JWT lifecycle.
 */

import axios from 'axios'

const API_BASE = import.meta.env.VITE_BACKEND_URL

const client = axios.create({
  baseURL: API_BASE,
  headers: { 'Content-Type': 'application/json' },
})

// ── Request interceptor: attach access token ─────────────────────────────────
client.interceptors.request.use((config) => {
  const token = localStorage.getItem('access_token')
  if (token) {
    config.headers.Authorization = `Bearer ${token}`
  }
  return config
})

// ── Response interceptor: auto-refresh on 401 ────────────────────────────────
let isRefreshing = false
let pendingRequests = []

const processQueue = (error, token = null) => {
  pendingRequests.forEach((prom) => {
    if (error) prom.reject(error)
    else prom.resolve(token)
  })
  pendingRequests = []
}

client.interceptors.response.use(
  (response) => response,
  async (error) => {
    const originalRequest = error.config

    if (error.response?.status !== 401 || originalRequest._retry) {
      return Promise.reject(error)
    }

    if (isRefreshing) {
      // Queue the failed request until the refresh completes.
      return new Promise((resolve, reject) => {
        pendingRequests.push({ resolve, reject })
      }).then((token) => {
        originalRequest.headers.Authorization = `Bearer ${token}`
        return client(originalRequest)
      })
    }

    originalRequest._retry = true
    isRefreshing = true

    const refreshToken = localStorage.getItem('refresh_token')
    if (!refreshToken) {
      isRefreshing = false
      window.location.href = '/login'
      return Promise.reject(error)
    }

    try {
      const { data } = await axios.post(`${API_BASE}/auth/token/refresh/`, {
        refresh: refreshToken,
      })
      localStorage.setItem('access_token', data.access)
      if (data.refresh) localStorage.setItem('refresh_token', data.refresh)
      processQueue(null, data.access)
      originalRequest.headers.Authorization = `Bearer ${data.access}`
      return client(originalRequest)
    } catch (refreshError) {
      processQueue(refreshError, null)
      localStorage.removeItem('access_token')
      localStorage.removeItem('refresh_token')
      window.location.href = '/login'
      return Promise.reject(refreshError)
    } finally {
      isRefreshing = false
    }
  }
)

export default client
