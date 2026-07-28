import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import { AuthProvider } from '@/auth/AuthProvider'
import { QueryClientProvider } from '@tanstack/react-query'
import { queryClient } from '@/lib/queryClient'
import { ThemeProvider } from 'next-themes'

import App from './App'
import './index.css'
import { Toaster } from '@/components/ui/sonner'


// Suppress Chrome extension errors that are unrelated to our app
const originalError = console.error
console.error = (...args) => {
  if (
    typeof args[0] === 'string' &&
    args[0].includes('runtime.lastError')
  ) {
    return
  }
  originalError.apply(console, args)
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <AuthProvider>
          <ThemeProvider attribute="class" defaultTheme="dark" enableSystem={false}>
            <App />
            <Toaster />
          </ThemeProvider>
        </AuthProvider>
      </BrowserRouter>
    </QueryClientProvider>
  </React.StrictMode>
)

// ── Service Worker ────────────────────────────────────────────────────────────
// Registration is owned by vite-plugin-pwa (injectRegister: 'auto' emits
// registerSW.js and wires it into index.html at build time), and its
// registerType: 'autoUpdate' handles version rollover. Registering here as well
// would just re-register the same script.

