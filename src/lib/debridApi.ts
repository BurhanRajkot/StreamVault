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

/** Real-Debrid's own status for a torrent in the account. */
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
  /** The download's full id, which Real-Debrid's regional servers accept (see lib/debridHost). Missing from an older backend. */
  downloadId?: string
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
  /**
   * The torrent holds several of what's wanted (an F1 race weekend): the file
   * is picked out of it, and its size isn't the size of what plays.
   */
  pack?: boolean
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

/**
 * The request never reached the backend — offline, or the connection dropped
 * on the way — as opposed to the backend answering no. `fetch` rejects with
 * a TypeError for exactly that.
 */
export function isNetworkFailure(err: unknown): boolean {
  return err instanceof TypeError
}

/** Waits before asking again after a request that didn't get through. */
const NETWORK_RETRY_DELAYS_MS = [800, 2500]

/**
 * `fetch`, asked again when the request doesn't get through: on a weak
 * connection one lost request shouldn't end a play that the next one would
 * have started. Only for requests that are safe to repeat — the backend
 * reuses a release it has already added.
 */
async function fetchWithRetry(input: string, init?: RequestInit): Promise<Response> {
  for (let attempt = 0; ; attempt++) {
    try {
      return await fetch(input, init)
    } catch (err: unknown) {
      const offline = typeof navigator !== 'undefined' && navigator.onLine === false
      if (!isNetworkFailure(err) || offline || attempt >= NETWORK_RETRY_DELAYS_MS.length || init?.signal?.aborted) throw err
      await new Promise((resolve) => setTimeout(resolve, NETWORK_RETRY_DELAYS_MS[attempt]))
    }
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

/** Whether the Real-Debrid account is connected and premium, and until when (admin only). */
export async function fetchDebridStatus(token?: string): Promise<DebridAccountStatus> {
  return handleResponse(await fetch(`${API_BASE}/debrid/status`, { headers: authHeaders(token) }))
}

export interface PlayReleaseOptions {
  season?: number
  episode?: number
  /** An F1 session: the file to play out of a torrent holding the whole race weekend. */
  session?: string
  /** Give up (and remove the torrent again) when Real-Debrid doesn't have it cached. */
  instantOnly?: boolean
  /** The file is wanted to save (offline download), not to stream: refused unless the admin allows this account's downloads. */
  purpose?: 'download'
  /**
   * Getting it ready ahead of Play (lib/premiumWarm), not playing it yet:
   * asked of POST /debrid/warm, which is always instant-only and has its own
   * rate limit, so looking around doesn't use up the plays.
   */
  warm?: boolean
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
  const res = await fetchWithRetry(`${API_BASE}/debrid/${opts.warm ? 'warm' : 'play'}`, {
    method: 'POST',
    headers: authHeaders(token),
    body: JSON.stringify({
      hash: release.info_hash,
      name: release.name,
      fileName: release.file_name,
      fileIdx: release.file_idx,
      season: opts.season,
      episode: opts.episode,
      session: opts.session,
      instantOnly: opts.warm || opts.instantOnly,
      purpose: opts.purpose,
    }),
  })
  return handleResponse(res)
}

/** Check on a release that was still downloading. */
export async function pollDebridPlayback(
  torrentId: string,
  release: Pick<DebridRelease, 'file_name' | 'file_idx'>,
  token?: string,
  opts: { season?: number; episode?: number; session?: string } = {}
): Promise<DebridPlayback> {
  const params = new URLSearchParams()
  if (release.file_name) params.set('fileName', release.file_name)
  if (release.file_idx != null) params.set('fileIdx', String(release.file_idx))
  if (opts.season != null) params.set('season', String(opts.season))
  if (opts.episode != null) params.set('episode', String(opts.episode))
  if (opts.session) params.set('session', opts.session)
  const res = await fetchWithRetry(`${API_BASE}/debrid/play/${encodeURIComponent(torrentId)}?${params}`, {
    headers: authHeaders(token),
  })
  return handleResponse(res)
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
  opts: ReleaseSearchOptions = {}
): Promise<DebridRelease[]> {
  const params = releaseSearchParams(title, imdbId, mediaType, opts)
  const res = await fetchWithRetry(`${API_BASE}/debrid/media-search?${params}`, { headers: authHeaders(token) })
  return (await handleResponse<{ data: DebridRelease[] }>(res)).data ?? []
}

/**
 * The same search for everyone, with no Real-Debrid involved (GET /releases):
 * what the Download sheet lists as magnet links. Every release comes back
 * `cached: false` — nothing asked Real-Debrid.
 */
export async function searchReleases(
  title: string,
  imdbId: string | undefined,
  mediaType: 'movie' | 'tv',
  opts: ReleaseSearchOptions = {}
): Promise<DebridRelease[]> {
  const res = await fetch(`${API_BASE}/releases?${releaseSearchParams(title, imdbId, mediaType, opts)}`)
  return (await handleResponse<{ data: DebridRelease[] }>(res)).data ?? []
}

interface ReleaseSearchOptions {
  season?: number
  episode?: number
  limit?: number
}

function releaseSearchParams(
  title: string,
  imdbId: string | undefined,
  mediaType: 'movie' | 'tv',
  opts: ReleaseSearchOptions
): URLSearchParams {
  const params = new URLSearchParams({ title, type: mediaType })
  if (imdbId) params.set('imdb', imdbId)
  if (opts.season != null) params.set('season', String(opts.season))
  if (opts.episode != null) params.set('episode', String(opts.episode))
  if (opts.limit) params.set('limit', String(opts.limit))
  return params
}

/** One version of a language's subtitles (mirrors backend/src/lib/subtitles.ts). */
export interface SubtitleOption {
  /** OpenSubtitles file id. */
  id: string
  /** The release the subtitle was made for. */
  release: string
  /** For the deaf and hard of hearing — with sound cues like "[door slams]". */
  hearingImpaired: boolean
  /** Matched to the playing file's fingerprint: timed to this very file. */
  matched?: boolean
}

export interface SubtitleLanguage {
  /** OpenSubtitles language code, e.g. "eng", "pob". */
  code: string
  name: string
  /** Best match for the playing file first. */
  options: SubtitleOption[]
}

export interface SubtitleSearchParams {
  imdbId: string
  mediaType: 'movie' | 'tv'
  season?: number
  episode?: number
  /** The playing file — its release name and length decide which version fits best. */
  fileName?: string
  duration?: number | null
  /** Languages to search in depth besides English. */
  languages?: string[]
}

/** Subtitles for a movie or episode, by language, ranked for the playing file. */
export async function fetchSubtitles(params: SubtitleSearchParams, token?: string, signal?: AbortSignal): Promise<SubtitleLanguage[]> {
  const query = new URLSearchParams({ imdb: params.imdbId, type: params.mediaType })
  if (params.season != null) query.set('season', String(params.season))
  if (params.episode != null) query.set('episode', String(params.episode))
  if (params.fileName) query.set('fileName', params.fileName)
  if (params.duration && params.duration > 0) query.set('duration', String(Math.round(params.duration)))
  if (params.languages?.length) query.set('langs', params.languages.join(','))
  const res = await fetch(`${API_BASE}/debrid/subtitles?${query}`, { headers: authHeaders(token), signal })
  return (await handleResponse<{ languages?: SubtitleLanguage[] }>(res)).languages ?? []
}

/** One subtitle file's text (SubRip, WebVTT or SubStation Alpha). */
export async function fetchSubtitleText(id: string, token?: string, signal?: AbortSignal): Promise<string> {
  const headers: Record<string, string> = {}
  if (token) headers.Authorization = `Bearer ${token}`
  const res = await fetch(`${API_BASE}/debrid/subtitles/file/${encodeURIComponent(id)}`, { headers, signal })
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { error?: string }
    throw new DebridRequestError(body.error || `Request failed: ${res.status}`, res.status)
  }
  return res.text()
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

/**
 * Extract quality tag from torrent name. Broadcast captures (F1) add the
 * frame rate or scan to the resolution ("1080p50", "1080i") and write UHD
 * into the channel name ("SkyUHD").
 */
export function parseTorrentQuality(name: string): string {
  if (/\b(2160p|4K|UHD)\b|\b2160[pi]\d{2}\b|(?:Sky|F1)UHD\b/i.test(name)) return '4K'
  if (/\b1080[pi](?:\d{2})?\b/i.test(name)) return '1080p'
  if (/\b720p(?:\d{2})?\b/i.test(name)) return '720p'
  if (/\b480p\b/i.test(name)) return '480p'
  return 'SD'
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

