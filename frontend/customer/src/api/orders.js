import client from './client'

export const getCart = () =>
  client.get('/orders/cart/')

export const addToCart = (product_id, quantity = 1) =>
  client.post('/orders/cart/', { product_id, quantity })

export const updateCartItem = (id, quantity) =>
  client.patch(`/orders/cart/${id}/`, { quantity })

export const removeCartItem = (id) =>
  client.delete(`/orders/cart/${id}/`)

export const getOrders = () =>
  client.get('/orders/')

export const getOrder = (id) =>
  client.get(`/orders/${id}/`)

export const cancelOrder = (id, reason = '') =>
  client.post(`/orders/${id}/cancel/`, { reason })
