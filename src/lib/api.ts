import { CONFIG, Media, MediaMode } from './config'
import { getProviderById, WATCH_REGION } from './ottProviders'
import { getDeviceContext } from './telemetry'

/* ======================================================
   API BASE
====================================================== */

const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:4000'

/* ======================================================
   INTERNAL HELPERS (TMDB discover)
====================================================== */

/** Resolve the watch_region for a provider, falling back to the default region. */
function regionForProvider(providerId?: string | null): string {
  if (!providerId) return WATCH_REGION
  return getProviderById(providerId)?.region || WATCH_REGION
}

/**
 * Build the provider filter query fragment
 * (`&with_watch_providers=...&watch_region=...&with_watch_monetization_types=...`).
 * Returns '' when no provider is given, so callers can append it unconditionally
 * without ever emitting a literal `with_watch_providers=undefined`.
 */
function providerFilterParams(
  providerId?: string | null,
  monetization: string = 'flatrate'
): string {
  if (!providerId) return ''
  const region = regionForProvider(providerId)
  return `&with_watch_providers=${providerId}&watch_region=${region}&with_watch_monetization_types=${monetization}`
}

/**
 * Fetch a movie discover URL and a tv discover URL in parallel.
 * A failed sub-request degrades to an empty result set instead of throwing,
 * so one broken half can't wipe out the whole combined feed.
 */
async function discoverMovieAndTv(
  movieUrl: string,
  tvUrl: string
): Promise<{ movieData: any; tvData: any }> {
  const [movieRes, tvRes] = await Promise.all([fetch(movieUrl), fetch(tvUrl)])
  const [movieData, tvData] = await Promise.all([
    movieRes.ok ? movieRes.json() : Promise.resolve({ results: [], total_pages: 0 }),
    tvRes.ok ? tvRes.json() : Promise.resolve({ results: [], total_pages: 0 }),
  ])
  return { movieData, tvData }
}

/* ======================================================
   TMDB FETCHING (via Backend Proxy)
====================================================== */

export async function fetchPopular(
  mode: MediaMode,
  page = 1,
  providerId?: string | null
): Promise<{ results: Media[]; total_pages: number }> {
  // Downloads has no TMDB data
  if (mode === 'downloads') {
    return { results: [], total_pages: 0 }
  }

  // HOME + DOCUMENTARY: blended movie/tv feed sorted by popularity.
  // Documentary is identical to home apart from the genre filter (99 = Documentary).
  if (mode === 'home' || mode === 'documentary') {
    const genre = mode === 'documentary' ? '&with_genres=99' : ''
    const provider = providerFilterParams(providerId, 'flatrate')

    const movieUrl = `${API_BASE}/tmdb/discover/movie?sort_by=popularity.desc&page=${page}${genre}${provider}`
    const tvUrl = `${API_BASE}/tmdb/discover/tv?sort_by=popularity.desc&page=${page}${genre}${provider}`

    try {
      const { movieData, tvData } = await discoverMovieAndTv(movieUrl, tvUrl)

      const movies = (movieData.results || []).map((m: any) => ({ ...m, media_type: 'movie' }))
      const tv = (tvData.results || []).map((t: any) => ({ ...t, media_type: 'tv' }))

      const combined = [...movies, ...tv].sort(
        (a, b) => (b.popularity || 0) - (a.popularity || 0)
      )

      return {
        results: combined,
        total_pages: Math.max(movieData.total_pages || 0, tvData.total_pages || 0),
      }
    } catch (e) {
      console.error(`fetchPopular (${mode}) failed`, e)
      return { results: [], total_pages: 0 }
    }
  }

  // MOVIE / TV
  let url = `${API_BASE}/tmdb/discover/${mode}?page=${page}`
  if (providerId) {
    // flatrate|buy|rent for the single-mode grid, plus an explicit popularity sort.
    url += providerFilterParams(providerId, 'flatrate%7Cbuy%7Crent') + '&sort_by=popularity.desc'
  }

  const res = await fetch(url)
  if (!res.ok) {
    console.error('fetchPopular failed:', res.status, res.statusText)
    return { results: [], total_pages: 0 }
  }
  const data = await res.json()

  return {
    results: data.results || [],
    total_pages: data.total_pages || 0,
  }
}

