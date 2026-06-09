/* eslint-disable react-hooks/rules-of-hooks */
/**
 * StreamVault E2E — Shared Test Fixtures
 *
 * Exports a custom `test` and `expect` with pre-built fixtures:
 *
 *  - `disclaimerPage`   : page with disclaimer auto-dismissed via sessionStorage
 *  - `authenticatedPage`: page that is also mock-authenticated (e2e_mock_authenticated=true)
 *  - `mockApiPage`      : page with disclaimer + auth + all TMDB/backend routes mocked
 *
 * Usage:
 *   import { test, expect } from '../fixtures'
 *   test('my test', async ({ mockApiPage }) => { ... })
 */

import { test as base, expect, type Page, type BrowserContext } from '@playwright/test'
import crypto from 'crypto'
import {
  buildDiscoverResponse,
  buildTrendingResponse,
  buildMovieDetailResponse,
  buildEmptySearchResponse,
  MOCK_MOVIES,
  MOCK_ADMIN_TOKEN,
  ADMIN_HMAC_SECRET,
  type MockFavorite,
} from './mocks'
import { enableAdBlock } from './adblock'

// ─── Helpers ───────────────────────────────────────────────────────────────

/**
 * Inject sessionStorage / localStorage values before any script runs.
 * Uses `addInitScript` which fires before page scripts.
 */
async function dismissDisclaimer(context: BrowserContext) {
  await context.addInitScript(() => {
    try {
      window.sessionStorage.setItem('disclaimerAccepted', 'true')
    } catch { /* noop */ }
  })
}

async function mockAuthenticate(context: BrowserContext, user = {
  sub: 'auth0|mock-user-regular-123',
  name: 'Alex Johnson',
  email: 'alex@example.com',
}) {
  await context.addInitScript((u) => {
    try {
      window.sessionStorage.setItem('disclaimerAccepted', 'true')
      window.localStorage.setItem('e2e_mock_authenticated', 'true')
      window.localStorage.setItem('e2e_mock_user', JSON.stringify(u))
    } catch { /* noop */ }
  }, user)
}

const getCodeForDate = (date: Date): string => {
  const day = date.getDate()
  const month = date.getMonth() + 1
  const year = date.getFullYear()
  const dateString = `${year}-${month}-${day}`
  return crypto.createHmac('sha256', ADMIN_HMAC_SECRET).update(dateString).digest('hex')
}

function validateAdminCode(code: string): boolean {
  if (!code || typeof code !== 'string') return false
  const cleanCode = code.replace(/[\s-]/g, '').toLowerCase()
  if (!cleanCode) return false

  const now = new Date()
  const codesToTry = [
    getCodeForDate(now),
    getCodeForDate(new Date(now.getTime() - 24 * 60 * 60 * 1000)), // yesterday
    getCodeForDate(new Date(now.getTime() + 24 * 60 * 60 * 1000)), // tomorrow
  ]

  return codesToTry.includes(cleanCode)
}

/**
 * Register all standard API mock routes on a page.
 * Keeps a live `mockFavorites` array so POST/DELETE mutations work.
 */
