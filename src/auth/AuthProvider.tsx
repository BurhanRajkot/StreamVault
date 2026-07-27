import { Auth0Provider } from '@auth0/auth0-react'
import { ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'

export function AuthProvider({ children }: { children: ReactNode }) {
  const navigate = useNavigate()

  const domain = import.meta.env.VITE_AUTH0_DOMAIN
  const clientId = import.meta.env.VITE_AUTH0_CLIENT_ID
  const audience = import.meta.env.VITE_AUTH0_AUDIENCE

  if (!domain || !clientId || !audience) {
    return (
      <div className="p-4 text-red-500">
        Missing Auth0 environment variables
      </div>
    )
  }

  return (
    <Auth0Provider
      domain={domain}
      clientId={clientId}
      authorizationParams={{
        redirect_uri: window.location.origin,
        audience,
        scope: 'openid profile email offline_access',
      }}
      cacheLocation="localstorage"
      useRefreshTokens
      // Without this, a refresh token that Auth0 has rotated away or revoked makes
      // every getAccessTokenSilently() call hard-fail — the SDK posts the stale token
      // to /oauth/token, gets 403 "Unknown or invalid refresh token", and rethrows.
      // Because several components request a token independently on mount, one stale
      // token in localStorage produces a burst of 403s and signed-in users silently
      // lose continue-watching, favourites and recommendations until they log out and
      // back in. With the fallback on, the SDK retries via a hidden /authorize
      // ?prompt=none iframe and recovers whenever the Auth0 session cookie is intact.
      useRefreshTokensFallback
      onRedirectCallback={(appState) => {
        navigate(appState?.returnTo || '/', { replace: true })
      }}
    >
      {children}
    </Auth0Provider>
  )
}
