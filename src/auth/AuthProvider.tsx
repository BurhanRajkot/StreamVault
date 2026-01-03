import { Auth0Provider } from '@auth0/auth0-react'
import { ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'

export function AuthProvider({ children }: { children: ReactNode }) {
  const navigate = useNavigate()

  const domain = import.meta.env.VITE_AUTH0_DOMAIN
  const clientId = import.meta.env.VITE_AUTH0_CLIENT_ID

  if (!domain || !clientId) {
    return (
      <div className="p-4 text-red-500">
        ❌ Auth0 configuration error. Check VITE_AUTH0_DOMAIN and
        VITE_AUTH0_CLIENT_ID
      </div>
    )
  }

  return (
    <Auth0Provider
      domain={domain}
      clientId={clientId}
      authorizationParams={{
        redirect_uri: window.location.origin,
      }}
      cacheLocation="localstorage"
      useRefreshTokens
      onRedirectCallback={(appState) => {
        navigate(appState?.returnTo || '/', { replace: true })
      }}
    >
      {children}
    </Auth0Provider>
  )
}

//routing fixed
