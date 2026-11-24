import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import { QueryClientProvider } from '@tanstack/react-query'
import { Toaster } from 'sonner'
import { queryClient } from '@/lib/queryClient'
import { AppAuthProvider } from '@app/auth/AppAuthProvider'
import { App } from '@app/App'
import { registerPremiumStreams } from '@app/native/premiumStreams'
import { markAppRequests } from '@app/native/clientHeader'
import { isAndroid, isDesktop } from '@app/native/platform'
import './app.css'

markAppRequests()
// Per-platform styling hooks: Android's WebView gets solid bars instead of live blur (app.css)
document.documentElement.classList.add(isAndroid ? 'sv-android' : isDesktop ? 'sv-desktop' : 'sv-web')
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
            toastOptions={{ className: 'sv-toast' }}
          />
        </AppAuthProvider>
      </BrowserRouter>
    </QueryClientProvider>
  </React.StrictMode>
)
