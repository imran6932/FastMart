import React from 'react'
import { BrowserRouter, Link, Navigate, Route, Routes, useLocation } from 'react-router-dom'
import { AuthProvider, useAuth } from './contexts/AuthContext'
import LoginPage from './pages/LoginPage'
import ProductsPage from './pages/ProductsPage'
import CategoriesPage from './pages/CategoriesPage'
import OrdersPage from './pages/OrdersPage'
import RidersMapPage from './pages/RidersMapPage'
import RidersPage from './pages/RidersPage'
import RiderTrackPage from './pages/RiderTrackPage'
import WarehousesPage from './pages/WarehousesPage'

function Guard({ children }) {
  const { user, loading } = useAuth()
  if (loading) return <div className="flex justify-center p-16 text-gray-400">Loading…</div>
  return user?.role === 'admin' ? children : <Navigate to="/login" replace />
}

function Sidebar() {
  const { logout } = useAuth()
  const { pathname } = useLocation()
  const links = [
    { to: '/products', label: '📦 Products' },
    { to: '/categories', label: '🏷️ Categories' },
    { to: '/orders', label: '🧾 Orders' },
    { to: '/warehouses', label: '🏢 Warehouses' },
    { to: '/riders', label: '🧑‍✈️ Riders' },
    { to: '/map', label: '🗺 Live Map' },
  ]
  return (
    <aside className="w-52 bg-gray-900 text-white min-h-screen flex flex-col">
      <div className="p-4 border-b border-gray-700">
        <p className="font-bold text-lg">FastMart</p>
        <p className="text-xs text-gray-400">Admin Panel</p>
      </div>
      <nav className="flex-1 p-3 space-y-1">
        {links.map(l => (
          <Link key={l.to} to={l.to}
            className={`block px-3 py-2 rounded-lg text-sm transition ${pathname.startsWith(l.to) ? 'bg-gray-700 text-white' : 'text-gray-300 hover:bg-gray-800'}`}>
            {l.label}
          </Link>
        ))}
      </nav>
      <div className="p-3 border-t border-gray-700">
        <button onClick={logout} className="w-full text-left text-sm text-gray-400 hover:text-white px-3 py-2">Logout</button>
      </div>
    </aside>
  )
}

function Layout({ children }) {
  return (
    <div className="flex min-h-screen bg-gray-50">
      <Sidebar />
      <main className="flex-1 p-6 overflow-auto">{children}</main>
    </div>
  )
}

function AppRoutes() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route path="/products" element={<Guard><Layout><ProductsPage /></Layout></Guard>} />
      <Route path="/categories" element={<Guard><Layout><CategoriesPage /></Layout></Guard>} />
      <Route path="/orders" element={<Guard><Layout><OrdersPage /></Layout></Guard>} />
      <Route path="/warehouses" element={<Guard><Layout><WarehousesPage /></Layout></Guard>} />
      <Route path="/riders" element={<Guard><Layout><RidersPage /></Layout></Guard>} />
      <Route path="/riders/:riderId/track" element={<Guard><Layout><RiderTrackPage /></Layout></Guard>} />
      <Route path="/map" element={<Guard><Layout><RidersMapPage /></Layout></Guard>} />
      <Route path="*" element={<Navigate to="/products" replace />} />
    </Routes>
  )
}

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <AppRoutes />
      </AuthProvider>
    </BrowserRouter>
  )
}
