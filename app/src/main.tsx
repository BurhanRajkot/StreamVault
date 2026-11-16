import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import { QueryClientProvider } from '@tanstack/react-query'
import { Toaster } from 'sonner'
import { queryClient } from '@/lib/queryClient'
import { AppAuthProvider } from '@app/auth/AppAuthProvider'
import { App } from '@app/App'
import { registerPremiumStreams } from '@app/native/premiumStreams'
import './app.css'

registerPremiumStreams()

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <AppAuthProvider>
          <App />
          <Toaster
            theme="dark"
            position="top-center"
            offset="calc(var(--sat) + 12px)"
            toastOptions={{ style: { background: 'hsl(240 5% 11%)', border: '1px solid hsl(240 4% 18%)', color: '#f5f5f5' } }}
          />
        </AppAuthProvider>
      </BrowserRouter>
    </QueryClientProvider>
  </React.StrictMode>
)
