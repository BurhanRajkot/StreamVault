import { useEffect } from 'react'
import { HelmetProvider } from 'react-helmet-async'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { Routes, Route } from 'react-router-dom'

import Index from './pages/Index'
import Favorites from './pages/Favorites'
import Downloads from './pages/Downloads'
import Watch from './pages/Watch'
import NotFound from './pages/NotFound'

const queryClient = new QueryClient()

export default function App() {
  useEffect(() => {
    fetch('https://streamvault-backend-bq9p.onrender.com/health').catch(() => {})
  }, [])

  return (
    <HelmetProvider>
      <QueryClientProvider client={queryClient}>
        <Routes>
          <Route path="/" element={<Index />} />
          <Route path="/downloads" element={<Downloads />} />
          <Route path="/favorites" element={<Favorites />} />
          <Route path="/watch/:mediaType/:tmdbId" element={<Watch />} />
          <Route path="*" element={<NotFound />} />
        </Routes>
      </QueryClientProvider>
    </HelmetProvider>
  )
}
