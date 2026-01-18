import { CONFIG, Media, MediaMode } from './config'

/* ======================================================
   API BASE
====================================================== */

const API_BASE = import.meta.env.VITE_API_URL

/* ======================================================
   TMDB FETCHING
====================================================== */

export async function fetchPopular(
  mode: MediaMode,
  page = 1
): Promise<{ results: Media[]; total_pages: number }> {
  if (mode === 'anime') return { results: [], total_pages: 0 }

  const url = `${CONFIG.TMDB_BASE_URL}/discover/${mode}?sort_by=popularity.desc&api_key=${CONFIG.TMDB_API_KEY}&page=${page}`

  const res = await fetch(url)
  const data = await res.json()

  return {
    results: data.results || [],
    total_pages: data.total_pages || 0,
  }
}

export async function fetchTrending(mode: MediaMode): Promise<Media[]> {
  if (mode === 'anime') return []

  const url = `${CONFIG.TMDB_BASE_URL}/trending/${mode}/week?api_key=${CONFIG.TMDB_API_KEY}`
  const res = await fetch(url)
  const data = await res.json()

  return data.results || []
}

export async function searchMedia(
  mode: MediaMode,
  query: string,
  page = 1
): Promise<{ results: Media[]; total_pages: number }> {
  if (mode === 'anime') return { results: [], total_pages: 0 }

  const url = `${CONFIG.TMDB_BASE_URL}/search/${mode}?api_key=${CONFIG.TMDB_API_KEY}&query=${encodeURIComponent(
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
  if (mode === 'anime') return null

  const url = `${CONFIG.TMDB_BASE_URL}/${mode}/${id}?api_key=${CONFIG.TMDB_API_KEY}`
  const res = await fetch(url)
  return res.json()
}

export async function fetchTVSeasons(
  tvId: number
): Promise<{ season_number: number; episode_count: number; name: string }[]> {
  const url = `${CONFIG.TMDB_BASE_URL}/tv/${tvId}?api_key=${CONFIG.TMDB_API_KEY}`
  const res = await fetch(url)
  const data = await res.json()

  return data.seasons?.filter((s: any) => s.season_number > 0) || []
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

/* ======================================================
   EMBED URL BUILDER  ✅ REQUIRED BY PlayerModal
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
  const { season = 1, episode = 1, malId = '', subOrDub = 'sub' } = options

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

  if (mode === 'anime') {
    const template = providers[`${provider}_anime`]
    if (!template) return ''
    return template
      .replace('{MALid}', malId)
      .replace('{number}', String(episode))
      .replace('{subOrDub}', subOrDub)
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

export async function fetchDownloads(): Promise<DownloadItem[]> {
  const res = await fetch(`${API_BASE}/downloads`)
  if (!res.ok) throw new Error('Failed to fetch downloads')
  return res.json()
}

export function downloadFile(id: string) {
  window.location.href = `${API_BASE}/downloads/${id}/file`
}
