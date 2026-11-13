/**
 * The `test`s e2e specs import (e2e/tests/*.e2e.ts). Each one gives a test:
 *
 *   - mockApi — its own MockApi (fresh state), the same fake backend the
 *     Playwright suite uses, served through `browser.route`
 *   - a hermetic network: TMDB images and embed pages are stand-ins, every
 *     other outside request is aborted
 *
 * and fails, on teardown, when the app called an endpoint the mock backend
 * doesn't know.
 *
 * Every fixture in an e2e chain sets up for every test on it, so each setup
 * gets its own `test`:
 *
 *   test            a returning guest — disclaimer and promo card dismissed
 *   firstVisitTest  a brand-new visitor who still sees them
 *   signedInTest    a returning visitor signed in as SIGNED_IN
 */

import { test as base } from '@e2e-dev/web'
import { MOCK_API_ORIGIN, MockApi } from '../fixtures/mock-api'
import { EMBED_STUB_TEXT } from '../fixtures/network'
import { SIGNED_IN, type TestUser } from '../fixtures/users'

export { SIGNED_IN, type TestUser }

const POSTER_SVG =
  '<svg xmlns="http://www.w3.org/2000/svg" width="500" height="750" viewBox="0 0 500 750"><rect width="500" height="750" fill="#1e293b"/><circle cx="250" cy="300" r="120" fill="#f59e0b" opacity=".55"/></svg>'

const EMBED_STUB_HTML = `<!doctype html><html><body style="margin:0;display:grid;place-items:center;height:100vh;background:#111;color:#eee;font:16px sans-serif">${EMBED_STUB_TEXT}</body></html>`

/** A hermetic network and a fresh mock backend. */
export const firstVisitTest = base.extend<{ mockApi: MockApi }>({
  mockApi: async ({ browser, app }, use) => {
    const appOrigin = new URL(app.baseUrl).origin

    // Routes run newest first: this catch-all goes in before the mock API.
    await browser.route('**/*', async (route) => {
      const url = new URL(route.request.url)
      if (url.origin === appOrigin) return route.continue()
      if (url.hostname === 'image.tmdb.org') {
        return route.fulfill({ status: 200, contentType: 'image/svg+xml', body: POSTER_SVG })
      }
      // A document request from another origin is a streaming embed's iframe.
      if ((route.request.headers['accept'] ?? '').startsWith('text/html')) {
        return route.fulfill({ status: 200, contentType: 'text/html', body: EMBED_STUB_HTML })
      }
      return route.abort()
    })

    const api = new MockApi()
    await browser.route(`${MOCK_API_ORIGIN}/**`, (route) => api.serve(route))
    await use(api)

    if (api.unhandled.length > 0) {
      throw new Error(`The app called endpoints the mock backend doesn't handle:\n  ${[...new Set(api.unhandled)].join('\n  ')}`)
    }
  },
})

/** A returning guest: the disclaimer and the promo announcement are already dismissed. */
export const test = firstVisitTest.extend<{ returning: true }>({
  returning: async ({ browser }, use) => {
    await browser.addInitScript(() => {
      sessionStorage.setItem('disclaimerAccepted', 'true')
      localStorage.setItem('sv:announce:debrid-free-2026-10-everyone', 'true')
    })
    await use(true)
  },
})

/** A returning visitor signed in through the app's mock Auth0 provider (VITE_MOCK_AUTH). */
export const signedInTest = test.extend<{ user: TestUser }>({
  user: async ({ browser }, use) => {
    // Init scripts take a JSON argument; pass the user as a string.
    await browser.addInitScript((userJson: string) => {
      const { sub } = JSON.parse(userJson) as { sub: string }
      localStorage.setItem('e2e_mock_authenticated', 'true')
      localStorage.setItem('e2e_mock_user', userJson)
      localStorage.setItem(`cinematch_onboarded_${sub}`, 'true')
    }, JSON.stringify(SIGNED_IN))
    await use(SIGNED_IN)
  },
})
