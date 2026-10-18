/**
 * MockApi — an in-memory stand-in for the StreamVault backend.
 *
 * The e2e build points VITE_API_URL at MOCK_API_ORIGIN, a host that only
 * exists inside the browser context: every request to it is answered here,
 * so runs are hermetic and deterministic. Each test gets its own instance
 * with sensible defaults; override any endpoint for one test with `on()`:
 *
 *   mockApi.on('GET', '/debrid/media-search', { status: 502, json: { error: 'Search failed' } })
 *   mockApi.on('POST', '/debrid/play', (req) => ({ json: readyPlayback() }))
 *
 * Later registrations win. Every request is recorded (`calls()`) so tests can
 * assert on what the app sent, not just on what it showed.
 *
 * A request no handler matches is answered 501 and recorded in `unhandled`;
 * the `test` fixture fails the test on teardown when there are any, so the
 * mock can't silently drift from the endpoints the app actually calls.
 */

import type { BrowserContext, Request, Route } from '@playwright/test'
import {
  CATALOGUE,
  MOVIE,
  SHOW,
  SHOW_SEASONS,
  mediaById,
  page,
  readyPlayback,
  release,
  titleOf,
} from './data'

export const MOCK_API_ORIGIN = 'http://api.e2e.test'

export type Method = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE'

export interface MockRequest {
  method: Method
  path: string
  params: Record<string, string>
  query: URLSearchParams
  headers: Record<string, string>
  body: unknown
  /** True when the request carried `Authorization: Bearer …`. */
  authenticated: boolean
}

export interface MockResponse {
  status?: number
  json?: unknown
  headers?: Record<string, string>
  /** Hold the response back — for asserting loading states. */
  delayMs?: number
}

export type Handler = (req: MockRequest) => MockResponse | Promise<MockResponse>

interface RouteEntry {
  method: Method
  pattern: RegExp
  keys: string[]
  handler: Handler
}

export interface RecordedCall {
  method: Method
  path: string
  query: URLSearchParams
  body: unknown
  authenticated: boolean
}

/**
 * '/tmdb/:type(movie|tv)/:id(\\d+)' → a RegExp. A param matches one path
 * segment, or only what its `(…)` constraint allows.
 */
function compile(path: string): { pattern: RegExp; keys: string[] } {
  const keys: string[] = []
  const source = path
    .split('/')
    .map((segment) => {
      const param = /^:(\w+)(?:\((.+)\))?$/.exec(segment)
      if (param) {
        keys.push(param[1])
        return `((?:${param[2] ?? '[^/]+'}))`
      }
      return segment.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    })
    .join('/')
  return { pattern: new RegExp(`^${source}$`), keys }
}

function parseBody(request: Request): unknown {
  const raw = request.postData()
  if (!raw) return undefined
  try {
    return JSON.parse(raw)
  } catch {
    return raw
  }
}

export class MockApi {
  private readonly routes: RouteEntry[] = []
  readonly requests: RecordedCall[] = []
  readonly unhandled: string[] = []

  /** Server-side state the default handlers read and write. */
  readonly state = {
    favorites: [] as { id: string; tmdbId: number; mediaType: string; addedAt: string }[],
    dislikes: [] as { id: string; tmdbId: number; mediaType: string }[],
    continueWatching: [] as Record<string, unknown>[],
    /** End of the free Premium promotion; null when there is none. */
    promoFreeUntil: '2027-04-11T00:00:00.000Z' as string | null,
  }

  constructor() {
    this.registerDefaults()
  }

  on(method: Method, path: string, handler: Handler | MockResponse): this {
    const { pattern, keys } = compile(path)
    const fn: Handler = typeof handler === 'function' ? handler : () => handler
    // Newest first, so a test's override beats the defaults.
    this.routes.unshift({ method, pattern, keys, handler: fn })
    return this
  }

  calls(method: Method, path: string): RecordedCall[] {
    const { pattern } = compile(path)
    return this.requests.filter((c) => c.method === method && pattern.test(c.path))
  }

  async attach(context: BrowserContext): Promise<void> {
    await context.route(`${MOCK_API_ORIGIN}/**`, (route) => this.handle(route))
  }

