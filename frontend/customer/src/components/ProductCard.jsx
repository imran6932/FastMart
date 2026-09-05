import React from 'react'
import { useCart } from '../contexts/CartContext'
import { useAuth } from '../contexts/AuthContext'
import { useNavigate } from 'react-router-dom'

export default function ProductCard({ product, cartEnabled = true }) {
  const { add, update, remove, items } = useCart()
  const { user } = useAuth()
  const navigate = useNavigate()

  // Cart items nest the full product object (see CartItemSerializer),
  // so match on item.product.id — not item.product (which is an object).
  const cartItem = items.find((item) => item.product.id === product.id)
  const quantity = cartItem?.quantity ?? 0

  const handleAdd = async () => {
    if (!user) { navigate('/login'); return }
    if (!cartEnabled) {
      alert('Service is not available in your area. Please check your location.')
      return
    }
    try {
      await add(product.id, 1)
    } catch (err) {
      alert(err.response?.data?.detail || 'Could not add to cart')
    }
  }

  const handleIncrease = async () => {
    if (!cartItem) return
    try {
      await update(cartItem.id, cartItem.quantity + 1)
    } catch (err) {
      alert(err.response?.data?.detail || 'Could not update cart')
    }
  }

  const handleDecrease = async () => {
    if (!cartItem) return
    try {
      if (cartItem.quantity <= 1) {
        await remove(cartItem.id)
      } else {
        await update(cartItem.id, cartItem.quantity - 1)
      }
    } catch (err) {
      alert(err.response?.data?.detail || 'Could not update cart')
    }
  }

  return (
    <div className={`bg-white rounded-lg shadow hover:shadow-md transition p-3 flex flex-col ${!cartEnabled ? 'opacity-60' : ''}`}>
      {product.image ? (
        <img
          src={product.image}
          alt={product.name}
          className="w-full h-36 object-cover rounded mb-2"
        />
      ) : (
        <div className="w-full h-36 bg-gray-100 rounded mb-2 flex items-center justify-center text-3xl">
          🛍️
        </div>
      )}

      <p className="text-xs text-gray-400 uppercase tracking-wide">{product.category?.name}</p>
      <h3 className="font-semibold text-sm mt-0.5 flex-1">{product.name}</h3>
      <div className="mt-2 flex items-center justify-between gap-2">
        <span className="font-bold text-brand">₹{product.price_display}</span>

        {quantity === 0 ? (
          <button
            onClick={handleAdd}
            disabled={product.stock === 0 || !cartEnabled}
            className="bg-brand text-white text-xs px-3 py-1 rounded disabled:opacity-50 hover:bg-brand-dark transition whitespace-nowrap"
            title={!cartEnabled ? 'Service unavailable in your area' : product.stock === 0 ? 'Out of Stock' : 'Add to cart'}
          >
            {product.stock === 0 ? 'Out of Stock' : !cartEnabled ? '🚫 Limited' : '+ Add'}
          </button>
        ) : (
          <div className="flex items-center gap-1 bg-brand text-white rounded">
            <button
              onClick={handleDecrease}
              className="px-2 py-1 hover:bg-brand-dark transition text-lg font-bold leading-none"
            >
              −
            </button>
            <span className="px-2 font-semibold min-w-[1.5rem] text-center">{quantity}</span>
            <button
              onClick={handleIncrease}
              disabled={quantity >= product.stock}
              className="px-2 py-1 hover:bg-brand-dark transition text-lg font-bold leading-none disabled:opacity-50"
            >
              +
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
