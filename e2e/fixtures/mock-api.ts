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
  isAnime,
  mediaById,
  page,
  readyPlayback,
  release,
  seasonEpisodes,
  titleOf,
} from './data'
import { ADMIN_CODE, ADMIN_TOKEN, SIGNED_IN } from './users'

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
  /** True when that bearer token is the admin's (see ADMIN_TOKEN). */
  admin: boolean
}

export interface MockResponse {
  status?: number
  json?: unknown
  /** A plain-text body instead of JSON (a subtitle file). */
  text?: string
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

/** The slice of an e2e framework `WebRoute` that `MockApi.serve` uses. */
export interface PlainRoute {
  readonly request: {
    readonly url: string
    readonly method: string
    readonly headers: Readonly<Record<string, string>>
    readonly postData?: string
  }
  fulfill(response: { status: number; contentType?: string; headers?: Record<string, string>; body: string }): Promise<void>
}

export interface RecordedCall {
  method: Method
  path: string
  query: URLSearchParams
  body: unknown
  authenticated: boolean
  /** True when the bearer token was the admin's. */
  admin: boolean
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
    /**
     * Accounts in the admin's Users panel. Any non-admin bearer token is
     * SIGNED_IN (the mock Auth0 has one user); a second account fills the list.
     */
    users: [
      mockUser(SIGNED_IN.sub, SIGNED_IN.email, SIGNED_IN.name),
      mockUser('google-oauth2|e2e-other', 'sam@streamvault.test', 'Sam Other'),
    ],
    premiumPausedForAll: false,
    /** The dashboard's Subscription Requests (none by default). */
    subscriptionRequests: [] as MockSubscriptionRequest[],
    /** Premium access requests sent from the app (none by default). */
    accessRequests: [] as MockAccessRequest[],
    /**
     * Treat every call as the app's (as if it carried `X-StreamVault-Client:
     * app/…`). An approved account's Premium plays in the app only; the app
     * runs the website's player, so tests of that player as an approved
     * account set this.
     */
    asApp: false,
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

