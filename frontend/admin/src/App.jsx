import React, { useState } from 'react'
import {
  BrowserRouter,
  Link,
  Navigate,
  Route,
  Routes,
  useLocation,
} from 'react-router-dom'

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

  if (loading) {
    return (
      <div className="flex justify-center p-16 text-gray-400">
        Loading…
      </div>
    )
  }

  return user?.role === 'admin'
    ? children
    : <Navigate to="/login" replace />
}


function Sidebar({ isOpen, onClose }) {
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

  const handleLogout = () => {
    onClose()
    logout()
  }

  return (
    <>
      {/* Mobile overlay */}
      {isOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/50 md:hidden"
          onClick={onClose}
          aria-hidden="true"
        />
      )}

      {/* Sidebar */}
      <aside
        className={`
          fixed inset-y-0 left-0 z-50
          w-52 bg-gray-900 text-white
          flex flex-col
          transform transition-transform duration-300 ease-in-out
          md:static md:translate-x-0 md:min-h-screen md:flex-shrink-0

          ${isOpen ? 'translate-x-0' : '-translate-x-full'}
        `}
      >
        {/* Sidebar header */}
        <div className="p-4 border-b border-gray-700 flex items-center justify-between">
          <div>
            <p className="font-bold text-lg">FastMart</p>
            <p className="text-xs text-gray-400">Admin Panel</p>
          </div>

          {/* Close button - mobile only */}
          <button
            onClick={onClose}
            className="md:hidden text-gray-400 hover:text-white text-2xl leading-none"
            aria-label="Close menu"
          >
            ×
          </button>
        </div>

        {/* Navigation */}
        <nav className="flex-1 p-3 space-y-1 overflow-y-auto">
          {links.map((l) => {
            const isActive = pathname.startsWith(l.to)

            return (
              <Link
                key={l.to}
                to={l.to}
                onClick={onClose}
                className={`
                  block px-3 py-2 rounded-lg text-sm transition
                  ${
                    isActive
                      ? 'bg-gray-700 text-white'
                      : 'text-gray-300 hover:bg-gray-800'
                  }
                `}
              >
                {l.label}
              </Link>
            )
          })}
        </nav>

        {/* Logout */}
        <div className="p-3 border-t border-gray-700">
          <button
            onClick={handleLogout}
            className="w-full text-left text-sm text-gray-400 hover:text-white px-3 py-2"
          >
            Logout
          </button>
        </div>
      </aside>
    </>
  )
}


function Layout({ children }) {
  const [sidebarOpen, setSidebarOpen] = useState(false)

  const toggleSidebar = () => {
    setSidebarOpen((prev) => !prev)
  }

  const closeSidebar = () => {
    setSidebarOpen(false)
  }

  return (
    <div className="flex min-h-screen bg-gray-50">
      
      {/* Sidebar */}
      <Sidebar
        isOpen={sidebarOpen}
        onClose={closeSidebar}
      />

      {/* Main area */}
      <div className="flex-1 min-w-0 flex flex-col">

        {/* Mobile header */}
        <header className="md:hidden sticky top-0 z-30 bg-white border-b border-gray-200 px-4 py-3 flex items-center gap-3">
          <button
            onClick={toggleSidebar}
            className="inline-flex items-center justify-center w-10 h-10 rounded-lg bg-blue-900 text-white hover:bg-gray-800 transition"
            aria-label="Open menu"
            aria-expanded={sidebarOpen}
          >
            <span className="text-xl">☰</span>
          </button>

          <div>
            <p className="font-bold text-gray-900">FastMart</p>
            <p className="text-xs text-gray-500">Admin Panel</p>
          </div>
        </header>

        {/* Page content */}
        <main className="flex-1 p-4 sm:p-5 md:p-6 overflow-auto">
          {children}
        </main>

      </div>
    </div>
  )
}


function AppRoutes() {
  return (
    <Routes>
      <Route
        path="/login"
        element={<LoginPage />}
      />

      <Route
        path="/products"
        element={
          <Guard>
            <Layout>
              <ProductsPage />
            </Layout>
          </Guard>
        }
      />

      <Route
        path="/categories"
        element={
          <Guard>
            <Layout>
              <CategoriesPage />
            </Layout>
          </Guard>
        }
      />

      <Route
        path="/orders"
        element={
          <Guard>
            <Layout>
              <OrdersPage />
            </Layout>
          </Guard>
        }
      />

      <Route
        path="/warehouses"
        element={
          <Guard>
            <Layout>
              <WarehousesPage />
            </Layout>
          </Guard>
        }
      />

      <Route
        path="/riders"
        element={
          <Guard>
            <Layout>
              <RidersPage />
            </Layout>
          </Guard>
        }
      />

      <Route
        path="/riders/:riderId/track"
        element={
          <Guard>
            <Layout>
              <RiderTrackPage />
            </Layout>
          </Guard>
        }
      />

      <Route
        path="/map"
        element={
          <Guard>
            <Layout>
              <RidersMapPage />
            </Layout>
          </Guard>
        }
      />

      <Route
        path="*"
        element={
          <Navigate
            to="/products"
            replace
          />
        }
      />
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