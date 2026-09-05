import React from 'react'
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import { AuthProvider, useAuth } from './contexts/AuthContext'
import { LocationTrackingProvider } from './contexts/LocationTrackingContext'
import LoginPage from './pages/LoginPage'
import RegisterPage from './pages/RegisterPage'
import DashboardPage from './pages/DashboardPage'
import OrderDetailPage from './pages/OrderDetailPage'

function Guard({ children }) {
  const { user, loading } = useAuth()
  if (loading) return <div className="flex justify-center p-16 text-gray-400">Loading…</div>
  return user?.role === 'rider' ? children : <Navigate to="/login" replace />
}

function AppRoutes() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route path="/register" element={<RegisterPage />} />
      <Route path="/" element={<Guard><DashboardPage /></Guard>} />
      <Route path="/orders/:id" element={<Guard><OrderDetailPage /></Guard>} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <LocationTrackingProvider>
          <div className="min-h-screen bg-gray-50">
            <AppRoutes />
          </div>
        </LocationTrackingProvider>
      </AuthProvider>
    </BrowserRouter>
  )
}
