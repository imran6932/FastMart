import client from './client'

export const login = (email, password) => client.post('/auth/token/', { email, password })
export const getProfile = () => client.get('/auth/profile/')

// Products
export const getProducts = (p = {}) => client.get('/products/', { params: { show_unavailable: 1, ...p } })
export const createProduct = (d) => client.post('/products/', d, { headers: { 'Content-Type': 'multipart/form-data' } })
export const updateProduct = (id, d) => client.patch(`/products/${id}/`, d, { headers: { 'Content-Type': 'multipart/form-data' } })
export const deleteProduct = (id) => client.delete(`/products/${id}/`)

// Categories
export const getCategories = () => client.get('/products/categories/')
export const createCategory = (d) => client.post('/products/categories/', d, { headers: { 'Content-Type': 'multipart/form-data' } })
export const updateCategory = (id, d) => client.patch(`/products/categories/${id}/`, d, { headers: { 'Content-Type': 'multipart/form-data' } })
export const deleteCategory = (id) => client.delete(`/products/categories/${id}/`)

// Orders
export const getOrders = (p = {}) => client.get('/orders/admin/', { params: p })
export const getOrder = (id) => client.get(`/orders/admin/${id}/`)

// Riders (live map + track page)
export const getRiders = () => client.get('/tracking/riders/')
export const getRiderActiveOrder = (riderId) => client.get(`/tracking/riders/${riderId}/active-order/`)

// Warehouses
export const getWarehouses = (p = {}) => client.get('/tracking/warehouses/', { params: p })
export const createWarehouse = (d) => client.post('/tracking/warehouses/', d)
export const updateWarehouse = (id, d) => client.patch(`/tracking/warehouses/${id}/`, d)
export const deleteWarehouse = (id) => client.delete(`/tracking/warehouses/${id}/`)
export const getWarehouse = (id) => client.get(`/tracking/warehouses/${id}/`)

// Push notifications
export const getVapidKey = () => client.get('/tracking/vapid-key/')
export const registerPushSubscription = (subscription) =>
  client.post('/tracking/push-subscription/', {
    endpoint: subscription.endpoint,
    p256dh_key: btoa(String.fromCharCode.apply(null, new Uint8Array(subscription.getKey('p256dh')))),
    auth_key: btoa(String.fromCharCode.apply(null, new Uint8Array(subscription.getKey('auth')))),
  })
