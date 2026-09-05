import React from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import { useCart } from '../contexts/CartContext'

export default function Navbar() {
  const { user, logout } = useAuth()
  const { totalItems } = useCart()
  const navigate = useNavigate()

  const handleLogout = () => {
    logout()
    navigate('/login')
  }

  return (
    <nav className="sticky top-0 z-40 bg-brand text-white shadow-md">
      <div className="max-w-6xl mx-auto px-4 h-14 flex items-center justify-between">
        <Link to="/" className="text-xl font-bold tracking-tight">
          🛒 FastMart
        </Link>

        <div className="flex items-center gap-4 text-sm">
          {user ? (
            <>
              <Link to="/orders" className="hover:underline">My Orders</Link>
              <Link to="/profile" className="hover:underline">Profile</Link>
              <Link to="/cart" className="relative hover:underline">
                Cart
                {totalItems > 0 && (
                  <span className="absolute -top-2 -right-3 bg-yellow-400 text-black text-xs rounded-full w-4 h-4 flex items-center justify-center font-bold">
                    {totalItems}
                  </span>
                )}
              </Link>
              <button onClick={handleLogout} className="hover:underline">
                Logout ({user.first_name})
              </button>
            </>
          ) : (
            <>
              <Link to="/login" className="hover:underline">Login</Link>
              <Link to="/register" className="bg-white text-brand px-3 py-1 rounded font-medium hover:bg-gray-100">
                Sign Up
              </Link>
            </>
          )}
        </div>
      </div>
    </nav>
  )
}