export async function registerApiMocks(page: Page, options: {
  initialFavorites?: MockFavorite[]
  isNewUser?: boolean
  adminToken?: string
} = {}) {
  const mockFavorites: MockFavorite[] = [...(options.initialFavorites ?? [])]
  const adminToken = options.adminToken ?? MOCK_ADMIN_TOKEN

  // — TMDB Fallback Mock (registered first so it is checked last) ─────────────
  await page.route('**/tmdb/**', async route => {
    if (route.request().resourceType() === 'document') return route.continue()
    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ results: [], total_pages: 0, total_results: 0 })
    })
  })

  // — TMDB Discovery / Trending ────────────────────────────────────────────
  await page.route('**/tmdb/discover/movie**', async route =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(buildDiscoverResponse()) })
  )
  await page.route('**/tmdb/discover/tv**', async route =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(buildDiscoverResponse([MOCK_MOVIES.breakingBad])) })
  )
  await page.route('**/tmdb/trending/**', async route =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(buildTrendingResponse()) })
  )

  // — TMDB Movie/TV Details ─────────────────────────────────────────────────
  await page.route(`**/tmdb/movie/${MOCK_MOVIES.inception.id}**`, async route =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(buildMovieDetailResponse(MOCK_MOVIES.inception)) })
  )
  await page.route(`**/tmdb/movie/${MOCK_MOVIES.darkKnight.id}**`, async route =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(buildMovieDetailResponse(MOCK_MOVIES.darkKnight)) })
  )
  await page.route(`**/tmdb/tv/${MOCK_MOVIES.breakingBad.id}**`, async route => {
    // Serve seasons endpoint specifically
    if (route.request().url().includes('/seasons')) {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify([
          { season_number: 1, episode_count: 7, name: 'Season 1' },
          { season_number: 2, episode_count: 13, name: 'Season 2' },
        ])
      })
    }
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(buildMovieDetailResponse(MOCK_MOVIES.breakingBad)) })
  })

  // — Search ─────────────────────────────────────────────────────────────────
  await page.route('**/tmdb/search/hybrid**', async route => {
    const url = new URL(route.request().url())
    const query = url.searchParams.get('q') ?? url.searchParams.get('query') ?? ''
    if (!query || query.length < 2) {
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(buildEmptySearchResponse()) })
    }
    const results = [MOCK_MOVIES.inception, MOCK_MOVIES.darkKnight].filter(m =>
      m.title.toLowerCase().includes(query.toLowerCase())
    )
    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ results, total_results: results.length, total_pages: 1, page: 1 })
    })
  })

  // — Favorites CRUD ─────────────────────────────────────────────────────────
  await page.route('**/favorites', async route => {
    if (route.request().resourceType() === 'document') return route.continue()
    if (route.request().method() === 'GET') {
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(mockFavorites) })
    }
    if (route.request().method() === 'POST') {
      const payload = JSON.parse(route.request().postData() || '{}')
      const item: MockFavorite = {
        id: `fav-${payload.tmdbId}`,
        tmdbId: payload.tmdbId,
        mediaType: payload.mediaType,
        addedAt: new Date().toISOString(),
      }
      mockFavorites.push(item)
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(item) })
    }
    return route.continue()
  })

  await page.route('**/favorites/**', async route => {
    if (route.request().method() === 'DELETE') {
      const id = route.request().url().split('/').pop()
      const idx = mockFavorites.findIndex(f => f.id === id)
      if (idx !== -1) mockFavorites.splice(idx, 1)
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ success: true }) })
    }
    return route.continue()
  })

  // — Dislikes CRUD ──────────────────────────────────────────────────────────
  await page.route('**/dislikes', async route => {
    if (route.request().resourceType() === 'document') return route.continue()
    if (route.request().method() === 'GET') {
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([]) })
    }
    return route.continue()
  })

  await page.route('**/dislikes/**', async route => {
    if (route.request().method() === 'DELETE') {
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ success: true }) })
    }
    return route.continue()
  })

  // — Recommendations / Onboarding ───────────────────────────────────────────
  await page.route('**/recommendations**', async route =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        userId: 'mock-user-123',
        items: [],
        sections: [],
        computedAt: new Date().toISOString(),
        isPersonalized: false
      })
    })
  )
  await page.route('**/recommendations/profile', async route =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ isNewUser: options.isNewUser ?? false })
    })
  )
  await page.route('**/recommendations/onboarding', async route =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ success: true }) })
  )

  // — Admin Login & Downloads ─────────────────────────────────────────────────
  await page.route('**/admin/login', async route => {
    if (route.request().method() === 'POST') {
      const payload = JSON.parse(route.request().postData() || '{}')
      if (validateAdminCode(payload.code)) {
        return route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ success: true, token: adminToken, expiresIn: '30m' })
        })
      } else {
        return route.fulfill({
          status: 401,
          contentType: 'application/json',
          body: JSON.stringify({ message: 'Invalid daily code' })
        })
      }
    }
    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ success: true, token: adminToken, expiresIn: '30m' })
    })
  })

  await page.route('**/downloads', async route => {
    if (route.request().resourceType() === 'document') return route.continue()
    const authHeader = route.request().headers()['authorization']
    if (authHeader?.includes(adminToken)) {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify([
          { id: 'dl-1', title: 'The Dark Knight', quality: '1080p BluRay', filename: 'dark_knight.mp4', size: '14.2 GB', addedAt: new Date().toISOString() },
          { id: 'dl-2', title: 'Inception', quality: '2160p 4K HDR', filename: 'inception_4k.mkv', size: '22.8 GB', addedAt: new Date().toISOString() },
          { id: 'dl-3', title: 'Breaking Bad S01', quality: '1080p', filename: 'breaking_bad_s01.mkv', size: '8.1 GB', addedAt: new Date().toISOString() },
        ])
      })
    }
    return route.fulfill({
      status: 403,
      contentType: 'application/json',
      body: JSON.stringify({ error: 'upgrade required. premium feature.' })
    })
  })

  // — Admin Dashboard ──────────────────────────────────────────────────────────
  await page.route('**/subscriptions/admin/requests', async route =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify([
        { id: 'req-1', user_id: 'user-123', email: 'premium-user@example.com', plan_id: 'premium', amount: 499, currency: 'INR', transaction_id: 'TXN_987654', status: 'pending', created_at: new Date().toISOString() },
        { id: 'req-2', user_id: 'user-456', email: 'basic-user@example.com', plan_id: 'basic', amount: 199, currency: 'INR', transaction_id: 'TXN_123456', status: 'pending', created_at: new Date(Date.now() - 86400000).toISOString() },
      ])
    })
  )
  await page.route('**/subscriptions/admin/approve', async route =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ success: true }) })
  )
  await page.route('**/subscriptions/admin/reject', async route =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ success: true }) })
  )

  // — Pricing / Subscriptions ──────────────────────────────────────────────────
  await page.route('**/subscriptions/plans', async route =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify([
        { id: 'basic', name: 'Basic', price: 199, currency: 'INR', features: ['HD Streaming', '1 Screen', 'Limited Downloads'] },
        { id: 'premium', name: 'Premium', price: 499, currency: 'INR', features: ['4K Streaming', '4 Screens', 'Unlimited Downloads', 'Offline Mode'] },
        { id: 'family', name: 'Family', price: 699, currency: 'INR', features: ['4K Streaming', '6 Screens', 'Family Controls', 'All Premium Features'] },
      ])
    })
  )

  // — User Subscriptions ──────────────────────────────────────────────────────
  await page.route('**/subscriptions/user**', async route =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ plan: null, status: 'free' }) })
  )

  // — Continue Watching ────────────────────────────────────────────────────────
  await page.route('**/continue-watching', async route => {
    if (route.request().resourceType() === 'document') return route.continue()
    if (route.request().method() === 'GET') {
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([]) })
    }
    // POST (update progress) — just accept it
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true }) })
  })

  await page.route('**/continue-watching/**', async route => {
    if (route.request().method() === 'DELETE') {
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true }) })
    }
    if (route.request().method() === 'GET') {
      return route.fulfill({ status: 404, contentType: 'application/json', body: JSON.stringify({ error: 'not found' }) })
    }
    return route.continue()
  })

  // — Aggregated Continue-Watching Details ────────────────────────────────────
  await page.route('**/tmdb/continue-watching-details', async route =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([]) })
  )

  // — TMDB Movie Search (used by Downloads page to fetch posters) ─────────────
  await page.route('**/tmdb/search/movie**', async route =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ results: [], total_results: 0, total_pages: 0 }) })
  )

  // — Backend Ping ────────────────────────────────────────────────────────────
  await page.route('**/ping', async route =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true }) })
  )

  return { mockFavorites }
}

