import client from './client'

export const login = (email, password) =>
  client.post('/auth/token/', { email, password })

export const register = (data) =>
  client.post('/auth/register/', data)

export const getProfile = () =>
  client.get('/auth/profile/')

export const updateProfile = (data) =>
  client.patch('/auth/profile/', data)

export const getAddresses = () =>
  client.get('/auth/addresses/')

export const createAddress = (data) =>
  client.post('/auth/addresses/', data)

export const updateAddress = (id, data) =>
  client.patch(`/auth/addresses/${id}/`, data)

export const deleteAddress = (id) =>
  client.delete(`/auth/addresses/${id}/`)

export const getVapidKey = () =>
  client.get('/tracking/vapid-key/')

export const registerPushSubscription = (subscription) =>
  client.post('/tracking/push-subscription/', {
    endpoint: subscription.endpoint,
    p256dh_key: btoa(String.fromCharCode.apply(null, new Uint8Array(subscription.getKey('p256dh')))),
    auth_key: btoa(String.fromCharCode.apply(null, new Uint8Array(subscription.getKey('auth')))),
  })
