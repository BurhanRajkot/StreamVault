import { CONFIG, Media, MediaMode } from './config'

/* ======================================================
   API BASE
====================================================== */

const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:4000'

/* ======================================================
   TMDB FETCHING (via Backend Proxy)
====================================================== */

import { getProviderById, WATCH_REGION } from './ottProviders'

export async function fetchPopular(
  mode: MediaMode,
  page = 1,
  providerId?: string | null
): Promise<{ results: Media[]; total_pages: number }> {
  // Downloads has no TMDB data
  if (mode === 'downloads') {
    return { results: [], total_pages: 0 }
  }

  // HOME MODE: Fetch Mix of Movies and TV
  if (mode === 'home') {
    let movieUrl = `${API_BASE}/tmdb/discover/movie?sort_by=popularity.desc&page=${page}`
    let tvUrl = `${API_BASE}/tmdb/discover/tv?sort_by=popularity.desc&page=${page}`

    if (providerId) {
      const provider = getProviderById(providerId)
      const region = provider?.region || WATCH_REGION
      const providerParams = `&with_watch_providers=${providerId}&watch_region=${region}&with_watch_monetization_types=flatrate`

      movieUrl += providerParams
      tvUrl += providerParams
    }

    try {
      const [movieRes, tvRes] = await Promise.all([fetch(movieUrl), fetch(tvUrl)])
      const movieData = await movieRes.json()
      const tvData = await tvRes.json()

      const movies = (movieData.results || []).map((m: any) => ({ ...m, media_type: 'movie' }))
      const tv = (tvData.results || []).map((t: any) => ({ ...t, media_type: 'tv' }))

      const combined = [...movies, ...tv]
      combined.sort((a, b) => (b.popularity || 0) - (a.popularity || 0))

      return {
        results: combined,
        total_pages: Math.max(movieData.total_pages || 0, tvData.total_pages || 0),
      }
    } catch (e) {
      console.error('Home fetch failed', e)
      return { results: [], total_pages: 0 }
    }
  }

  // DOCUMENTARY MODE: Fetch Mix of Movies (99) and TV (99)
  if (mode === 'documentary') {
    let movieUrl = `${API_BASE}/tmdb/discover/movie?with_genres=99&sort_by=popularity.desc&page=${page}`
    let tvUrl = `${API_BASE}/tmdb/discover/tv?with_genres=99&sort_by=popularity.desc&page=${page}`

    if (providerId) {
      const provider = getProviderById(providerId)
      const region = provider?.region || WATCH_REGION
      const providerParams = `&with_watch_providers=${providerId}&watch_region=${region}&with_watch_monetization_types=flatrate`

      movieUrl += providerParams
      tvUrl += providerParams
    }

    try {
      const [movieRes, tvRes] = await Promise.all([fetch(movieUrl), fetch(tvUrl)])
      const movieData = await movieRes.json()
      const tvData = await tvRes.json()

      // Merge and shuffle/sort results
      const movies = (movieData.results || []).map((m: any) => ({ ...m, media_type: 'movie' }))
      const tv = (tvData.results || []).map((t: any) => ({ ...t, media_type: 'tv' }))

      // Combine
      const combined = [...movies, ...tv]

      // Sort by popularity (descending)
      combined.sort((a, b) => (b.popularity || 0) - (a.popularity || 0))

      return {
        results: combined,
        total_pages: Math.max(movieData.total_pages || 0, tvData.total_pages || 0),
      }

    } catch (e) {
      console.error('Documentary fetch failed', e)
      return { results: [], total_pages: 0 }
    }
  }

  let url = `${API_BASE}/tmdb/discover/${mode}?page=${page}`
  if (providerId) {
    // Get the provider config to find the correct region (e.g. US for HBO Max, IN for others)
    const provider = getProviderById(providerId)
    const region = provider?.region || WATCH_REGION

    url += `&with_watch_providers=${providerId}&watch_region=${region}&with_watch_monetization_types=flatrate%7Cbuy%7Crent&sort_by=popularity.desc`

    // Fallback/Hack: HBO Max (384) sometimes returns empty for 'US' if not strictly correct.
    // Ensuring basic discover params are robust.
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

  // Sort by release date to get "Recently Added"
  const sortBy =
    mode === 'movie' ? 'primary_release_date.desc' : 'first_air_date.desc'

  // Get provider config to ensure correct region
  let region = WATCH_REGION
  if (providerId) {
     const provider = getProviderById(providerId)
     region = provider?.region || WATCH_REGION
  }

  // Calculate date range: last 24 months to today (expanded for providers with smaller catalogs)
  const today = new Date()
  const monthsAgo = new Date(today)
  monthsAgo.setMonth(today.getMonth() - 24)  // Expanded from 12 to 24 months

  const todayStr = today.toISOString().split('T')[0]
  const monthsAgoStr = monthsAgo.toISOString().split('T')[0]

  // HOME MODE: Fetch Recent Movies and TV
  if (mode === 'home') {
    let movieUrl = `${API_BASE}/tmdb/discover/movie?sort_by=primary_release_date.desc&page=1`
    movieUrl += `&primary_release_date.gte=${monthsAgoStr}&primary_release_date.lte=${todayStr}`
    movieUrl += `&vote_count.gte=20`

    let tvUrl = `${API_BASE}/tmdb/discover/tv?sort_by=first_air_date.desc&page=1`
    tvUrl += `&first_air_date.gte=${monthsAgoStr}&first_air_date.lte=${todayStr}`
    tvUrl += `&vote_count.gte=20`

    if (providerId) {
        const providerParams = `&with_watch_providers=${providerId}&watch_region=${region}&with_watch_monetization_types=flatrate`
        movieUrl += providerParams
        tvUrl += providerParams
    }

    try {
      const [movieRes, tvRes] = await Promise.all([fetch(movieUrl), fetch(tvUrl)])

      const movieData = await movieRes.json()
      const tvData = await tvRes.json()

      const movies = (movieData.results || []).map((m: any) => ({
        ...m,
        media_type: 'movie',
        date: new Date(m.release_date || m.primary_release_date || 0)
      }))

      const tv = (tvData.results || []).map((t: any) => ({
        ...t,
        media_type: 'tv',
        date: new Date(t.first_air_date || 0)
      }))

      const combined = [...movies, ...tv]
      combined.sort((a, b) => b.date.getTime() - a.date.getTime())

      return combined

    } catch (e) {
      console.error('Home recently added fetch failed', e)
      return []
    }
  }

  // DOCUMENTARY MODE: Fetch Recent Movies (99) and TV (99)
  if (mode === 'documentary') {
    let movieUrl = `${API_BASE}/tmdb/discover/movie?sort_by=primary_release_date.desc&page=1`
    movieUrl += `&with_genres=99`
    movieUrl += `&primary_release_date.gte=${monthsAgoStr}&primary_release_date.lte=${todayStr}`

    // Lower vote count for documentaries as they have fewer ratings
    movieUrl += `&vote_count.gte=5`

    let tvUrl = `${API_BASE}/tmdb/discover/tv?sort_by=first_air_date.desc&page=1`
    tvUrl += `&with_genres=99`
    tvUrl += `&first_air_date.gte=${monthsAgoStr}&first_air_date.lte=${todayStr}`
    tvUrl += `&vote_count.gte=5`

    // Add provider filter if selected
    if (providerId) {
        const providerParams = `&with_watch_providers=${providerId}&watch_region=${region}&with_watch_monetization_types=flatrate`
        movieUrl += providerParams
        tvUrl += providerParams
    }

    try {
      const [movieRes, tvRes] = await Promise.all([fetch(movieUrl), fetch(tvUrl)])

      const movieData = await movieRes.json()
      const tvData = await tvRes.json()

      const movies = (movieData.results || []).map((m: any) => ({
        ...m,
        media_type: 'movie',
        date: new Date(m.release_date || m.primary_release_date || 0)
      }))

      const tv = (tvData.results || []).map((t: any) => ({
        ...t,
        media_type: 'tv',
        date: new Date(t.first_air_date || 0)
      }))

      // Combine and Sort by Date (Newest First)
      const combined = [...movies, ...tv]
      combined.sort((a, b) => b.date.getTime() - a.date.getTime())

      return combined

    } catch (e) {
      console.error('Documentary recently added fetch failed', e)
      return []
    }
  }

  let url = `${API_BASE}/tmdb/discover/${mode}?sort_by=${sortBy}&page=1`
  url += `&with_watch_providers=${providerId}&watch_region=${region}`
  url += `&with_watch_monetization_types=flatrate`  // Only streaming (not buy/rent)
  url += `&vote_count.gte=20`  // Lowered from 50 to get more results

  // Restrict to last 24 months for "recent" content
  if (mode === 'movie') {
      url += `&primary_release_date.gte=${monthsAgoStr}`
      url += `&primary_release_date.lte=${todayStr}`
  } else {
      url += `&first_air_date.gte=${monthsAgoStr}`
      url += `&first_air_date.lte=${todayStr}`
  }

  const res = await fetch(url)
  if (!res.ok) {
    console.error('fetchRecentlyAdded failed:', res.status, res.statusText)
    return []
  }
  const data = await res.json()

  // Trust TMDB's discover API - it already filters by provider
  // This eliminates 3 additional API calls for validation, improving load time by ~75%
  return data.results || []
}

export async function fetchTrending(mode: MediaMode): Promise<Media[]> {
  if (mode === 'downloads') return []

  // Documentaries and Home: Use Popular as Trending
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
  page = 1
): Promise<{ results: Media[]; total_pages: number }> {
  if (mode === 'downloads') {
    return { results: [], total_pages: 0 }
  }

  // Documentaries: Search Movies (closest approx) or Mixed
  // Implementing true filtered search is complex, usually users search for "Planet Earth"
  // Let's just search 'multi' or 'movie'?
  // Search API doesn't support genre filter easily.
  // For now, let's search 'movie' as fallback (most user intent)
  const searchMode = (mode === 'documentary' || mode === 'home') ? 'movie' : mode

  const url = `${API_BASE}/tmdb/search/${searchMode}?query=${encodeURIComponent(
    query
  )}&page=${page}`

  const res = await fetch(url)
  const data = await res.json()

  return {
    results: data.results || [],
    total_pages: data.total_pages || 0,
  }
}

export async function fetchMediaDetails(
  mode: MediaMode,
  id: number
): Promise<Media | null> {
  if (mode === 'downloads' || !id) return null

  const url = `${API_BASE}/tmdb/${mode}/${id}?append_to_response=credits,similar`
  const res = await fetch(url)
  if (!res.ok) {
    console.error(`fetchMediaDetails failed for ${mode}/${id}:`, res.status)
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
  size: 'poster' | 'backdrop' | 'thumbnail' = 'poster'
): string {
  if (!path) return '/placeholder.svg'
  return `${CONFIG.IMG_BASE_URL}${CONFIG.IMG_SIZES[size]}${path}`
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

export async function fetchContinueWatching(
  token: string
): Promise<ContinueWatchingItem[]> {
  const res = await fetch(`${API_BASE}/continue-watching`, {
    headers: { Authorization: `Bearer ${token}` },
  })

  if (!res.ok) throw new Error('Failed to fetch continue watching')
  return res.json()
}

export async function updateContinueWatching(
  token: string,
  data: ContinueWatchingItem
) {
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
  const res = await fetch(
    `${API_BASE}/continue-watching/${tmdbId}/${mediaType}`,
    {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${token}` },
    }
  )

  if (!res.ok) throw new Error('Failed to remove continue watching')
}

/**
 * Helper to fetch existing progress for a specific media item
 * Used for movie heuristic logic (0.1 → 0.5 → 0.9)
 */
export async function fetchExistingProgress(
  token: string,
  tmdbId: number,
  mediaType: 'movie' | 'tv'
): Promise<ContinueWatchingItem | null> {
  const items = await fetchContinueWatching(token)
  return items.find(i => i.tmdbId === tmdbId && i.mediaType === mediaType) || null
}

/* ======================================================
   EMBED URL BUILDER
====================================================== */

export function buildEmbedUrl(
  mode: MediaMode,
  provider: string,
  mediaId: number,
  options: {
    season?: number
    episode?: number
    malId?: string
    subOrDub?: string
    media?: Media // Add media object to access media_type for documentaries
  }
): string {
  const { season = 1, episode = 1, media } = options
  const providers = CONFIG.STREAM_PROVIDERS as Record<string, string>

  // Handle documentary mode by checking media_type
  if (mode === 'documentary' && media) {
    const actualMode = (media as any).media_type || 'movie' // Default to movie if not specified

    if (actualMode === 'tv') {
      const template = providers[provider]
      if (!template) return ''
      return template
        .replace('{tmdbId}', String(mediaId))
        .replace('{season}', String(season))
        .replace('{episode}', String(episode))
    } else {
      const template = providers[`${provider}_movie`]
      if (!template) return ''
      return template.replace('{tmdbId}', String(mediaId))
    }
  }

  if (mode === 'tv') {
    const template = providers[provider]
    if (!template) return ''
    return template
      .replace('{tmdbId}', String(mediaId))
      .replace('{season}', String(season))
      .replace('{episode}', String(episode))
  }

  if (mode === 'movie') {
    const template = providers[`${provider}_movie`]
    if (!template) return ''
    return template.replace('{tmdbId}', String(mediaId))
  }

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
  window.location.href = `${API_BASE}/downloads/${id}/file`
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

/**
 * Admin login with daily code
 * Returns JWT token on success
 */
export async function adminLogin(
  code: string
): Promise<AdminLoginResponse> {
  const res = await fetch(`${API_BASE}/admin/login`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ code }),
  })

  if (!res.ok) {
    const error = await res.json()
    throw new Error(error.message || 'Login failed')
  }

  return res.json()
}

/**
 * Verify admin token validity
 */
export async function verifyAdminToken(
  token: string
): Promise<AdminVerifyResponse> {
  const res = await fetch(`${API_BASE}/admin/verify`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
    },
  })

  if (!res.ok) {
    throw new Error('Token verification failed')
  }

  return res.json()
}

/**
 * Admin logout (client-side token removal)
 */
export async function adminLogout(): Promise<void> {
  // Remove token from localStorage
  localStorage.removeItem('adminToken')

  // Optional: call backend logout endpoint for consistency
  try {
    await fetch(`${API_BASE}/admin/logout`, {
      method: 'POST',
    })
  } catch (error) {
    // Ignore errors - token is already removed client-side
    console.error('Admin logout error:', error)
  }
}

/**
 * Get admin token from localStorage
 */
export function getAdminToken(): string | null {
  return localStorage.getItem('adminToken')
}

/**
 * Set admin token in localStorage
 */
export function setAdminToken(token: string): void {
  localStorage.setItem('adminToken', token)
}

/**
 * Check if user is currently authenticated as admin
 */
export function isAdminAuthenticated(): boolean {
  return !!getAdminToken()
}


/* ======================================================
   GUEST CONTINUE WATCHING (LocalStorage)
====================================================== */

const GUEST_PROGRESS_KEY = 'streamvault_guest_progress'

export function getGuestProgress(): ContinueWatchingItem[] {
  try {
    const data = localStorage.getItem(GUEST_PROGRESS_KEY)
    if (!data) return []
    return JSON.parse(data)
  } catch (e) {
    console.error('Failed to parse guest progress:', e)
    return []
  }
}

export function saveGuestProgress(item: ContinueWatchingItem) {
  try {
    const items = getGuestProgress()
    const index = items.findIndex(
      (i) => i.tmdbId === item.tmdbId && i.mediaType === item.mediaType
    )

    if (index > -1) {
      items[index] = item
    } else {
      items.push(item)
    }

    // Cap at 20 items to prevent unbounded localStorage growth (remove oldest)
    const capped = items.slice(-20)

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

/** Fetch personalized recommendations for an authenticated user */
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

/** Fetch cold-start recommendations for unauthenticated/guest users */
export async function fetchGuestRecommendations(): Promise<RecommendationResult> {
  const res = await fetch(`${API_BASE}/recommendations/guest`)
  if (!res.ok) throw new Error(`Guest recommendation fetch failed: ${res.status}`)
  return res.json()
}

import { getDeviceContext } from './telemetry'

/** Log a user interaction event for real-time recommendation updates */
export async function logRecommendationInteraction(
  accessToken: string | null | undefined,
  event: {
    tmdbId: number
    mediaType: RecoMediaType
    eventType: 'watch' | 'favorite' | 'click' | 'search' | 'rate' | 'dislike'
    progress?: number
    rating?: number
    selectedServer?: string
  }
): Promise<void> {
  try {
    const context = getDeviceContext();
    const payload = { ...event, ...context };

    if (accessToken) {
      // Authenticated User Tracking
      await fetch(`${API_BASE}/recommendations/interaction`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      })
    } else {
      // Guest Tracking for ML Model Telemetry
      let sessionId = localStorage.getItem('guest_session_id');
      if (!sessionId) {
        sessionId = crypto.randomUUID();
        localStorage.setItem('guest_session_id', sessionId);
      }

      const guestPayload = { ...payload, sessionId };

      await fetch(`${API_BASE}/recommendations/guest/interaction`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(guestPayload),
      })
    }
  } catch {
    // Non-critical — fire and forget
  }
}

