import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import { Auth0Provider } from '@auth0/auth0-react'
import { QueryClientProvider } from '@tanstack/react-query'
import { queryClient } from '@/lib/queryClient'
import { ThemeProvider } from 'next-themes'

import App from './App'
import './index.css'
import { FavoritesProvider } from '@/context/FavoritesContext'

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
        <Auth0Provider
          domain={import.meta.env.VITE_AUTH0_DOMAIN}
          clientId={import.meta.env.VITE_AUTH0_CLIENT_ID}
          authorizationParams={{
            redirect_uri: window.location.origin,
            audience: import.meta.env.VITE_AUTH0_AUDIENCE,
          }}
          cacheLocation="localstorage"
          useRefreshTokens
        >
          <ThemeProvider attribute="class" defaultTheme="system" enableSystem>
            <FavoritesProvider>
              <App />
            </FavoritesProvider>
          </ThemeProvider>
        </Auth0Provider>
      </BrowserRouter>
    </QueryClientProvider>
  </React.StrictMode>
)
