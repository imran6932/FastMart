import React, { createContext, useCallback, useContext, useEffect, useState } from 'react'
import { addToCart, getCart, removeCartItem, updateCartItem } from '../api/orders'
import { useAuth } from './AuthContext'

const CartContext = createContext(null)

export function CartProvider({ children }) {
  const { user } = useAuth()
  const [items, setItems] = useState([])
  const [loading, setLoading] = useState(false)

  const fetchCart = useCallback(async () => {
    if (!user) { setItems([]); return }
    setLoading(true)
    try {
      const res = await getCart()
      setItems(res.data.results ?? res.data)
    } catch {
      // silent — cart may just be empty
    } finally {
      setLoading(false)
    }
  }, [user])

  useEffect(() => { fetchCart() }, [fetchCart])

  const add = async (productId, qty = 1) => {
    await addToCart(productId, qty)
    fetchCart()
  }

  const update = async (itemId, qty) => {
    await updateCartItem(itemId, qty)
    fetchCart()
  }

  const remove = async (itemId) => {
    await removeCartItem(itemId)
    fetchCart()
  }

  const totalItems = items.length  // Number of unique items in cart
  const totalPrice = items.reduce((sum, i) => sum + i.subtotal, 0)

  return (
    <CartContext.Provider value={{ items, loading, add, update, remove, totalItems, totalPrice, fetchCart }}>
      {children}
    </CartContext.Provider>
  )
}

export const useCart = () => useContext(CartContext)
