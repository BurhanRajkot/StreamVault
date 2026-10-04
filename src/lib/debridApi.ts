/**
 * Debrid (Real-Debrid) frontend API client
 *
 * Talks to the StreamVault backend at /debrid/* — the Real-Debrid API key
 * never leaves the backend. The backend only hands back links: the video
 * itself streams straight from Real-Debrid to the browser.
 */

const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:4000'

// ---------------------------------------------------------------------------
// Shared types (mirrors backend/src/lib/debrid.ts)
// ---------------------------------------------------------------------------

export type DebridTorrentStatus =
  | 'magnet_error'
  | 'magnet_conversion'
  | 'waiting_files_selection'
  | 'queued'
  | 'downloading'
  | 'downloaded'
  | 'error'
  | 'virus'
  | 'compressing'
  | 'uploading'
  | 'dead'

export interface DebridTorrent {
  id: string
  filename: string
  hash: string
  bytes: number
  /** 0-100 */
  progress: number
  status: DebridTorrentStatus
  added: string
  links: string[]
  speed?: number
  seeders?: number
}

export interface DebridTorrentFile {
  /** 1-based, in torrent order */
  id: number
  path: string
  bytes: number
  /** 1 when selected */
  selected: number
}

export interface DebridTorrentInfo extends DebridTorrent {
  files: DebridTorrentFile[]
}

export interface DebridAccountStatus {
  connected: boolean
  premium: boolean
  expiration: string | null
  note: string | null
}

export interface DebridAudioTrack {
  id: string
  lang: string
  langIso: string
  codec: string | null
  channels: number | null
}

export interface DebridMediaSummary {
  videoCodec: string | null
  /** In file order — the first one is what a direct stream plays. */
  audioTracks: DebridAudioTrack[]
  /** The track the HLS links carry. */
  selectedAudio: string | null
  duration: number | null
}

export interface DebridReadyPlayback {
  status: 'ready'
  torrentId: string
  fileId: number
  fileName: string
  fileSize: number
  mimeType: string
  /** Real-Debrid's direct link — range requests, instant seeking. */
  directUrl: string
  /** Real-Debrid's own HLS transcode: always H.264 video + AAC audio. */
  hls: string | null
  media: DebridMediaSummary | null
}

export type DebridPlayback =
  | DebridReadyPlayback
  | {
      status: 'downloading'
      torrentId: string
      /** 0-100 */
      progress: number
      /** Bytes/second */
      speed: number
      seeders: number
      debridStatus: DebridTorrentStatus
    }
  | { status: 'failed'; torrentId: string; debridStatus: DebridTorrentStatus; reason: string }
  | { status: 'not-cached' }

/** A searchable release, from Torrentio or apibay. */
export interface DebridRelease {
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
  /** True when Real-Debrid is known to have it cached (instant playback) */
  cached: boolean
  /** File Torrentio matched inside the torrent */
  file_name?: string
  file_idx?: number
}

// ---------------------------------------------------------------------------
// API helpers
// ---------------------------------------------------------------------------

function authHeaders(token?: string): HeadersInit {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' }
  if (token) headers['Authorization'] = `Bearer ${token}`
  return headers
}

/** A failed backend call, carrying the HTTP status and the backend's machine-readable `code` when it sent one. */
export class DebridRequestError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code?: string
  ) {
    super(message)
    this.name = 'DebridRequestError'
  }
}

async function handleResponse<T>(res: Response): Promise<T> {
  if (!res.ok) {
    const body = (await res.json().catch(() => ({ error: res.statusText }))) as { error?: string; code?: string }
    throw new DebridRequestError(body?.error || `Request failed: ${res.status}`, res.status, body?.code)
  }
  if (res.status === 204) return undefined as T
  return res.json() as Promise<T>
}

// ---------------------------------------------------------------------------
// Public functions
// ---------------------------------------------------------------------------

