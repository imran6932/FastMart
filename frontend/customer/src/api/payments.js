import client from './client'

export const checkout = (delivery_address_id) =>
  client.post('/payments/checkout/', { delivery_address_id })

export const verifyPayment = (data) =>
  client.post('/payments/verify/', data)

export const getVapidKey = () =>
  client.get('/tracking/vapid-key/')

export const registerPushSubscription = (subscription) =>
  client.post('/tracking/push-subscription/', {
    endpoint: subscription.endpoint,
    p256dh_key: btoa(
      String.fromCharCode(...new Uint8Array(subscription.getKey('p256dh')))
    ),
    auth_key: btoa(
      String.fromCharCode(...new Uint8Array(subscription.getKey('auth')))
    ),
  })

export const checkServiceability = (address_id) =>
  client.get(`/tracking/check-serviceability/?address_id=${address_id}`)