export async function fetchRecentlyAdded(
  mode: MediaMode,
  providerId?: string | null
): Promise<Media[]> {
  if (mode === 'downloads') return []

  // Date window: last 24 months to today (wide enough for smaller provider catalogs).
  const today = new Date()
  const monthsAgo = new Date(today)
  monthsAgo.setMonth(today.getMonth() - 24)

  const todayStr = today.toISOString().split('T')[0]
  const monthsAgoStr = monthsAgo.toISOString().split('T')[0]

  // HOME + DOCUMENTARY: blended movie/tv feed sorted by newest release.
  if (mode === 'home' || mode === 'documentary') {
    const isDoc = mode === 'documentary'
    const genre = isDoc ? '&with_genres=99' : ''
    const voteCount = isDoc ? 5 : 20 // documentaries have far fewer ratings
    const provider = providerFilterParams(providerId, 'flatrate')

    const movieUrl =
      `${API_BASE}/tmdb/discover/movie?sort_by=primary_release_date.desc&page=1${genre}` +
      `&primary_release_date.gte=${monthsAgoStr}&primary_release_date.lte=${todayStr}` +
      `&vote_count.gte=${voteCount}${provider}`

    const tvUrl =
      `${API_BASE}/tmdb/discover/tv?sort_by=first_air_date.desc&page=1${genre}` +
      `&first_air_date.gte=${monthsAgoStr}&first_air_date.lte=${todayStr}` +
      `&vote_count.gte=${voteCount}${provider}`

    try {
      const { movieData, tvData } = await discoverMovieAndTv(movieUrl, tvUrl)

      const movies = (movieData.results || []).map((m: any) => ({
        ...m,
        media_type: 'movie',
        date: new Date(m.release_date || m.primary_release_date || 0),
      }))
      const tv = (tvData.results || []).map((t: any) => ({
        ...t,
        media_type: 'tv',
        date: new Date(t.first_air_date || 0),
      }))

      return [...movies, ...tv].sort((a, b) => b.date.getTime() - a.date.getTime())
    } catch (e) {
      console.error(`fetchRecentlyAdded (${mode}) failed`, e)
      return []
    }
  }

  // MOVIE / TV
  const sortBy = mode === 'movie' ? 'primary_release_date.desc' : 'first_air_date.desc'

  let url = `${API_BASE}/tmdb/discover/${mode}?sort_by=${sortBy}&page=1&vote_count.gte=20`

  // Only attach the provider filter when one is actually selected.
  // (Previously this always appended `with_watch_providers=undefined` when no
  //  provider was passed, which silently broke the movie/tv recent feed.)
  url += providerFilterParams(providerId, 'flatrate')

  if (mode === 'movie') {
    url += `&primary_release_date.gte=${monthsAgoStr}&primary_release_date.lte=${todayStr}`
  } else {
    url += `&first_air_date.gte=${monthsAgoStr}&first_air_date.lte=${todayStr}`
  }

  const res = await fetch(url)
  if (!res.ok) {
    console.error('fetchRecentlyAdded failed:', res.status, res.statusText)
    return []
  }
  const data = await res.json()

  // Trust TMDB's discover API — it already filters by provider, so we skip the
  // extra per-item validation calls (≈75% fewer requests on this path).
  return data.results || []
}

export async function fetchTrending(mode: MediaMode): Promise<Media[]> {
  if (mode === 'downloads') return []

  // Documentaries and Home: reuse Popular as Trending.
  if (mode === 'documentary' || mode === 'home') {
    const data = await fetchPopular(mode, 1)
    return data.results.slice(0, 10) // Top 10 for carousel
  }

  const url = `${API_BASE}/tmdb/trending/${mode}`
  const res = await fetch(url)
  if (!res.ok) {
    console.error('fetchTrending failed:', res.status, res.statusText)
    return []
  }
  const data = await res.json()

  return data.results || []
}