/** Whether Real-Debrid is reachable and the shared account premium (no auth required). */
export async function fetchDebridStatus(): Promise<DebridAccountStatus> {
  return handleResponse(await fetch(`${API_BASE}/debrid/status`))
}

/** Torrents in the shared Real-Debrid account, newest first. */
export async function fetchDebridTorrents(token?: string, limit = 100): Promise<DebridTorrent[]> {
  const res = await fetch(`${API_BASE}/debrid/torrents?limit=${limit}`, { headers: authHeaders(token) })
  return (await handleResponse<{ data: DebridTorrent[] }>(res)).data ?? []
}

/** One torrent with its file list. */
export async function fetchDebridTorrent(torrentId: string, token?: string): Promise<DebridTorrentInfo> {
  const res = await fetch(`${API_BASE}/debrid/torrents/${encodeURIComponent(torrentId)}`, {
    headers: authHeaders(token),
  })
  return (await handleResponse<{ data: DebridTorrentInfo }>(res)).data
}

export interface PlayReleaseOptions {
  season?: number
  episode?: number
  /** Give up (and remove the torrent again) when Real-Debrid doesn't have it cached. */
  instantOnly?: boolean
}

/**
 * Get a release ready to play: the backend reuses it from the account or
 * adds it, selects its video files, and — once Real-Debrid has it — returns
 * the direct + HLS links. A release that isn't cached comes back
 * `downloading`; poll it with `pollDebridPlayback`.
 */
export async function playDebridRelease(
  release: Pick<DebridRelease, 'info_hash' | 'name' | 'file_name' | 'file_idx'>,
  token?: string,
  opts: PlayReleaseOptions = {}
): Promise<DebridPlayback> {
  const res = await fetch(`${API_BASE}/debrid/play`, {
    method: 'POST',
    headers: authHeaders(token),
    body: JSON.stringify({
      hash: release.info_hash,
      name: release.name,
      fileName: release.file_name,
      fileIdx: release.file_idx,
      season: opts.season,
      episode: opts.episode,
      instantOnly: opts.instantOnly,
    }),
  })
  return handleResponse(res)
}

/** Check on a release that was still downloading. */
export async function pollDebridPlayback(
  torrentId: string,
  release: Pick<DebridRelease, 'file_name' | 'file_idx'>,
  token?: string,
  opts: { season?: number; episode?: number } = {}
): Promise<DebridPlayback> {
  const params = new URLSearchParams()
  if (release.file_name) params.set('fileName', release.file_name)
  if (release.file_idx != null) params.set('fileIdx', String(release.file_idx))
  if (opts.season != null) params.set('season', String(opts.season))
  if (opts.episode != null) params.set('episode', String(opts.episode))
  const res = await fetch(`${API_BASE}/debrid/play/${encodeURIComponent(torrentId)}?${params}`, {
    headers: authHeaders(token),
  })
  return handleResponse(res)
}

/** Links for one file of a torrent already in the account (Cloud library). */
export async function getDebridFileStreams(torrentId: string, fileId: number, token?: string): Promise<DebridPlayback> {
  const res = await fetch(
    `${API_BASE}/debrid/torrents/${encodeURIComponent(torrentId)}/files/${fileId}/stream`,
    { headers: authHeaders(token) }
  )
  return handleResponse(res)
}

/**
 * Free-text search (apibay). Real-Debrid has no cache-check endpoint, so
 * every result comes back `cached: false` — playing one finds out.
 *
 * @param opts.cat - apibay category: 0=all, 207=HD, 208=TV
 */
export async function searchDebrid(
  query: string,
  token?: string,
  opts: { limit?: number; cat?: number } = {}
): Promise<DebridRelease[]> {
  const params = new URLSearchParams({ q: query })
  if (opts.limit) params.set('limit', String(opts.limit))
  if (opts.cat !== undefined) params.set('cat', String(opts.cat))
  const res = await fetch(`${API_BASE}/debrid/search?${params}`, { headers: authHeaders(token) })
  return (await handleResponse<{ data: DebridRelease[] }>(res)).data ?? []
}

