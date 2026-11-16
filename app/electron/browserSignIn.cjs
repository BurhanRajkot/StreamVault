/**
 * Signing in through the system browser (see main.cjs, 'sv:sign-in').
 *
 * Opens the site's /app-signin page in the viewer's browser with the Auth0
 * authorize URL and a loopback port opened for this one sign-in; the site goes
 * on to Auth0 and, when Auth0 returns, sends the browser to
 * http://127.0.0.1:<port>/callback?code=…&state=… (src/lib/appSignIn.ts on
 * the website). start() answers the site URL Auth0 returned to, for the
 * window to finish with handleRedirectCallback, or null if it was cancelled,
 * superseded by another sign-in, or timed out.
 */

const http = require('node:http')

const TIMEOUT_MS = 10 * 60e3

function isAuthorizeUrl(value) {
  try {
    const url = new URL(value)
    return url.protocol === 'https:' && /\.auth0\.com$/.test(url.hostname) && url.pathname === '/authorize'
  } catch {
    return false
  }
}

const page = (ok) => `<!doctype html><meta charset="utf-8"><title>StreamVault</title>
<meta name="viewport" content="width=device-width,initial-scale=1">
<style>body{margin:0;min-height:100vh;display:grid;place-items:center;background:#08080b;color:#f4f4f5;font:16px/1.5 system-ui,sans-serif;text-align:center}main{padding:24px}h1{font-size:22px;margin:0 0 8px}p{margin:0;color:#a1a1aa}</style>
<main><h1>${ok ? 'You’re signed in' : 'Sign-in didn’t finish'}</h1><p>${ok ? 'Go back to StreamVault — you can close this tab.' : 'Go back to StreamVault and try again.'}</p></main>`

/**
 * @param {{ siteOrigin: string, openExternal: (url: string) => Promise<unknown>, onReturn?: () => void, timeoutMs?: number }} options
 */
function createBrowserSignIn({ siteOrigin, openExternal, onReturn = () => {}, timeoutMs = TIMEOUT_MS }) {
  let pending = null

  function start(authorizeUrl) {
    if (!isAuthorizeUrl(authorizeUrl)) return Promise.reject(new Error('Not an Auth0 sign-in address.'))
    pending?.finish(null)
    return new Promise((resolve) => {
      let done = false
      const server = http.createServer((req, res) => {
        const url = new URL(req.url || '/', 'http://127.0.0.1')
        if (req.method !== 'GET' || url.pathname !== '/callback' || !url.searchParams.get('state') || done) {
          res.writeHead(404).end()
          return
        }
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' })
        res.end(page(url.searchParams.has('code')))
        finish(`${siteOrigin}/${url.search}`)
        onReturn()
      })
      const timer = setTimeout(() => finish(null), timeoutMs)
      const entry = { finish, server }
      function finish(result) {
        if (done) return
        done = true
        clearTimeout(timer)
        server.close()
        server.closeIdleConnections?.()
        if (pending === entry) pending = null
        resolve(result)
      }
      pending = entry
      server.on('error', () => finish(null))
      server.listen(0, '127.0.0.1', () => {
        const { port } = server.address()
        Promise.resolve(openExternal(`${siteOrigin}/app-signin#port=${port}&url=${encodeURIComponent(authorizeUrl)}`)).catch(() => finish(null))
      })
    })
  }

  return {
    start,
    cancel: () => pending?.finish(null),
    /** The loopback port a sign-in is waiting on (tests). */
    port: () => pending?.server.address()?.port ?? null,
  }
}

module.exports = { createBrowserSignIn, isAuthorizeUrl }
