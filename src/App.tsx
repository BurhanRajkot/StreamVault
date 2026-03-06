import { useEffect } from 'react'
import { HelmetProvider } from 'react-helmet-async'
import { BrowserRouter as Router, Routes, Route, useLocation } from 'react-router-dom'

import Index from './pages/Index'
import Favorites from './pages/Favorites'
import Downloads from './pages/Downloads'
import Watch from './pages/Watch'
import Pricing from './pages/Pricing'
import SubscriptionSuccess from './pages/SubscriptionSuccess'
import Login from './auth/Login'
import Signup from './auth/Signup'
import NotFound from './pages/NotFound'
import ServerError from './pages/ServerError'
import AccessDenied from './pages/AccessDenied'
import ErrorBoundary from './components/ErrorBoundary'
import AdminDashboard from './pages/admin/Dashboard'
import { FavoritesProvider } from './context/FavoritesContext'
import { DislikesProvider } from './context/DislikesContext'
import { SmoothScrollProvider } from './components/SmoothScrollProvider'

const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:4000'

const AppContent = () => {
  const location = useLocation()
  const backgroundLocation = location.state && location.state.backgroundLocation

  return (
    <>
      <Routes location={backgroundLocation || location}>
        <Route path="/" element={<Index />} />
        <Route path="/downloads" element={<Downloads />} />
        <Route path="/favorites" element={<Favorites />} />
        <Route path="/login" element={<Login />} />
        <Route path="/signup" element={<Signup />} />
        <Route path="/pricing" element={<Pricing />} />
        <Route path="/subscription/success" element={<SubscriptionSuccess />} />
        <Route path="/admin/dashboard" element={<AdminDashboard />} />

        {/* Fallback pattern for direct links to Watch page */}
        <Route path="/watch/:mediaType/:idAndSlug" element={<Watch />} />

        {/* Error Pages for Testing */}
        <Route path="/error/500" element={<ServerError />} />
        <Route path="/error/403" element={<AccessDenied />} />

        <Route path="*" element={<NotFound />} />
      </Routes>

      {/* Render Watch modal overlaid securely on background */}
      {backgroundLocation && (
        <Routes>
          <Route path="/watch/:mediaType/:idAndSlug" element={<Watch />} />
        </Routes>
      )}
    </>
  )
}

export default function App() {
  // FRONTEND WARM-UP PING (ELIMINATES COLD START FOR FIRST USER)
  useEffect(() => {
    fetch(`${API_BASE}/health`).catch(() => {
      // silently ignore errors — backend may not be running locally
    })
  }, [])

  return (
    <ErrorBoundary>
      <SmoothScrollProvider>
        <HelmetProvider>
          <FavoritesProvider>
            <DislikesProvider>
              <AppContent />
            </DislikesProvider>
          </FavoritesProvider>
        </HelmetProvider>
      </SmoothScrollProvider>
    </ErrorBoundary>
  )
}

