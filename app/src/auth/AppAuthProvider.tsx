import { useEffect, useCallback, type ReactNode } from 'react'
import { Auth0Provider, useAuth0 } from '@auth0/auth0-react'
import { useNavigate } from 'react-router-dom'
import { toast } from 'sonner'
import { desktop, isAndroid, SITE_URL } from '@app/native/platform'

/**
 * Auth0 for the app.
 *
 * Both shells serve the app as https://stream-vault.site, which Auth0
 * already lists as the site's callback and web origin, so the app signs in
 * against the same Auth0 application as the website with no extra setup.
 *
 * Google refuses sign-ins inside an app's embedded browser ("This browser or
 * app may not be secure"), so neither shell shows the login page itself:
 *
 * - Linux, Windows: the login opens in the system browser by way of the site,
 *   which hands Auth0's answer back to the shell on a loopback port
 *   (app/electron/main.cjs 'sv:sign-in', src/lib/appSignIn.ts on the website),
 *   and the code is exchanged here.
 * - Android: the login
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
      // The hidden-iframe fallback needs Auth0's session cookie in this
      // window, and the login happens in another browser on every shell.
      useRefreshTokensFallback={false}
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
  const { loginWithRedirect, handleRedirectCallback, logout, isAuthenticated, user, isLoading } = useAuth0()
  const navigate = useNavigate()

  const signIn = useCallback(
    async (opts: { signup?: boolean; returnTo?: string } = {}) => {
      const authorizationParams: { screen_hint?: 'signup'; prompt?: 'login' } = opts.signup ? { screen_hint: 'signup' } : {}
      if (isAndroid) {
        const { Browser } = await import('@capacitor/browser')
        await loginWithRedirect({
          appState: { returnTo: opts.returnTo },
          authorizationParams,
          openUrl: (url) => Browser.open({ url, toolbarColor: '#0a0a0c' }),
        })
        return
      }
      const browserSignIn = desktop?.signIn
      if (browserSignIn) {
        // The browser keeps its Auth0 session; after signing out, ask again
        // rather than signing straight back in to the same account.
        if (readSignedOut()) authorizationParams.prompt = 'login'
        const returned: { url: string | null } = { url: null }
        const toastId = toast.loading('Continue signing in in your browser…', {
          duration: Infinity,
          action: { label: 'Cancel', onClick: () => void desktop?.cancelSignIn?.() },
        })
        try {
          await loginWithRedirect({
            appState: { returnTo: opts.returnTo },
            authorizationParams,
            openUrl: async (url) => {
              returned.url = await browserSignIn(url)
            },
          })
          if (!returned.url) {
            toast.dismiss(toastId)
            return
          }
          const params = new URL(returned.url).searchParams
          if (params.has('error')) throw new Error(params.get('error_description') || 'Sign-in was cancelled')
          const result = await handleRedirectCallback(returned.url)
          writeSignedOut(false)
          const returnTo = (result?.appState as { returnTo?: string } | undefined)?.returnTo
          navigate(returnTo || '/me', { replace: true })
          toast.success('Signed in', { id: toastId, duration: 3000, action: undefined })
        } catch (err) {
          toast.error(err instanceof Error ? err.message : 'Sign-in failed', { id: toastId, duration: 6000, action: undefined })
        }
        return
      }
      await loginWithRedirect({ appState: { returnTo: opts.returnTo }, authorizationParams })
    },
    [loginWithRedirect, handleRedirectCallback, navigate]
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
    writeSignedOut(true)
    await logout({ logoutParams: { returnTo: SITE_URL } })
  }, [logout])

  return { signIn, signOut, isAuthenticated, user, isLoading }
}

const SIGNED_OUT_KEY = 'sv-signed-out'

function readSignedOut(): boolean {
  try {
    return localStorage.getItem(SIGNED_OUT_KEY) === '1'
  } catch {
    return false
  }
}

function writeSignedOut(value: boolean): void {
  try {
    if (value) localStorage.setItem(SIGNED_OUT_KEY, '1')
    else localStorage.removeItem(SIGNED_OUT_KEY)
  } catch {
    // Not fatal: the next sign-in just may not ask which account
  }
}
