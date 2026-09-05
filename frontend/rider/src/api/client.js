import axios from 'axios'

const API_BASE = import.meta.env.VITE_BACKEND_URL
const client = axios.create({ baseURL: API_BASE, headers: { 'Content-Type': 'application/json' } })

client.interceptors.request.use((config) => {
  const token = localStorage.getItem('access_token')
  if (token) config.headers.Authorization = `Bearer ${token}`
  return config
})

let isRefreshing = false
let pending = []
const flush = (err, token) => { pending.forEach(p => err ? p.reject(err) : p.resolve(token)); pending = [] }

client.interceptors.response.use(
  (r) => r,
  async (error) => {
    const orig = error.config
    if (error.response?.status !== 401 || orig._retry) return Promise.reject(error)
    if (isRefreshing) return new Promise((res, rej) => pending.push({ resolve: res, reject: rej }))
      .then(token => { orig.headers.Authorization = `Bearer ${token}`; return client(orig) })
    orig._retry = true; isRefreshing = true
    const refresh = localStorage.getItem('refresh_token')
    if (!refresh) { isRefreshing = false; window.location.href = '/login'; return Promise.reject(error) }
    try {
      const { data } = await axios.post(`${API_BASE}/auth/token/refresh/`, { refresh })
      localStorage.setItem('access_token', data.access)
      if (data.refresh) localStorage.setItem('refresh_token', data.refresh)
      flush(null, data.access)
      orig.headers.Authorization = `Bearer ${data.access}`
      return client(orig)
    } catch (e) {
      flush(e, null); localStorage.clear(); window.location.href = '/login'; return Promise.reject(e)
    } finally { isRefreshing = false }
  }
)

export default client