export async function searchMedia(
  mode: MediaMode,
  query: string,
  page = 1,
  /** Optional AbortSignal — pass one from an AbortController to cancel stale requests */
  signal?: AbortSignal
): Promise<{ results: Media[]; total_pages: number }> {
  if (mode === 'downloads') {
    return { results: [], total_pages: 0 }
  }

  const params = new URLSearchParams()
  params.append('query', query)
  params.append('page', page.toString())

  // Enable fast in-memory Trie autocomplete for the first page
  if (page === 1) {
    params.append('autocomplete', 'true')
  }

  // Filter media type specifically if requested.
  // For 'home' and 'documentary', we omit this to search BOTH TV and Movies.
  if (mode === 'movie' || mode === 'tv') {
    params.append('mediaType', mode)
  }

  const url = `${API_BASE}/tmdb/search/hybrid?${params.toString()}`

  try {
    const res = await fetch(url, { signal })
    if (!res.ok) {
      console.error('searchMedia failed:', res.status, res.statusText)
      return { results: [], total_pages: 0 }
    }
    const data = await res.json()

    return {
      results: data.results || [],
      // The hybrid route returns total_results, we approximate pages or default to 1
      total_pages:
        data.total_pages ||
        Math.ceil((data.total_results || (data.results || []).length) / 20) ||
        1,
    }
  } catch (err: any) {
    // AbortError is expected when the caller cancels a stale request — not a real error
    if (err?.name === 'AbortError') return { results: [], total_pages: 0 }
    console.error('searchMedia fetch err:', err)
    return { results: [], total_pages: 0 }
  }
}

export async function fetchMediaDetails(mode: MediaMode, id: number): Promise<Media | null> {
  if (mode === 'downloads' || !id) return null

  const url = `${API_BASE}/tmdb/${mode}/${id}?append_to_response=credits,similar,images,release_dates,content_ratings&include_image_language=en,null`
  const res = await fetch(url)
  if (!res.ok) {
    // Sanitize before logging — mode and id are trusted internal values, but we
    // assert here to satisfy static analysis (CodeQL alert #1).
    const safeMode = ['movie', 'tv'].includes(mode) ? mode : 'unknown'
    const safeId = Number.isInteger(id) ? id : 0
    console.error(`fetchMediaDetails failed for ${safeMode}/${safeId}:`, res.status)
    return null
  }
  return res.json()
}

export async function fetchMediaBasicDetails(mode: MediaMode, id: number): Promise<Media | null> {
  if (mode === 'downloads' || !id) return null

  // Omitting appended relationships reduces the TMDB response from ~120KB to ~2KB each.
  const url = `${API_BASE}/tmdb/${mode}/${id}?include_image_language=en,null`
  const res = await fetch(url)
  if (!res.ok) {
    console.error(`fetchMediaBasicDetails failed for ${mode}/${id}:`, res.status)
    return null
  }
  return res.json()
}

export async function fetchMediaVideos(
  mode: MediaMode,
  id: number
): Promise<{ key: string; site: string; type: string }[]> {
  if (mode === 'downloads' || !id) return []

  const url = `${API_BASE}/tmdb/${mode}/${id}/videos`
  const res = await fetch(url)
  if (!res.ok) return []

  const data = await res.json()
  return data.results || []
}

export async function fetchTVSeasons(
  tvId: number
): Promise<{ season_number: number; episode_count: number; name: string }[]> {
  if (!tvId) return []

  const url = `${API_BASE}/tmdb/tv/${tvId}/seasons`
  const res = await fetch(url)
  if (!res.ok) {
    console.error('fetchTVSeasons failed:', res.status, res.statusText)
    return []
  }
  const data = await res.json()

  return data || []
}

/* ======================================================
   IMAGE HELPERS
====================================================== */

export function getImageUrl(
  path: string | null,
  size: 'poster' | 'backdrop' | 'thumbnail' | 'logo' | 'hero' = 'poster'
): string {
  if (!path) return '/placeholder.svg'
  return `${CONFIG.IMG_BASE_URL}${CONFIG.IMG_SIZES[size]}${path}`
}

