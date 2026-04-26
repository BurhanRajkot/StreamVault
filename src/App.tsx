import { useEffect, lazy, Suspense } from 'react'
import { useAuth0 } from '@auth0/auth0-react'
import { useQueryClient } from '@tanstack/react-query'
import { fetchRecommendations } from './lib/api'
import { HelmetProvider } from 'react-helmet-async'
import { Routes, Route, useLocation } from 'react-router-dom'
import { AlertTriangle } from 'lucide-react'

import Index from './pages/Index'
import ErrorBoundary from './components/ErrorBoundary'
import { FavoritesProvider } from './context/FavoritesContext'
import { DislikesProvider } from './context/DislikesContext'
import { SmoothScrollProvider } from './components/SmoothScrollProvider'

// Route-level code splitting — only load pages when navigated to
const Favorites = lazy(() => import('./pages/Favorites'))
const Downloads = lazy(() => import('./pages/Downloads'))
const Watch = lazy(() => import('./pages/Watch'))
const Pricing = lazy(() => import('./pages/Pricing'))
const SubscriptionSuccess = lazy(() => import('./pages/SubscriptionSuccess'))
const Login = lazy(() => import('./auth/Login'))
const Signup = lazy(() => import('./auth/Signup'))
const NotFound = lazy(() => import('./pages/NotFound'))
// ServerError is statically imported by ErrorBoundary (class component, can't lazy-load there)
// so we keep it static here to avoid the mixed static/dynamic import Vite warning
import ServerError from './pages/ServerError'
const AccessDenied = lazy(() => import('./pages/AccessDenied'))
const AdminDashboard = lazy(() => import('./pages/admin/Dashboard'))

// Minimal loading fallback — matches dark background so there's no flash
const PageFallback = () => (
  <div className="min-h-screen bg-background" />
)


const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:4000'

const AppContent = () => {
  const location = useLocation()
  const backgroundLocation = location.state && location.state.backgroundLocation

  return (
    <Suspense fallback={<PageFallback />}>
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
    </Suspense>
  )
}


function PrefetchRecommendations() {
  const { isAuthenticated, isLoading, getAccessTokenSilently, user } = useAuth0()
  const queryClient = useQueryClient()

  useEffect(() => {
    if (isAuthenticated && !isLoading) {
      getAccessTokenSilently().then(token => {
        queryClient.prefetchQuery({
          queryKey: ['recommendations', user?.sub || 'authenticated'],
          queryFn: () => fetchRecommendations(token)
        }).catch(() => {})
      }).catch(() => {})
    }
  }, [isAuthenticated, isLoading, getAccessTokenSilently, queryClient, user?.sub])

  return null
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
        <PrefetchRecommendations />
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
