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
  providerId: string
): Promise<Media[]> {
  if (mode === 'downloads') return []

  // Sort by release date to get "Recently Added"
  const sortBy =
    mode === 'movie' ? 'primary_release_date.desc' : 'first_air_date.desc'

  // Get provider config to ensure correct region
  const provider = getProviderById(providerId)
  const region = provider?.region || WATCH_REGION

  // Calculate date range: last 12 months to today (relaxed for providers with smaller catalogs)
  const today = new Date()
  const twelveMonthsAgo = new Date(today)
  twelveMonthsAgo.setMonth(today.getMonth() - 12)

  const todayStr = today.toISOString().split('T')[0]
  const twelveMonthsAgoStr = twelveMonthsAgo.toISOString().split('T')[0]

  let url = `${API_BASE}/tmdb/discover/${mode}?sort_by=${sortBy}&page=1`
  url += `&with_watch_providers=${providerId}&watch_region=${region}`
  url += `&with_watch_monetization_types=flatrate`  // Only streaming (not buy/rent)
  url += `&vote_count.gte=50`  // Lowered from 100 to get more results

  // Restrict to last 12 months for "recent" content
  if (mode === 'movie') {
      url += `&primary_release_date.gte=${twelveMonthsAgoStr}`
      url += `&primary_release_date.lte=${todayStr}`
  } else {
      url += `&first_air_date.gte=${twelveMonthsAgoStr}`
      url += `&first_air_date.lte=${todayStr}`
  }

  const res = await fetch(url)
  if (!res.ok) {
    console.error('fetchRecentlyAdded failed:', res.status, res.statusText)
    return []
  }
  const data = await res.json()
  return data.results || []
}

export async function fetchTrending(mode: MediaMode): Promise<Media[]> {
  if (mode === 'downloads') return []

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

  const url = `${API_BASE}/tmdb/search/${mode}?query=${encodeURIComponent(
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
  if (mode === 'downloads') return null

  const url = `${API_BASE}/tmdb/${mode}/${id}`
  const res = await fetch(url)
  return res.json()
}

export async function fetchTVSeasons(
  tvId: number
): Promise<{ season_number: number; episode_count: number; name: string }[]> {
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
  }
): string {
  const { season = 1, episode = 1 } = options
  const providers = CONFIG.STREAM_PROVIDERS as Record<string, string>

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
