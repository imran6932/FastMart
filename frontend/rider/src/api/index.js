import client from './client'


export const login = (email, password) => client.post('/auth/token/', { email, password })
export const getProfile = () => client.get('/auth/profile/')

export const getRiderOrders = () => client.get('/orders/rider/')
export const getRiderOrder = (id) => client.get(`/orders/rider/${id}/`)
export const advanceOrderStatus = (id) => client.post(`/orders/rider/${id}/advance/`)

export const setDuty = (is_on_duty) => client.patch('/tracking/duty/', { is_on_duty })

export const getVapidKey = () => client.get('/tracking/vapid-key/')
export const registerPushSubscription = (sub) => client.post('/tracking/push-subscription/', {
  endpoint: sub.endpoint,
  p256dh_key: btoa(String.fromCharCode(...new Uint8Array(sub.getKey('p256dh')))),
  auth_key: btoa(String.fromCharCode(...new Uint8Array(sub.getKey('auth')))),
})
