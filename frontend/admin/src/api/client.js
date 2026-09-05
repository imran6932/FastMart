import axios from 'axios'
const API = import.meta.env.VITE_BACKEND_URL
const client = axios.create({ baseURL: API, headers: { 'Content-Type': 'application/json' } })
client.interceptors.request.use(c => { const t = localStorage.getItem('access_token'); if (t) c.headers.Authorization = `Bearer ${t}`; return c })
let refreshing = false, queue = []
const flush = (e, t) => { queue.forEach(p => e ? p.reject(e) : p.resolve(t)); queue = [] }
client.interceptors.response.use(r => r, async err => {
  const orig = err.config
  if (err.response?.status !== 401 || orig._retry) return Promise.reject(err)
  if (refreshing) return new Promise((res, rej) => queue.push({ resolve: res, reject: rej })).then(t => { orig.headers.Authorization = `Bearer ${t}`; return client(orig) })
  orig._retry = true; refreshing = true
  const refresh = localStorage.getItem('refresh_token')
  if (!refresh) { refreshing = false; window.location.href = '/login'; return Promise.reject(err) }
  try {
    const { data } = await axios.post(`${API}/auth/token/refresh/`, { refresh })
    localStorage.setItem('access_token', data.access)
    if (data.refresh) localStorage.setItem('refresh_token', data.refresh)
    flush(null, data.access); orig.headers.Authorization = `Bearer ${data.access}`; return client(orig)
  } catch (e) { flush(e, null); localStorage.clear(); window.location.href = '/login'; return Promise.reject(e) }
  finally { refreshing = false }
})
export default client