/**
 * Builds a multi-width srcSet string for TMDB images.
 * Example output: "https://image.tmdb.org/t/p/w185/abc.jpg 185w, https://.../w342/abc.jpg 342w"
 * Pair with a `sizes` attribute on the image tag to let the browser pick the right resolution.
 * Returns undefined if path is falsy (use getImageUrl fallback instead).
 */
export function getImageSrcSet(
  path: string | null,
  size: keyof typeof CONFIG.IMG_SRCSET_SIZES = 'poster'
): string | undefined {
  if (!path) return undefined
  const breakpoints = CONFIG.IMG_SRCSET_SIZES[size]
  return breakpoints
    .map(({ tmdbSize, displayW }) => `${CONFIG.IMG_BASE_URL}${tmdbSize}${path} ${displayW}w`)
    .join(', ')
}

/* ======================================================
   CONTINUE WATCHING
====================================================== */

export type ContinueWatchingItem = {
  tmdbId: number
  mediaType: 'movie' | 'tv'
  season?: number
  episode?: number
  progress: number
  server?: string
}

export async function fetchContinueWatching(token: string): Promise<ContinueWatchingItem[]> {
  const res = await fetch(`${API_BASE}/continue-watching`, {
    headers: { Authorization: `Bearer ${token}` },
  })

  if (!res.ok) throw new Error('Failed to fetch continue watching')
  return res.json()
}

/**
 * Fetch aggregated TMDB details for a list of progress items.
 * Eliminates the frontend N+1 fetch bottleneck by batching on the backend.
 */
export async function fetchAggregatedContinueWatching(
  items: ContinueWatchingItem[]
): Promise<{ media: Media; item: ContinueWatchingItem }[]> {
  if (!items || items.length === 0) return []

  const res = await fetch(`${API_BASE}/tmdb/continue-watching-details`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(items),
  })

  if (!res.ok) {
    throw new Error('Failed to fetch aggregated continue watching details')
  }

  return res.json()
}

export async function updateContinueWatching(token: string, data: ContinueWatchingItem) {
  const res = await fetch(`${API_BASE}/continue-watching`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(data),
  })

  if (!res.ok) throw new Error('Failed to update continue watching')
  return res.json()
}

export async function removeContinueWatching(
  token: string,
  tmdbId: number,
  mediaType: 'movie' | 'tv'
) {
  const res = await fetch(`${API_BASE}/continue-watching/${tmdbId}/${mediaType}`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${token}` },
  })

  if (!res.ok) throw new Error('Failed to remove continue watching')
}

/**
 * Fetch existing progress for a specific media item.
 * Used for movie heuristic logic (0.1 → 0.5 → 0.9).
 */
export async function fetchExistingProgress(
  token: string,
  tmdbId: number,
  mediaType: 'movie' | 'tv'
): Promise<ContinueWatchingItem | null> {
  const res = await fetch(`${API_BASE}/continue-watching/${tmdbId}/${mediaType}`, {
    headers: { Authorization: `Bearer ${token}` },
  })
  if (!res.ok) return null
  return res.json()
}

/* ======================================================
   EMBED URL BUILDER
====================================================== */

function fillTvTemplate(
  template: string,
  tmdbId: number,
  season: number,
  episode: number
): string {
  return template
    .replace('{tmdbId}', String(tmdbId))
    .replace('{season}', String(season))
    .replace('{episode}', String(episode))
}

function fillMovieTemplate(template: string, tmdbId: number): string {
  return template.replace('{tmdbId}', String(tmdbId))
}

export function buildEmbedUrl(
  mode: MediaMode,
  provider: string,
  mediaId: number,
  options: {
    season?: number
    episode?: number
    malId?: string
    subOrDub?: string
    media?: Media // used to read media_type for documentaries
  }
): string {
  const { season = 1, episode = 1, media } = options
  const providers = CONFIG.STREAM_PROVIDERS as Record<string, string>

  const tvUrl = (): string => {
    const template = providers[provider]
    return template ? fillTvTemplate(template, mediaId, season, episode) : ''
  }
  const movieUrl = (): string => {
    const template = providers[`${provider}_movie`]
    return template ? fillMovieTemplate(template, mediaId) : ''
  }

  // Documentaries can be either a movie or a TV series — resolve by media_type.
  if (mode === 'documentary' && media) {
    const actualMode = (media as any).media_type || 'movie'
    return actualMode === 'tv' ? tvUrl() : movieUrl()
  }

  if (mode === 'tv') return tvUrl()
  if (mode === 'movie') return movieUrl()

  return ''
}

/* ======================================================
   DOWNLOADS
====================================================== */

export type DownloadItem = {
  id: string
  title: string
  quality: string
  filename: string
}

export async function fetchDownloads(token?: string): Promise<DownloadItem[]> {
  const headers: Record<string, string> = {}
  if (token) {
    headers['Authorization'] = `Bearer ${token}`
  }

  const res = await fetch(`${API_BASE}/downloads`, { headers })
  if (!res.ok) {
    const errorText = await res.text()
    throw new Error(errorText)
  }
  return res.json()
}

export function downloadFile(id: string) {
  window.location.href = `${API_BASE}/downloads/${encodeURIComponent(id)}/file`
}

/* ======================================================
   ADMIN AUTHENTICATION
====================================================== */

export type AdminLoginResponse = {
  success: boolean
  token: string
  expiresIn: string
}

export type AdminVerifyResponse = {
  valid: boolean
  admin: {
    email: string
    role: string
  }
}

/** Admin login with daily code. Returns a JWT token on success. */
export async function adminLogin(code: string): Promise<AdminLoginResponse> {
  const res = await fetch(`${API_BASE}/admin/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ code }),
  })

  if (!res.ok) {
    const error = await res.json()
    throw new Error(error.message || 'Login failed')
  }

  return res.json()
}

