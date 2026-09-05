import React from 'react'
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import { AuthProvider, useAuth } from './contexts/AuthContext'
import { CartProvider } from './contexts/CartContext'
import { LocationProvider } from './contexts/LocationContext'
import Navbar from './components/Navbar'
import Footer from './components/Footer'
import ServiceBanner from './components/ServiceBanner'
import LocationModals from './components/LocationModals'
import CartPage from './pages/CartPage'
import CheckoutPage from './pages/CheckoutPage'
import HomePage from './pages/HomePage'
import LoginPage from './pages/LoginPage'
import OrdersPage from './pages/OrdersPage'
import OrderTrackingPage from './pages/OrderTrackingPage'
import ProfilePage from './pages/ProfilePage'
import RegisterPage from './pages/RegisterPage'

// Route guard — redirects to /login if user is not authenticated.
function ProtectedRoute({ children }) {
  const { user, loading } = useAuth()
  if (loading) return <div className="flex justify-center p-16 text-gray-500">Loading…</div>
  return user ? children : <Navigate to="/login" replace />
}

function AppRoutes() {
  return (
    <>
      <Navbar />
      <ServiceBanner />
      <main className="max-w-6xl mx-auto px-4 py-6 min-h-[calc(100vh-200px)]">
        <Routes>
          <Route path="/" element={<HomePage />} />
          <Route path="/login" element={<LoginPage />} />
          <Route path="/register" element={<RegisterPage />} />
          <Route path="/profile" element={<ProtectedRoute><ProfilePage /></ProtectedRoute>} />
          <Route path="/cart" element={<ProtectedRoute><CartPage /></ProtectedRoute>} />
          <Route path="/checkout" element={<ProtectedRoute><CheckoutPage /></ProtectedRoute>} />
          <Route path="/orders" element={<ProtectedRoute><OrdersPage /></ProtectedRoute>} />
          <Route path="/orders/:id" element={<ProtectedRoute><OrderTrackingPage /></ProtectedRoute>} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </main>
      <Footer />
      <LocationModals />
    </>
  )
}

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <CartProvider>
          <LocationProvider>
            <AppRoutes />
          </LocationProvider>
        </CartProvider>
      </AuthProvider>
    </BrowserRouter>
  )
}