/**
 * Search for a specific movie/episode by IMDb id (+ season/episode for TV)
 * via Torrentio, which also reports Real-Debrid cache status, plus apibay
 * for movies.
 *
 * @param title  - Title, used as the apibay fallback query (movies only)
 * @param imdbId - IMDb id, e.g. "tt1375666" — omit to skip Torrentio entirely
 */
export async function searchDebridMedia(
  title: string,
  imdbId: string | undefined,
  mediaType: 'movie' | 'tv',
  token?: string,
  opts: { season?: number; episode?: number; limit?: number } = {}
): Promise<DebridRelease[]> {
  const params = new URLSearchParams({ title, type: mediaType })
  if (imdbId) params.set('imdb', imdbId)
  if (opts.season != null) params.set('season', String(opts.season))
  if (opts.episode != null) params.set('episode', String(opts.episode))
  if (opts.limit) params.set('limit', String(opts.limit))
  const res = await fetch(`${API_BASE}/debrid/media-search?${params}`, { headers: authHeaders(token) })
  return (await handleResponse<{ data: DebridRelease[] }>(res)).data ?? []
}

// ---------------------------------------------------------------------------
// Formatting / parsing helpers
// ---------------------------------------------------------------------------

/** Format bytes into a human-readable size string. */
export function formatBytes(bytes: number): string {
  if (!bytes || bytes <= 0) return '0 B'
  const k = 1024
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB']
  const i = Math.min(Math.floor(Math.log(bytes) / Math.log(k)), sizes.length - 1)
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(2))} ${sizes[i]}`
}

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

/** True when the release name declares an IMAX (theatrical or "Enhanced") cut. */
export function isImaxRelease(name: string): boolean {
  return /\bIMAX\b/i.test(name)
}

/**
 * True when the release name marks it as non-English-only (a foreign dub tag
 * or a non-Latin-script title) with no sign of an English track alongside.
 * Mirrors `isLikelyNonEnglishRelease` in backend/src/lib/debrid.ts — keep
 * both in sync.
 */
export function isLikelyNonEnglishRelease(name: string): boolean {
  if (/\b(ENG|English|MULTi|Dual)\b/i.test(name)) return false
  return (
    // Greek/Cyrillic/Arabic/Indic/.../CJK letters; punctuation and emoji fall outside.
    /[\u0370-\u1FFF\u3000-\uFFEF]/u.test(name) ||
    /\b(ITA|iTALiAN|FRENCH|TRUEFRENCH|VFF|VFQ|VF2|GERMAN|SPANISH|ESP|Castellano|Latino|RUS|UKR|POL|Hindi|Tamil|Telugu|Dubbed|KOR|JAP)\b/i.test(name)
  )
}

/** File name without its folder path. */
export function fileBaseName(path: string): string {
  return path.split('/').filter(Boolean).pop() ?? path
}

export function isVideoPath(path: string): boolean {
  return /\.(mkv|mp4|m4v|avi|mov|wmv|webm|ts|m2ts|mpg|mpeg)$/i.test(path)
}

/** Map a Real-Debrid torrent status to a user-friendly label + colour class. */
export function debridStatusLabel(status: DebridTorrentStatus): {
  label: string
  colorClass: string
} {
  switch (status) {
    case 'downloaded':
      return { label: 'Ready ⚡', colorClass: 'text-emerald-400' }
    case 'downloading':
    case 'compressing':
    case 'uploading':
      return { label: 'Downloading', colorClass: 'text-sky-400' }
    case 'queued':
    case 'magnet_conversion':
    case 'waiting_files_selection':
      return { label: 'Queued', colorClass: 'text-amber-400' }
    case 'magnet_error':
    case 'error':
    case 'virus':
    case 'dead':
      return { label: 'Failed', colorClass: 'text-destructive' }
    default:
      return { label: status, colorClass: 'text-muted-foreground' }
  }
}