  private async handle(route: Route): Promise<void> {
    const request = route.request()
    const url = new URL(request.url())
    const method = request.method() as Method
    const headers = request.headers()

    // CORS preflight: the app is on another origin, and sends JSON + Authorization.
    if (method === ('OPTIONS' as Method)) {
      return route.fulfill({ status: 204, headers: corsHeaders(headers) })
    }

    const authenticated = (headers['authorization'] ?? '').startsWith('Bearer ')
    const body = parseBody(request)
    this.requests.push({ method, path: url.pathname, query: url.searchParams, body, authenticated })

    for (const entry of this.routes) {
      if (entry.method !== method) continue
      const match = entry.pattern.exec(url.pathname)
      if (!match) continue
      const params = Object.fromEntries(entry.keys.map((k, i) => [k, decodeURIComponent(match[i + 1])]))
      const res = await entry.handler({
        method,
        path: url.pathname,
        params,
        query: url.searchParams,
        headers,
        body,
        authenticated,
      })
      if (res.delayMs) await new Promise((r) => setTimeout(r, res.delayMs))
      return route
        .fulfill({
          status: res.status ?? 200,
          contentType: 'application/json',
          headers: { ...corsHeaders(headers), ...res.headers },
          body: res.json === undefined ? '' : JSON.stringify(res.json),
        })
        .catch(() => {
          // The page navigated away while the response was delayed.
        })
    }

    this.unhandled.push(`${method} ${url.pathname}`)
    return route.fulfill({
      status: 501,
      contentType: 'application/json',
      headers: corsHeaders(headers),
      body: JSON.stringify({ error: `No e2e mock for ${method} ${url.pathname} — add one in e2e/fixtures/mock-api.ts` }),
    })
  }

  // -------------------------------------------------------------------------
  // Defaults: a healthy backend with a small catalogue, a guest-friendly
  // Premium server and one instantly playable release per title.
  // -------------------------------------------------------------------------

