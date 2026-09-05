import React from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useCart } from '../contexts/CartContext'

export default function CartPage() {
  const { items, loading, update, remove, totalPrice } = useCart()
  const navigate = useNavigate()

  if (loading) return <div className="text-center py-16 text-gray-400">Loading cart…</div>

  if (items.length === 0) {
    return (
      <div className="text-center py-20">
        <p className="text-5xl mb-4">🛒</p>
        <p className="text-gray-500 mb-4">Your cart is empty.</p>
        <Link to="/" className="text-brand font-medium hover:underline">Browse Products</Link>
      </div>
    )
  }

  return (
    <div className="max-w-2xl mx-auto">
      <h1 className="text-2xl font-bold mb-6">Your Cart</h1>

      <div className="space-y-3 mb-6">
        {items.map((item) => (
          <div key={item.id} className="bg-white rounded-lg shadow p-4 flex items-center gap-4">
            {item.product?.image ? (
              <img src={item.product.image} alt={item.product.name} className="w-16 h-16 object-cover rounded" />
            ) : (
              <div className="w-16 h-16 bg-gray-100 rounded flex items-center justify-center text-2xl">🛍️</div>
            )}
            <div className="flex-1">
              <p className="font-medium">{item.product?.name}</p>
              <p className="text-sm text-gray-500">₹{item.product?.price_display} each</p>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => item.quantity > 1 ? update(item.id, item.quantity - 1) : remove(item.id)}
                className="w-7 h-7 rounded-full border flex items-center justify-center hover:bg-gray-100"
              >−</button>
              <span className="w-6 text-center font-medium">{item.quantity}</span>
              <button
                onClick={() => update(item.id, item.quantity + 1)}
                className="w-7 h-7 rounded-full border flex items-center justify-center hover:bg-gray-100"
              >+</button>
            </div>
            <div className="text-right w-20">
              <p className="font-semibold">₹{item.subtotal_display}</p>
              <button onClick={() => remove(item.id)} className="text-xs text-red-500 hover:underline mt-0.5">Remove</button>
            </div>
          </div>
        ))}
      </div>

      {/* Total + Checkout */}
      <div className="bg-white rounded-lg shadow p-4 flex items-center justify-between">
        <div>
          <p className="text-sm text-gray-500">Total</p>
          <p className="text-xl font-bold">₹{(totalPrice).toFixed(2)}</p>
        </div>
        <button
          onClick={() => navigate('/checkout')}
          className="bg-brand text-white px-6 py-2 rounded-lg font-medium hover:bg-brand-dark transition"
        >
          Proceed to Checkout
        </button>
      </div>
    </div>
  )
}