  /**
   * Answer one request intercepted by the e2e framework's `browser.route`
   * (e2e/tests/fixtures.ts), whose route exposes the request as plain fields.
   */
  serve(route: PlainRoute): Promise<void> {
    const { url, method, headers, postData } = route.request
    const request = {
      url: () => url,
      method: () => method,
      headers: () => ({ ...headers }),
      postData: () => postData ?? null,
    }
    return this.handle({
      request: () => request,
      fulfill: (res: { status: number; contentType?: string; headers?: Record<string, string>; body: string }) =>
        route.fulfill(res),
    } as unknown as Route)
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

    const authorization = headers['authorization'] ?? ''
    const authenticated = authorization.startsWith('Bearer ')
    const admin = authorization === `Bearer ${ADMIN_TOKEN}`
    const body = parseBody(request)
    this.requests.push({ method, path: url.pathname, query: url.searchParams, body, authenticated, admin })

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
        admin,
      })
      if (res.delayMs) await new Promise((r) => setTimeout(r, res.delayMs))
      return route
        .fulfill({
          status: res.status ?? 200,
          contentType: res.text !== undefined ? 'text/plain; charset=utf-8' : 'application/json',
          headers: { ...corsHeaders(headers), ...res.headers },
          body: res.text ?? (res.json === undefined ? '' : JSON.stringify(res.json)),
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
  // Defaults: a healthy backend with a small catalogue, an admin-only
  // Premium server and one instantly playable release per title.
  // -------------------------------------------------------------------------

  private registerDefaults(): void {
    const ok = (json: unknown): MockResponse => ({ json })

    this.on('GET', '/ping', ok({ ok: true }))

    // — TMDB proxy —
    this.on('GET', '/tmdb/trending/:mode', ({ params }) =>
      ok(page(CATALOGUE.filter((m) => params.mode === 'all' || m.media_type === params.mode)))
    )
    // Narrowed like TMDB's: every listed genre (comma = AND) and the original language.
    this.on('GET', '/tmdb/discover/:mode', ({ params, query }) => {
      const genres = (query.get('with_genres') ?? '').split(',').filter(Boolean).map(Number)
      const language = query.get('with_original_language')
      return ok(
        page(
          CATALOGUE.filter(
            (m) =>
              m.media_type === params.mode &&
              genres.every((g) => m.genre_ids.includes(g)) &&
              (!language || m.original_language === language)
          )
        )
      )
    })
    this.on('GET', '/tmdb/:type(movie|tv)/:id(\\d+)', ({ params }) => ok(mediaById(params.type as 'movie' | 'tv', Number(params.id))))
    this.on('GET', '/tmdb/:type(movie|tv)/:id(\\d+)/similar', () => ok(page([])))
    this.on('GET', '/tmdb/tv/:id(\\d+)/seasons', () => ok(SHOW_SEASONS))
    this.on('GET', '/tmdb/tv/:id(\\d+)/season/:season(\\d+)', ({ params }) => ok(seasonEpisodes(Number(params.season))))
    this.on('GET', '/tmdb/search/movie', () => ok(page([])))
    this.on('GET', '/tmdb/search/hybrid', ({ query }) => {
      const q = (query.get('q') ?? query.get('query') ?? '').toLowerCase()
      const anime = query.get('anime') === 'true'
      const results =
        q.length < 2 ? [] : CATALOGUE.filter((m) => titleOf(m).toLowerCase().includes(q) && (!anime || isAnime(m)))
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

    // — Admin —
    this.on('POST', '/admin/login', ({ body }) =>
      (body as { code?: string } | undefined)?.code === ADMIN_CODE
        ? ok({ success: true, token: ADMIN_TOKEN, expiresIn: '30d' })
        : { status: 401, json: { error: 'Authentication failed', message: 'Invalid authenticator code' } }
    )
    this.on('GET', '/subscriptions/admin/requests', ({ admin }) =>
      admin
        ? ok(
            this.state.subscriptionRequests.map((request) => {
              const buyer = this.state.users.find((u) => u.id === request.user_id)
              return { ...request, debrid_downloads: request.user_id && buyer ? buyer.debridDownloads : null }
            })
          )
        : { status: 401, json: { error: 'Authentication required' } }
    )

    // — Releases: the public search behind the Download sheet's magnet links —
    const releasesFor = (query: URLSearchParams): MockResponse => {
      const isShow = query.get('type') === 'tv'
      const title = isShow ? titleOf(SHOW).replace(/ /g, '.') : titleOf(MOVIE)
      return ok({
        data: [
          release({
            name: isShow ? `${title}.S01E01.1080p.WEB-DL.x264.AAC` : `${title}.2010.1080p.BluRay.x264.AAC-GROUP`,
          }),
        ],
      })
    }
    this.on('GET', '/releases', ({ query }) => releasesFor(query))

    // — Account access, decided like backend/src/lib/userAccess.ts decidePremium —
    const me = () => this.state.users.find((u) => u.id === SIGNED_IN.sub)
    const premiumFor = (req: MockRequest): string => {
      if (req.admin) return 'granted'
      const user = req.authenticated ? me() : undefined
      if (!user) return 'sign-in-required'
      if (user.suspendedAt) return 'suspended'
      if (user.premiumAccess === 'none') return 'not-approved'
      if (user.premiumAccess === 'paused') return 'paused'
      if (this.state.premiumPausedForAll) return 'paused-for-all'
      const fromApp = this.state.asApp || /^app(\/|$)/.test(req.headers['x-streamvault-client'] ?? '')
      return fromApp ? 'granted' : 'app-only'
    }
    this.on('GET', '/me/access', (req) => {
      if (!req.authenticated || req.admin) return { status: 401, json: { error: 'Unauthorized' } }
      const reason = premiumFor(req)
      return ok({
        premium: reason === 'granted',
        premiumReason: reason,
        suspended: Boolean(me()?.suspendedAt),
        debridDownloads: me()?.debridDownloads !== false,
      })
    })
    this.on('POST', '/me/profile', requireAuth(() => ({ status: 204 })))

    // — Admin: users and the site-wide Premium switch —
    const adminOnly =
      (handler: Handler): Handler =>
      (req) =>
        req.admin ? handler(req) : { status: 401, json: { error: 'Authentication required', message: 'Admin token missing' } }
    this.on(
      'GET',
      '/admin/users',
      adminOnly(({ query }) => {
        const q = (query.get('q') ?? '').toLowerCase()
        const users = this.state.users.filter((u) => !q || [u.id, u.email, u.name].some((v) => v?.toLowerCase().includes(q)))
        return ok({ users, total: users.length })
      })
    )
    this.on(
      'PATCH',
      '/admin/users/:id',
      adminOnly(({ params, body }) => {
        const user = this.state.users.find((u) => u.id === params.id)
        if (!user) return { status: 404, json: { error: 'User not found' } }
        const change = (body ?? {}) as { premiumAccess?: MockUser['premiumAccess']; suspended?: boolean; debridDownloads?: boolean }
        if (change.premiumAccess) user.premiumAccess = change.premiumAccess
        if (change.suspended !== undefined) user.suspendedAt = change.suspended ? new Date().toISOString() : null
        if (change.debridDownloads !== undefined) user.debridDownloads = change.debridDownloads
        return ok({ user })
      })
    )
    this.on('GET', '/admin/settings', adminOnly(() => ok({ premiumPausedForAll: this.state.premiumPausedForAll })))

    // — Admin: Premium access requests (backend/src/routes/accessRequests.ts) —
    this.on(
      'GET',
      '/admin/access-requests',
      adminOnly(() =>
        ok({
          repo: 'dragon-manner/StreamVault',
          requests: [...this.state.accessRequests]
            .sort((a, b) => (a.status !== b.status ? (a.status === 'pending' ? -1 : 1) : b.createdAt.localeCompare(a.createdAt)))
            .map((r) => ({ ...r, premiumAccess: this.state.users.find((u) => u.id === r.userId)?.premiumAccess ?? 'none' })),
        })
      )
    )
    this.on(
      'POST',
      '/admin/access-requests/:userId/approve',
      adminOnly(({ params }) => {
        const request = this.state.accessRequests.find((r) => r.userId === params.userId)
        if (!request) return { status: 404, json: { error: 'Request not found' } }
        const user = this.state.users.find((u) => u.id === params.userId)
        if (user) user.premiumAccess = 'granted'
        request.status = 'approved'
        request.reviewedAt = new Date().toISOString()
        return ok({ request })
      })
    )
    this.on(
      'DELETE',
      '/admin/access-requests/:userId',
      adminOnly(({ params }) => {
        this.state.accessRequests = this.state.accessRequests.filter((r) => r.userId !== params.userId)
        return ok({ ok: true })
      })
    )
    this.on(
      'PUT',
      '/admin/settings/premium',
      adminOnly(({ body }) => {
        this.state.premiumPausedForAll = Boolean((body as { pausedForAll?: boolean } | undefined)?.pausedForAll)
        return ok({ premiumPausedForAll: this.state.premiumPausedForAll })
      })
    )

    // — Premium (Real-Debrid): the admin and approved accounts, like the real backend's gate
    //   (its account status stays admin-only) —
    const premiumOnly =
      (handler: Handler): Handler =>
      (req) => {
        const reason = premiumFor(req)
        if (reason === 'granted') return handler(req)
        return reason === 'sign-in-required'
          ? { status: 401, json: { error: 'Authentication required' } }
          : { status: 403, json: { error: 'Premium access required', code: `premium_${reason.replace(/-/g, '_')}` } }
      }
    this.on('GET', '/debrid/status', adminOnly(() => ok({ connected: true, premium: true, expiration: null, note: null })))
    this.on('GET', '/debrid/media-search', premiumOnly(({ query }) => releasesFor(query)))
    this.on('POST', '/debrid/play', premiumOnly(() => ok(readyPlayback())))
    this.on('GET', '/debrid/play/:torrentId', premiumOnly(() => ok(readyPlayback())))
    // No subtitles unless a test brings some (see subtitlesFor in data.ts)
    this.on('GET', '/debrid/subtitles', premiumOnly(() => ok({ languages: [] })))
    this.on('GET', '/debrid/subtitles/file/:id', premiumOnly(() => ({ status: 404, json: { error: 'Subtitle not found' } })))
  }
}

export interface MockAccessRequest {
  userId: string
  email: string | null
  name: string | null
  github: string | null
  starred: boolean | null
  reference: string | null
  note: string | null
  status: 'pending' | 'approved'
  createdAt: string
  reviewedAt: string | null
}

export interface MockUser {
  id: string
  email: string | null
  name: string | null
  createdAt: string
  lastSeenAt: string | null
  premiumAccess: 'none' | 'granted' | 'paused'
  suspendedAt: string | null
  subscriptionStatus: string
  /** May save Premium's file (the backend keeps this in AppSetting 'debrid-downloads'). */
  debridDownloads: boolean
}

/** A row of the subscription_requests table, as the dashboard lists it. */
export interface MockSubscriptionRequest {
  id: string
  user_id: string | null
  email: string
  plan_id: string
  amount: number
  currency: string
  transaction_id: string
  status: 'pending' | 'approved' | 'rejected'
  created_at: string
}

function mockUser(id: string, email: string, name: string): MockUser {
  const at = new Date(Date.UTC(2026, 10, 1)).toISOString()
  return {
    id,
    email,
    name,
    createdAt: at,
    lastSeenAt: at,
    premiumAccess: 'none',
    suspendedAt: null,
    subscriptionStatus: 'free',
    debridDownloads: true,
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
