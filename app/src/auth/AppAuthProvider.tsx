import { useEffect, useCallback, type ReactNode } from 'react'
import { Auth0Provider, useAuth0 } from '@auth0/auth0-react'
import { useNavigate } from 'react-router-dom'
import { toast } from 'sonner'
import { isAndroid, SITE_URL } from '@app/native/platform'

/**
 * Auth0 for the app.
 *
 * Both shells serve the app as https://stream-vault.site, which Auth0
 * already lists as the site's callback and web origin, so the app signs in
 * against the same Auth0 application as the website with no extra setup.
 *
 * - Linux: exactly like the website — the window goes to Auth0's login page
 *   and comes back to https://stream-vault.site, which the shell serves from
 *   the app's own files.
 * - Android: Google refuses sign-ins inside an app's web view, so the login
 *   page opens in a Chrome Custom Tab. Auth0 then sends the browser to
 *   https://stream-vault.site/?code=…, which Android hands back to the app
 *   (a verified App Link — public/.well-known/assetlinks.json on the site),
 *   and the code is exchanged here.
 */
export function AppAuthProvider({ children }: { children: ReactNode }) {
  const navigate = useNavigate()
  return (
    <Auth0Provider
      domain={import.meta.env.VITE_AUTH0_DOMAIN}
      clientId={import.meta.env.VITE_AUTH0_CLIENT_ID}
      authorizationParams={{
        redirect_uri: SITE_URL,
        audience: import.meta.env.VITE_AUTH0_AUDIENCE,
        scope: 'openid profile email offline_access',
      }}
      cacheLocation="localstorage"
      useRefreshTokens
      // The hidden-iframe fallback needs Auth0's session cookie in the same
      // browser — true on Linux (same window), never in Android's web view.
      useRefreshTokensFallback={!isAndroid}
      onRedirectCallback={(appState) => navigate(appState?.returnTo || '/me', { replace: true })}
    >
      {isAndroid && <AndroidRedirectHandler />}
      {children}
    </Auth0Provider>
  )
}

/** Catches the App Link Auth0 returns to, and links to titles on the site. */
function AndroidRedirectHandler() {
  const { handleRedirectCallback } = useAuth0()
  const navigate = useNavigate()

  useEffect(() => {
    let remove: (() => void) | undefined
    void (async () => {
      const { App } = await import('@capacitor/app')
      const { Browser } = await import('@capacitor/browser')
      const handle = await App.addListener('appUrlOpen', async ({ url }) => {
        let parsed: URL
        try {
          parsed = new URL(url)
        } catch {
          return
        }
        const params = parsed.searchParams
        if (params.has('code') && params.has('state')) {
          await Browser.close().catch(() => {})
          try {
            const result = await handleRedirectCallback(url)
            const returnTo = (result?.appState as { returnTo?: string } | undefined)?.returnTo
            navigate(returnTo || '/me', { replace: true })
            toast.success('Signed in')
          } catch (err) {
            toast.error(err instanceof Error ? err.message : 'Sign-in failed')
          }
          return
        }
        if (params.has('error')) {
          await Browser.close().catch(() => {})
          toast.error(params.get('error_description') || 'Sign-in was cancelled')
          return
        }
        // Back from the logout page, or a shared link to the site
        await Browser.close().catch(() => {})
        const watch = /^\/watch\/(movie|tv)\/(\d+)/.exec(parsed.pathname)
        if (watch) navigate(`/title/${watch[1]}/${watch[2]}`)
      })
      remove = () => void handle.remove()
    })()
    return () => remove?.()
  }, [handleRedirectCallback, navigate])

  return null
}

/** Sign in / out, the right way for each shell. */
export function useAppAuth() {
  const { loginWithRedirect, logout, isAuthenticated, user, isLoading } = useAuth0()

  const signIn = useCallback(
    async (opts: { signup?: boolean; returnTo?: string } = {}) => {
      const authorizationParams = opts.signup ? { screen_hint: 'signup' as const } : undefined
      if (isAndroid) {
        const { Browser } = await import('@capacitor/browser')
        await loginWithRedirect({
          appState: { returnTo: opts.returnTo },
          authorizationParams,
          openUrl: (url) => Browser.open({ url, toolbarColor: '#0a0a0c' }),
        })
        return
      }
      await loginWithRedirect({ appState: { returnTo: opts.returnTo }, authorizationParams })
    },
    [loginWithRedirect]
  )

  const signOut = useCallback(async () => {
    if (isAndroid) {
      const { Browser } = await import('@capacitor/browser')
      await logout({
        logoutParams: { returnTo: SITE_URL },
        openUrl: (url) => Browser.open({ url, toolbarColor: '#0a0a0c' }),
      })
      return
    }
    await logout({ logoutParams: { returnTo: SITE_URL } })
  }, [logout])

  return { signIn, signOut, isAuthenticated, user, isLoading }
}
