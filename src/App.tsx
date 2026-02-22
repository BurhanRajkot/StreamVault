import { useEffect } from 'react'
import { HelmetProvider } from 'react-helmet-async'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { Routes, Route } from 'react-router-dom'

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

const queryClient = new QueryClient()
const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:4000'

export default function App() {
  // FRONTEND WARM-UP PING (ELIMINATES COLD START FOR FIRST USER)
  useEffect(() => {
    fetch(`${API_BASE}/health`).catch(() => {
      // silently ignore errors
    })
  }, [])

  return (
    <ErrorBoundary>
      <HelmetProvider>
        <QueryClientProvider client={queryClient}>
          <FavoritesProvider>
            <DislikesProvider>
              <Routes>
                <Route path="/" element={<Index />} />
                <Route path="/downloads" element={<Downloads />} />
                <Route path="/favorites" element={<Favorites />} />
                <Route path="/watch/:mediaType/:tmdbId" element={<Watch />} />
                <Route path="/login" element={<Login />} />
                <Route path="/signup" element={<Signup />} />
                <Route path="/pricing" element={<Pricing />} />
                <Route path="/subscription/success" element={<SubscriptionSuccess />} />
                <Route path="/admin/dashboard" element={<AdminDashboard />} />

                {/* Error Pages for Testing */}
                <Route path="/error/500" element={<ServerError />} />
                <Route path="/error/403" element={<AccessDenied />} />

                <Route path="*" element={<NotFound />} />
              </Routes>
            </DislikesProvider>
          </FavoritesProvider>
        </QueryClientProvider>
      </HelmetProvider>
    </ErrorBoundary>
  )
}