/** Verify admin token validity. */
export async function verifyAdminToken(token: string): Promise<AdminVerifyResponse> {
  const res = await fetch(`${API_BASE}/admin/verify`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
  })

  if (!res.ok) {
    throw new Error('Token verification failed')
  }

  return res.json()
}

/** Admin logout (best-effort backend call + local token removal). */
export async function adminLogout(): Promise<void> {
  const token = localStorage.getItem('adminToken')

  if (token) {
    // Optional: call backend logout endpoint for consistency
    try {
      await fetch(`${API_BASE}/admin/logout`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      })
    } catch (error) {
      // Ignore errors but still proceed to clear the local token
      console.error('Admin logout error:', error)
    }
  }

  localStorage.removeItem('adminToken')
}

export function getAdminToken(): string | null {
  return localStorage.getItem('adminToken')
}

export function setAdminToken(token: string): void {
  localStorage.setItem('adminToken', token)
}

export function isAdminAuthenticated(): boolean {
  return !!getAdminToken()
}

/* ======================================================
   GUEST CONTINUE WATCHING (LocalStorage)
====================================================== */

const GUEST_PROGRESS_KEY = 'streamvault_guest_progress'
const GUEST_PROGRESS_TTL_MS = 30 * 86400 * 1000 // 30 days
const GUEST_PROGRESS_CAP = 20 // max stored items

/** Guest progress carries a client-side timestamp for TTL cleanup. */
type GuestProgressItem = ContinueWatchingItem & { savedAt?: number }

export function getGuestProgress(): ContinueWatchingItem[] {
  try {
    const data = localStorage.getItem(GUEST_PROGRESS_KEY)
    if (!data) return []
    const parsed = JSON.parse(data) as GuestProgressItem[]

    // Drop items older than the TTL (legacy items without savedAt are kept).
    const now = Date.now()
    return parsed.filter((item) => {
      if (!item.savedAt) return true
      return now - item.savedAt <= GUEST_PROGRESS_TTL_MS
    })
  } catch (e) {
    console.error('Failed to parse guest progress:', e)
    return []
  }
}

export function saveGuestProgress(item: ContinueWatchingItem) {
  try {
    const items = getGuestProgress() as GuestProgressItem[]
    const itemWithTimestamp: GuestProgressItem = { ...item, savedAt: Date.now() }

    const index = items.findIndex(
      (i) => i.tmdbId === item.tmdbId && i.mediaType === item.mediaType
    )

    if (index > -1) {
      items[index] = itemWithTimestamp
    } else {
      items.push(itemWithTimestamp)
    }

    // Keep the most recent N items to bound localStorage growth.
    const capped = items.slice(-GUEST_PROGRESS_CAP)

    localStorage.setItem(GUEST_PROGRESS_KEY, JSON.stringify(capped))
  } catch (e) {
    console.error('Failed to save guest progress:', e)
  }
}

