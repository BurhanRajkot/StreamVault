/**
 * TorBox frontend API client
 *
 * Talks to the StreamVault backend proxy at /torbox/* — the actual TorBox API
 * key never leaves the backend. All calls here go to our own server.
 */

const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:4000'

// ---------------------------------------------------------------------------
// Shared types (mirrors backend/src/lib/torbox.ts)
// ---------------------------------------------------------------------------

export interface TorboxFile {
  id: number
  md5: string | null
  s3_path: string
  name: string
  size: number
  mimetype: string
  short_name: string
}

export interface TorboxTorrent {
  id: number
  hash: string
  name: string
  size: number
  downloaded: number
  progress: number
  download_state: string
  seeds: number
  ratio: number
  eta: number
  download_speed: number
  upload_speed: number
  files: TorboxFile[]
  created_at: string
  updated_at: string
  cached: boolean
  download_present: boolean
  download_finished: boolean
  active: boolean
}

export interface TorboxUpStatus {
  connected: boolean
  note: string | null
}

// ---------------------------------------------------------------------------
// API helpers
// ---------------------------------------------------------------------------

function authHeaders(token?: string): HeadersInit {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' }
  if (token) headers['Authorization'] = `Bearer ${token}`
  return headers
}

async function handleResponse<T>(res: Response): Promise<T> {
  if (!res.ok) {
    const body = await res.json().catch(() => ({ error: res.statusText })) as { error?: string }
    throw new Error(body?.error || `Request failed: ${res.status}`)
  }
  return res.json() as Promise<T>
}

// ---------------------------------------------------------------------------
// Public functions
// ---------------------------------------------------------------------------

/**
 * Check whether TorBox is reachable (no auth required).
 */
export async function fetchTorboxStatus(): Promise<{
  success: boolean
  data: TorboxUpStatus
  detail: string
}> {
  const res = await fetch(`${API_BASE}/torbox/status`)
  return handleResponse(res)
}

/**
 * List the authenticated user's active TorBox torrents.
 * @param token - Auth0 access token or admin token
 */
export async function fetchTorboxList(token?: string): Promise<{
  success: boolean
  data: TorboxTorrent[]
  detail: string
}> {
  const res = await fetch(`${API_BASE}/torbox/mylist`, {
    headers: authHeaders(token),
  })
  return handleResponse(res)
}

/**
 * Check whether a torrent hash is instantly cached on TorBox.
 * @param hash  - 40-char hex info-hash
 * @param token - Auth0 access token or admin token
 */
export async function checkTorboxCached(
  hash: string,
  token?: string
): Promise<{
  success: boolean
  data: { hash: string; instant: boolean }
  detail: string
}> {
  const res = await fetch(`${API_BASE}/torbox/check`, {
    method: 'POST',
    headers: authHeaders(token),
    body: JSON.stringify({ hash }),
  })
  return handleResponse(res)
}

/**
 * Get a direct CDN stream/download URL for a specific file in a torrent.
 *
 * The returned URL is short-lived (~1 hour). Open it with `window.open()` or
 * navigate `window.location.href` to it to start streaming/downloading.
 *
 * @param torrentId - Torrent `id` from `fetchTorboxList()`
 * @param fileId    - File `id` from `torrent.files[]`
 * @param token     - Auth0 access token or admin token
 */
export async function getTorboxStreamUrl(
  torrentId: number,
  fileId: number,
  token?: string
): Promise<{ url: string }> {
  const res = await fetch(
    `${API_BASE}/torbox/stream/${torrentId}/${fileId}`,
    { headers: authHeaders(token) }
  )
  return handleResponse(res)
}

/**
 * Format bytes into a human-readable size string.
 */
