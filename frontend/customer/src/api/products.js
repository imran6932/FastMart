import client from './client'

export const getCategories = () =>
  client.get('/products/categories/')

export const getProducts = (params = {}) =>
  client.get('/products/', { params })

export const getProduct = (id) =>
  client.get(`/products/${id}/`)
