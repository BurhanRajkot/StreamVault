import { HelmetProvider } from 'react-helmet-async'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { Routes, Route } from 'react-router-dom'

import Index from './pages/Index'
import Favorites from './pages/Favorites'
import Downloads from './pages/Downloads'
import Watch from './pages/Watch'
import Login from './auth/Login'
import Signup from './auth/Signup'
import NotFound from './pages/NotFound'

const queryClient = new QueryClient()

export default function App() {
  return (
    <HelmetProvider>
      <QueryClientProvider client={queryClient}>
        <Routes>
          <Route path="/" element={<Index />} />
          <Route path="/downloads" element={<Downloads />} />
          <Route path="/favorites" element={<Favorites />} />
          <Route path="/watch/:mediaType/:tmdbId" element={<Watch />} />
          <Route path="/login" element={<Login />} />
          <Route path="/signup" element={<Signup />} />
          <Route path="*" element={<NotFound />} />
        </Routes>
      </QueryClientProvider>
    </HelmetProvider>
  )
}