export function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B'
  const k = 1024
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(2))} ${sizes[i]}`
}

// ---------------------------------------------------------------------------
// TorBox Search (apibay → TorBox cache check)
// ---------------------------------------------------------------------------

export interface TorboxSearchResult {
  id: string
  name: string
  /** Info-hash (uppercase hex) */
  info_hash: string
  seeders: string
  leechers: string
  size: string
  num_files: string
  username: string
  added: string
  category: string
  imdb?: string
  /** True when TorBox can stream this instantly */
  torbox_cached: boolean
}

/**
 * Search movies/TV shows via apibay + TorBox cache check.
 * Returns results ranked by seeders with cached ones first.
 *
 * @param query - Title to search (e.g. "Inception 2010")
 * @param token - Auth0/admin token
 * @param opts.limit - Max results (default 20)
 * @param opts.cat   - apibay category: 0=all, 207=HD, 208=TV
 */
export async function searchTorbox(
  query: string,
  token?: string,
  opts: { limit?: number; cat?: number } = {}
): Promise<{
  success: boolean
  data: TorboxSearchResult[]
  detail: string
}> {
  const params = new URLSearchParams({ q: query })
  if (opts.limit) params.set('limit', String(opts.limit))
  if (opts.cat !== undefined) params.set('cat', String(opts.cat))

  const res = await fetch(`${API_BASE}/torbox/search?${params}`, {
    headers: authHeaders(token),
  })
  return handleResponse(res)
}

/**
 * Search for a specific movie/episode by IMDb id (+ season/episode for TV)
 * across every indexer source the backend knows about (Comet + apibay for
 * movies). Unlike `searchTorbox`, this is matched by identity, not free text,
 * so it reliably distinguishes a TV season pack from a single episode.
 *
 * @param title    - Title, used as the apibay fallback query (movies only)
 * @param imdbId   - IMDb id, e.g. "tt1375666" — omit to skip Comet entirely
 * @param mediaType - 'movie' | 'tv'
 * @param token    - Auth0/admin token
 * @param opts.season/episode - Required for 'tv' to match Comet's per-episode search
 * @param opts.limit - Max results (default 20)
 */
export async function searchTorboxMedia(
  title: string,
  imdbId: string | undefined,
  mediaType: 'movie' | 'tv',
  token?: string,
  opts: { season?: number; episode?: number; limit?: number } = {}
): Promise<{
  success: boolean
  data: TorboxSearchResult[]
  detail: string
}> {
  const params = new URLSearchParams({ title, type: mediaType })
  if (imdbId) params.set('imdb', imdbId)
  if (opts.season != null) params.set('season', String(opts.season))
  if (opts.episode != null) params.set('episode', String(opts.episode))
  if (opts.limit) params.set('limit', String(opts.limit))

  const res = await fetch(`${API_BASE}/torbox/media-search?${params}`, {
    headers: authHeaders(token),
  })
  return handleResponse(res)
}

/**
 * Add a torrent to TorBox by its info-hash (for uncached search results).
 * @param hash  - 40-char hex info-hash
 * @param name  - Display name (from search result)
 * @param token - Auth0/admin token
 */
export async function addTorboxByHash(
  hash: string,
  name: string,
  token?: string
): Promise<{
  success: boolean
  data: { torrent_id: number; hash: string; name: string; files?: TorboxFile[] } | null
  detail: string
}> {
  const res = await fetch(`${API_BASE}/torbox/add-hash`, {
    method: 'POST',
    headers: authHeaders(token),
    body: JSON.stringify({ hash, name }),
  })
  return handleResponse(res)
}

// ---------------------------------------------------------------------------
// Quality / category parsing helpers
// ---------------------------------------------------------------------------

/** Extract quality tag from torrent name */
export function parseTorrentQuality(name: string): string {
  if (/\b(2160p|4K|UHD)\b/i.test(name)) return '4K'
  if (/\b1080p\b/i.test(name)) return '1080p'
  if (/\b720p\b/i.test(name)) return '720p'
  if (/\b480p\b/i.test(name)) return '480p'
  return 'SD'
}

/** Quality badge colour class */
export function qualityColorClass(quality: string): string {
  switch (quality) {
    case '4K': return 'text-amber-400 bg-amber-400/10 border-amber-400/20'
    case '1080p': return 'text-violet-400 bg-violet-400/10 border-violet-400/20'
    case '720p': return 'text-sky-400 bg-sky-400/10 border-sky-400/20'
    case '480p': return 'text-zinc-400 bg-zinc-400/10 border-zinc-400/20'
    default: return 'text-muted-foreground bg-secondary border-border/40'
  }
}

/** Extract source tag from torrent name (BluRay, WEBRip, etc.) */
export function parseTorrentSource(name: string): string | null {
  if (/\b(BluRay|BDRemux|BDRip|BRRip)\b/i.test(name)) return 'BluRay'
  if (/\bWEB-?DL\b/i.test(name)) return 'WEB-DL'
  if (/\bWEB-?Rip\b/i.test(name)) return 'WEBRip'
  if (/\bHDRip\b/i.test(name)) return 'HDRip'
  if (/\bHDTV\b/i.test(name)) return 'HDTV'
  if (/\bYIFY\b/i.test(name)) return 'YIFY'
  return null
}

/** Check if name contains HDR/DV tags */
export function parseTorrentHDR(name: string): string | null {
  if (/\bDolby.?Vision\b|\bDV\b/i.test(name)) return 'DV'
  if (/\bHDR10\+/i.test(name)) return 'HDR10+'
  if (/\bHDR\b/i.test(name)) return 'HDR'
  return null
}

function normalizeTitle(s: string): string {
  return s
    .toLowerCase()
    .replace(/['’]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
}

/**
 * Find the torrent in a TorBox library whose name matches a title.
 *
 * Pure title matching against content already in the account — there is no
 * indexer/search step here, so a title not already added simply won't match.
 * Among matches, prefers ready-to-stream torrents, then the largest (usually
 * the best-quality encode).
 */
export function findTorrentForTitle(
  torrents: TorboxTorrent[],
  title: string
): TorboxTorrent | null {
  const target = normalizeTitle(title)
  if (!target) return null

  const candidates = torrents.filter((t) => normalizeTitle(t.name).includes(target))
  if (candidates.length === 0) return null

  return [...candidates].sort((a, b) => {
    const aReady = a.download_finished || a.cached ? 1 : 0
    const bReady = b.download_finished || b.cached ? 1 : 0
    if (aReady !== bReady) return bReady - aReady
    return b.size - a.size
  })[0]
}

function videoFiles(files: TorboxFile[]): TorboxFile[] {
  const videos = files.filter(
    (f) => f.mimetype.startsWith('video/') || /\.(mp4|mkv|avi|mov|m4v|wmv|webm)$/i.test(f.name)
  )
  return videos.length ? videos : files
}

/** The largest video file in a torrent — usually the main feature. */
export function largestVideoFile(torrent: TorboxTorrent): TorboxFile | null {
  const pool = videoFiles(torrent.files)
  if (pool.length === 0) return null
  return [...pool].sort((a, b) => b.size - a.size)[0]
}

/**
 * Find the file matching a specific season/episode inside a torrent — needed
 * because a "release" for a TV episode is often a season pack containing
 * every episode as a separate file, so `largestVideoFile` alone would just
 * pick whichever episode happens to have the biggest file (or file 0), not
 * the one the user actually asked to watch.
 *
 * Falls back to the largest file when nothing matches (e.g. the release is
 * already a single-episode file with no season/episode markers in its name).
 */
export function findEpisodeFile(
  files: TorboxFile[],
  season: number,
  episode: number
): TorboxFile | null {
  const pool = videoFiles(files)
  if (pool.length === 0) return null
  if (pool.length === 1) return pool[0]

  const patterns = [
    new RegExp(`s0*${season}[._\\s-]*e0*${episode}(?!\\d)`, 'i'), // S05E03, S5.E3, S05 E03
    new RegExp(`\\b${season}x0*${episode}(?!\\d)`, 'i'), // 5x03
    new RegExp(`\\be0*${episode}(?!\\d)`, 'i'), // per-season torrent named just "E03"
  ]

  for (const pattern of patterns) {
    const match = pool.find((f) => pattern.test(f.name))
    if (match) return match
  }

  // Last resort: a bare episode number as its own path segment/word, e.g. "03 - Title.mkv"
  const bareNumber = new RegExp(`(?:^|[^\\d])0*${episode}(?:[^\\d]|$)`)
  const bareMatch = pool.find((f) => bareNumber.test(f.name.replace(/\d{4}/g, ''))) // strip 4-digit years first
  if (bareMatch) return bareMatch

  return [...pool].sort((a, b) => b.size - a.size)[0]
}

/**
 * Pick the file to play from a torrent's file list — episode-aware for TV,
 * largest-video for movies.
 */
export function pickPlaybackFile(
  files: TorboxFile[],
  mediaType: 'movie' | 'tv',
  season?: number,
  episode?: number
): TorboxFile | null {
  if (mediaType === 'tv' && season != null && episode != null) {
    return findEpisodeFile(files, season, episode)
  }
  const pool = videoFiles(files)
  if (pool.length === 0) return null
  return [...pool].sort((a, b) => b.size - a.size)[0]
}

/**
 * Map a TorBox download_state string to a user-friendly label + colour class.
 */
export function torboxStateLabel(state: string): {
  label: string
  colorClass: string
} {
  switch (state.toLowerCase()) {
    case 'completed':
    case 'seeding':
      return { label: 'Ready', colorClass: 'text-emerald-400' }
    case 'downloading':
      return { label: 'Downloading', colorClass: 'text-sky-400' }
    case 'stalled':
      return { label: 'Stalled', colorClass: 'text-amber-400' }
    case 'paused':
      return { label: 'Paused', colorClass: 'text-zinc-400' }
    case 'cached':
      return { label: 'Cached ⚡', colorClass: 'text-violet-400' }
    default:
      return { label: state, colorClass: 'text-muted-foreground' }
  }
}