export function removeGuestProgress(tmdbId: number, mediaType: 'movie' | 'tv') {
  try {
    const items = getGuestProgress()
    const filtered = items.filter(
      (i) => !(i.tmdbId === tmdbId && i.mediaType === mediaType)
    )
    localStorage.setItem(GUEST_PROGRESS_KEY, JSON.stringify(filtered))
  } catch (e) {
    console.error('Failed to remove guest progress:', e)
  }
}

export function getGuestItemProgress(
  tmdbId: number,
  mediaType: 'movie' | 'tv'
): ContinueWatchingItem | null {
  const items = getGuestProgress()
  return items.find((i) => i.tmdbId === tmdbId && i.mediaType === mediaType) || null
}

/* ======================================================
   CINEMATCH AI — Recommendation API Client
====================================================== */

export type RecoMediaType = 'movie' | 'tv'

export interface RecoItem {
  tmdbId: number
  mediaType: RecoMediaType
  title: string
  posterPath: string | null
  backdropPath: string | null
  overview: string
  releaseDate: string
  voteAverage: number
  voteCount: number
  popularity: number
  genreIds: number[]
  source: string
  score: number
  sourceReason: string
}

export interface RecoSection {
  title: string
  items: RecoItem[]
  source: string
}

export interface RecommendationResult {
  userId: string | null
  items: RecoItem[]
  sections: RecoSection[]
  computedAt: string
  isPersonalized: boolean
}

/** Fetch personalized recommendations for an authenticated user. */
export async function fetchRecommendations(
  accessToken: string,
  options: { limit?: number; forceRefresh?: boolean } = {}
): Promise<RecommendationResult> {
  const params = new URLSearchParams()
  if (options.limit) params.set('limit', String(options.limit))
  if (options.forceRefresh) params.set('refresh', 'true')

  const res = await fetch(`${API_BASE}/recommendations?${params}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  })
  if (!res.ok) throw new Error(`Recommendation fetch failed: ${res.status}`)
  return res.json()
}

/** Fetch cold-start recommendations for unauthenticated/guest users. */
export async function fetchGuestRecommendations(): Promise<RecommendationResult> {
  const res = await fetch(`${API_BASE}/recommendations/guest`)
  if (!res.ok) throw new Error(`Guest recommendation fetch failed: ${res.status}`)
  return res.json()
}

// Module-level guest session ID singleton — initialized once, reused across all interactions.
const getGuestSessionId = (() => {
  let id: string | null = null
  return () => {
    if (!id) {
      id = localStorage.getItem('guest_session_id')
      if (!id) {
        id = crypto.randomUUID()
        localStorage.setItem('guest_session_id', id)
      }
    }
    return id
  }
})()

/** Log a user interaction event for real-time recommendation updates. */
export async function logRecommendationInteraction(
  accessToken: string | null | undefined,
  event: {
    tmdbId: number
    mediaType: RecoMediaType
    eventType: 'watch' | 'favorite' | 'click' | 'search' | 'rate' | 'dislike'
    progress?: number
    rating?: number
    selectedServer?: string
    displayPosition?: number
    recommendationSource?: string
    genreIds?: number[] // pass genre context to skip an extra DB lookup
  }
): Promise<void> {
  try {
    const context = getDeviceContext()
    const payload = { ...event, ...context }

    if (accessToken) {
      // Authenticated user tracking
      await fetch(`${API_BASE}/recommendations/interaction`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      })
    } else {
      // Guest tracking for ML model telemetry
      const sessionId = getGuestSessionId()
      const guestPayload = { ...payload, sessionId }

      await fetch(`${API_BASE}/recommendations/guest/interaction`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(guestPayload),
      })
    }
  } catch {
    // Non-critical — fire and forget
  }
}