// ─── Fixture Types ─────────────────────────────────────────────────────────

type Fixtures = {
  /** Page with disclaimer auto-dismissed. No auth, no API mocks. */
  disclaimerPage: Page
  /** Page that is disclaimer-dismissed AND mock-authenticated. No API mocks. */
  authenticatedPage: Page
  /** Fully wired page: disclaimer + auth + all API mocks intercepted. */
  mockApiPage: Page
  /** Fully wired page as an unauthenticated user (disclaimer + API mocks, NO auth). */
  unauthMockPage: Page
  /** Page configured as a new user going through onboarding. */
  onboardingPage: Page
}

// ─── Custom Test Fixture ───────────────────────────────────────────────────

export const test = base.extend<Fixtures>({
  disclaimerPage: async ({ context, page }, use) => {
    await enableAdBlock(context) // no-op unless E2E_ADBLOCK=1
    await dismissDisclaimer(context)
    await use(page)
  },

  authenticatedPage: async ({ context, page }, use) => {
    await enableAdBlock(context)
    await mockAuthenticate(context)
    await use(page)
  },

  mockApiPage: async ({ context, page }, use) => {
    await enableAdBlock(context)
    await mockAuthenticate(context)
    await registerApiMocks(page)
    await use(page)
  },

  unauthMockPage: async ({ context, page }, use) => {
    await enableAdBlock(context)
    await dismissDisclaimer(context)
    await registerApiMocks(page)
    await use(page)
  },

  onboardingPage: async ({ context, page }, use) => {
    await enableAdBlock(context)
    await context.addInitScript(() => {
      try {
        window.sessionStorage.setItem('disclaimerAccepted', 'true')
        window.localStorage.setItem('e2e_mock_authenticated', 'true')
        window.localStorage.setItem('e2e_mock_user', JSON.stringify({
          sub: 'auth0|mock-user-regular-123',
          name: 'Alex Johnson',
          email: 'alex@example.com',
        }))
        // Ensure onboarding key is cleared so portal fires
        window.localStorage.removeItem('cinematch_onboarded_auth0|mock-user-regular-123')
      } catch { /* noop */ }
    })
    await registerApiMocks(page, { isNewUser: true })
    await use(page)
  },
})

export { expect }