  private registerDefaults(): void {
    const ok = (json: unknown): MockResponse => ({ json })

    this.on('GET', '/ping', ok({ ok: true }))

    // — TMDB proxy —
    this.on('GET', '/tmdb/trending/:mode', ({ params }) =>
      ok(page(CATALOGUE.filter((m) => params.mode === 'all' || m.media_type === params.mode)))
    )
    this.on('GET', '/tmdb/discover/:mode', ({ params }) => ok(page(CATALOGUE.filter((m) => m.media_type === params.mode))))
    this.on('GET', '/tmdb/:type(movie|tv)/:id(\\d+)', ({ params }) => ok(mediaById(params.type as 'movie' | 'tv', Number(params.id))))
    this.on('GET', '/tmdb/:type(movie|tv)/:id(\\d+)/similar', () => ok(page([])))
    this.on('GET', '/tmdb/tv/:id(\\d+)/seasons', () => ok(SHOW_SEASONS))
    this.on('GET', '/tmdb/search/movie', () => ok(page([])))
    this.on('GET', '/tmdb/search/hybrid', ({ query }) => {
      const q = (query.get('q') ?? query.get('query') ?? '').toLowerCase()
      const results = q.length < 2 ? [] : CATALOGUE.filter((m) => titleOf(m).toLowerCase().includes(q))
      return ok({ ...page(results), has_more: false })
    })
    // Batch base details — Continue Watching and the Author's Choice row.
    this.on('POST', '/tmdb/continue-watching-details', ({ body }) => {
      const items = Array.isArray(body) ? (body as { tmdbId: number; mediaType: 'movie' | 'tv' }[]) : []
      return ok(items.map((item) => ({ media: mediaById(item.mediaType, Number(item.tmdbId)), item })))
    })

    // — Recommendations —
    const noRecommendations = ok({ items: [], sections: [], computedAt: new Date(0).toISOString(), isPersonalized: false })
    this.on('GET', '/recommendations', noRecommendations)
    this.on('GET', '/recommendations/guest', noRecommendations)
    this.on('GET', '/recommendations/profile', ok({ isNewUser: false }))
    this.on('POST', '/recommendations/onboarding', ok({ success: true }))
    this.on('POST', '/recommendations/interaction', ok({ success: true }))
    this.on('POST', '/recommendations/guest/interaction', ok({ success: true }))

    // — Favorites / dislikes (signed-in only, like the real backend) —
    const requireAuth = (handler: Handler): Handler => (req) =>
      req.authenticated ? handler(req) : { status: 401, json: { error: 'Unauthorized' } }

    this.on('GET', '/favorites', requireAuth(() => ok(this.state.favorites)))
    this.on(
      'POST',
      '/favorites',
      requireAuth(({ body }) => {
        const { tmdbId, mediaType } = body as { tmdbId: number; mediaType: string }
        const item = { id: `fav-${tmdbId}`, tmdbId, mediaType, addedAt: new Date().toISOString() }
        this.state.favorites.push(item)
        return ok(item)
      })
    )
    this.on(
      'DELETE',
      '/favorites/:id',
      requireAuth(({ params }) => {
        this.state.favorites = this.state.favorites.filter((f) => f.id !== params.id)
        return ok({ success: true })
      })
    )
    this.on('GET', '/dislikes', requireAuth(() => ok(this.state.dislikes)))
    this.on(
      'POST',
      '/dislikes',
      requireAuth(({ body }) => {
        const { tmdbId, mediaType } = body as { tmdbId: number; mediaType: string }
        const item = { id: `dislike-${tmdbId}`, tmdbId, mediaType }
        this.state.dislikes.push(item)
        return ok(item)
      })
    )
    this.on(
      'DELETE',
      '/dislikes/:mediaType/:tmdbId',
      requireAuth(({ params }) => {
        this.state.dislikes = this.state.dislikes.filter(
          (d) => !(d.mediaType === params.mediaType && d.tmdbId === Number(params.tmdbId))
        )
        return ok({ success: true })
      })
    )

    // — Continue watching —
    this.on('GET', '/continue-watching', requireAuth(() => ok(this.state.continueWatching)))
    this.on('POST', '/continue-watching', requireAuth(() => ok({ ok: true })))
    this.on('GET', '/continue-watching/:tmdbId/:mediaType', requireAuth(() => ({ status: 404, json: { error: 'Not found' } })))
    this.on('DELETE', '/continue-watching/:tmdbId/:mediaType', requireAuth(() => ok({ ok: true })))

    // — Subscriptions —
    this.on(
      'GET',
      '/subscriptions/plans',
      ok([
        { id: 'basic', name: 'Basic', price: 199, currency: 'INR', features: ['HD streaming'] },
        { id: 'premium', name: 'Premium', price: 499, currency: 'INR', features: ['4K streaming', 'Downloads'] },
      ])
    )
    this.on('GET', '/downloads', ({ authenticated }) =>
      authenticated ? { status: 403, json: { error: 'Upgrade required' } } : { status: 401, json: { error: 'Unauthorized' } }
    )

    // — Premium (Real-Debrid) —
    this.on('GET', '/debrid/promo', () => ok({ freeUntil: this.state.promoFreeUntil }))
    this.on('GET', '/debrid/status', ok({ connected: true, premium: true, expiration: null, note: null }))
    this.on('GET', '/debrid/media-search', ({ query }) => {
      const isShow = query.get('type') === 'tv'
      const title = isShow ? titleOf(SHOW).replace(/ /g, '.') : titleOf(MOVIE)
      return ok({
        data: [
          release({
            name: isShow ? `${title}.S01E01.1080p.WEB-DL.x264.AAC` : `${title}.2010.1080p.BluRay.x264.AAC-GROUP`,
          }),
        ],
      })
    })
    this.on('POST', '/debrid/play', ok(readyPlayback()))
    this.on('GET', '/debrid/play/:torrentId', ok(readyPlayback()))
  }
}

function corsHeaders(requestHeaders: Record<string, string>): Record<string, string> {
  return {
    'Access-Control-Allow-Origin': requestHeaders['origin'] ?? '*',
    'Access-Control-Allow-Credentials': 'true',
    'Access-Control-Allow-Methods': 'GET, POST, PUT, PATCH, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': requestHeaders['access-control-request-headers'] ?? 'Content-Type, Authorization',
  }
}
