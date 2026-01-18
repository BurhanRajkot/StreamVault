import { HelmetProvider } from 'react-helmet-async'
import { Toaster } from '@/components/ui/toaster'
import { Toaster as Sonner } from '@/components/ui/sonner'
import { TooltipProvider } from '@/components/ui/tooltip'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { Routes, Route } from 'react-router-dom'

import Index from './pages/Index'
import Favorites from './pages/Favorites'
import Watch from './pages/Watch'
import NotFound from './pages/NotFound'
import Downloads from './pages/Downloads'

import Login from './auth/Login'
import Signup from './auth/Signup'

const queryClient = new QueryClient()

const App = () => (
  <HelmetProvider>
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <Toaster />
        <Sonner />

        <Routes>
          <Route path="/" element={<Index />} />
          <Route path="/login" element={<Login />} />
          <Route path="/signup" element={<Signup />} />
          <Route path="/favorites" element={<Favorites />} />
          <Route path="/downloads" element={<Downloads />} />
          <Route path="/watch/:mediaType/:tmdbId" element={<Watch />} />
          <Route path="*" element={<NotFound />} />
        </Routes>
      </TooltipProvider>
    </QueryClientProvider>
  </HelmetProvider>
)

export default App
