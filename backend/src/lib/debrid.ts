/**
 * Real-Debrid API wrapper
 *
 * Thin, typed wrapper around the Real-Debrid REST API.
 * Base URL: https://api.real-debrid.com/rest/1.0
 *
 * Every request carries `Authorization: Bearer <DEBRID_API_KEY>` — the key
 * never leaves the backend (Torrentio is the one deliberate exception, see
 * torrentio.ts).
 *
 * Division of labour: this backend only makes small JSON calls (add a magnet,
 * pick its files, unrestrict a link, read media info). The video itself never
 * passes through us — the browser plays Real-Debrid's direct download link,
 * or Real-Debrid's own HLS transcode when the file's audio/video can't be
 * decoded natively. That keeps the server's bandwidth and CPU flat no matter
 * how many people are watching.
 *
 * Playback flow for one release (see preparePlayback):
 *   addMagnet → selectFiles (video files) → torrents/info
 *     status "downloaded" (instant when cached) → unrestrict/link
 *     → streaming/mediaInfos + streaming/transcode
 *   anything else → report download progress; the player polls.
 */

import { searchTorrentio, torrentioTorrentCandidates, type TorrentioTorrentCandidate } from './torrentio'
import * as cache from '../services/cache'
import { logger } from './logger'

const DEBRID_BASE = 'https://api.real-debrid.com/rest/1.0'

function debridKey(): string | undefined {
  return process.env.DEBRID_API_KEY
}

// ---------------------------------------------------------------------------
// Response types
// ---------------------------------------------------------------------------

/** Real-Debrid torrent status values. */
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
  /** Size of the selected files, bytes */
  bytes: number
  host: string
  split: number
  /** 0-100 */
  progress: number
  status: DebridTorrentStatus
  added: string
  links: string[]
  ended?: string
  /** Bytes/second, only while downloading */
  speed?: number
  /** Only while downloading */
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
  original_filename: string
  original_bytes: number
  files: DebridTorrentFile[]
}

interface DebridUnrestricted {
  id: string
  filename: string
  mimeType: string
  filesize: number
  link: string
  host: string
  download: string
  streamable: number
}

interface DebridMediaTrack {
  stream: string
  lang: string
  lang_iso: string
  codec?: string
  channels?: number
  type?: string
}

interface DebridMediaInfos {
  filename: string
  duration: number
  details: {
    video?: Record<string, DebridMediaTrack & { width?: number; height?: number }>
    audio?: Record<string, DebridMediaTrack>
    subtitles?: Record<string, DebridMediaTrack>
  }
  /** e.g. https://4.stream.real-debrid.com/t/<id>/{audio}/{subtitles}/{audioCodec}/{quality}.{format} */
  modelUrl?: string
}

type DebridTranscodeLinks = Partial<Record<'apple' | 'dash' | 'liveMP4' | 'h264WebM', Record<string, string>>>

interface DebridUser {
  username: string
  type: 'premium' | 'free'
  expiration: string | null
}

/** A failed Real-Debrid call, carrying the HTTP status and RD's own error code. */
export class DebridError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code?: number
  ) {
    super(message)
    this.name = 'DebridError'
  }
}

// ---------------------------------------------------------------------------
// Internal fetch helper
// ---------------------------------------------------------------------------

async function debridFetch<T>(
  path: string,
  options: { method?: 'GET' | 'POST' | 'DELETE'; form?: Record<string, string> } = {}
): Promise<T> {
  const key = debridKey()
  if (!key) {
    throw new Error('DEBRID_API_KEY is not configured in the environment')
  }

  const res = await fetch(`${DEBRID_BASE}${path}`, {
    method: options.method ?? (options.form ? 'POST' : 'GET'),
    headers: { Authorization: `Bearer ${key}` },
    body: options.form ? new URLSearchParams(options.form) : undefined,
    signal: AbortSignal.timeout(20_000),
  })

  if (!res.ok) {
    const body = (await res.json().catch(() => null)) as { error?: string; error_code?: number } | null
    throw new DebridError(
      `Real-Debrid API error ${res.status}: ${body?.error ?? res.statusText}`,
      res.status,
      body?.error_code
    )
  }

  if (res.status === 204) return null as T
  const text = await res.text()
  return (text ? JSON.parse(text) : null) as T
}

// ---------------------------------------------------------------------------
// Account + library
// ---------------------------------------------------------------------------

export interface DebridAccountStatus {
  connected: boolean
  premium: boolean
  expiration: string | null
  note: string | null
}

/** Whether Real-Debrid is reachable, the key valid, and the account premium. */
export async function getAccountStatus(): Promise<DebridAccountStatus> {
  const user = await debridFetch<DebridUser>('/user')
  const premium = user.type === 'premium'
  return {
    connected: true,
    premium,
    expiration: user.expiration,
    note: premium ? null : 'Real-Debrid account is not premium',
  }
}

/** Torrents in the account, newest first. */
export async function listTorrents(limit = 100): Promise<DebridTorrent[]> {
  const list = await debridFetch<DebridTorrent[] | null>(`/torrents?limit=${Math.min(Math.max(limit, 1), 2500)}`)
  return list ?? []
}

/** One torrent with its file list and live download state. */
export async function getTorrentInfo(torrentId: string): Promise<DebridTorrentInfo> {
  return debridFetch<DebridTorrentInfo>(`/torrents/info/${encodeURIComponent(torrentId)}`)
}

export async function deleteTorrent(torrentId: string): Promise<void> {
  await debridFetch<null>(`/torrents/delete/${encodeURIComponent(torrentId)}`, { method: 'DELETE' })
}

/** Add a torrent by info-hash. Returns Real-Debrid's torrent id. */
export async function addMagnet(hash: string, name?: string): Promise<string> {
  const magnet = `magnet:?xt=urn:btih:${hash.toLowerCase()}${name ? `&dn=${encodeURIComponent(name)}` : ''}`
  const res = await debridFetch<{ id: string }>('/torrents/addMagnet', { form: { magnet } })
  invalidateTorrentLookup()
  return res.id
}

const DEAD_STATUSES = new Set<DebridTorrentStatus>(['magnet_error', 'error', 'virus', 'dead'])

/**
 * Short-lived snapshot of the library, so starting playback (and the
 * "already in the account?" check that comes with it) doesn't list the whole
 * account on every click.
 */
let torrentLookup: { at: number; list: Promise<DebridTorrent[]> } | null = null
const TORRENT_LOOKUP_TTL_MS = 30_000

function invalidateTorrentLookup(): void {
  torrentLookup = null
}

/** An existing, healthy torrent in the account for this info-hash — reused instead of adding a duplicate. */
export async function findTorrentByHash(hash: string): Promise<DebridTorrent | null> {
  if (!torrentLookup || Date.now() - torrentLookup.at > TORRENT_LOOKUP_TTL_MS) {
    const list = listTorrents(500)
    torrentLookup = { at: Date.now(), list }
    list.catch(() => invalidateTorrentLookup())
  }
  const list = await torrentLookup.list
  const wanted = hash.toLowerCase()
  return list.find((t) => t.hash.toLowerCase() === wanted && !DEAD_STATUSES.has(t.status)) ?? null
}

// ---------------------------------------------------------------------------
// File selection
// ---------------------------------------------------------------------------

const VIDEO_EXT_RE = /\.(mkv|mp4|m4v|avi|mov|wmv|webm|ts|m2ts|mpg|mpeg)$/i

function isSampleFile(path: string): boolean {
  return /(^|[/\\._\-\s])sample([/\\._\-\s]|$)/i.test(path)
}

/**
 * The files to select when a torrent is first added: every video file except
 * samples. Real-Debrid's cache is per file-set, and video-only is the set
 * Torrentio resolves with — which is what its "[RD+]" tag means — so picking
 * a single file could turn an instant torrent into a download. Selecting the
 * whole set also lets one season-pack torrent serve every episode.
 */
export function filesToSelect(files: DebridTorrentFile[]): number[] {
  const videos = files.filter((f) => VIDEO_EXT_RE.test(f.path))
  const nonSample = videos.filter((f) => !isSampleFile(f.path))
  const pool = nonSample.length ? nonSample : videos
  return pool.map((f) => f.id)
}

/**
 * The file to play out of a torrent's selected files: the one Torrentio
 * matched (by name, then index), else the right episode for TV, else the
 * largest video.
 */
export function pickPlaybackFile(
  files: DebridTorrentFile[],
  opts: { fileName?: string; fileIdx?: number; season?: number; episode?: number } = {}
): DebridTorrentFile | null {
  const videos = files.filter((f) => VIDEO_EXT_RE.test(f.path) && !isSampleFile(f.path))
  const pool = videos.length ? videos : files
  if (pool.length === 0) return null
  if (pool.length === 1) return pool[0]

  if (opts.fileName) {
    const wanted = opts.fileName.toLowerCase()
    const byName = pool.find((f) => f.path.toLowerCase().endsWith(`/${wanted}`) || f.path.toLowerCase() === wanted)
    if (byName) return byName
  }

  if (opts.season != null && opts.episode != null) {
    const episodeFile = findEpisodeFile(pool, opts.season, opts.episode)
    if (episodeFile) return episodeFile
  } else if (opts.fileIdx != null) {
    // Torrentio's index is 0-based in torrent order; Real-Debrid ids are 1-based in the same order.
    const byIdx = pool.find((f) => f.id === opts.fileIdx! + 1)
    if (byIdx) return byIdx
  }

  return [...pool].sort((a, b) => b.bytes - a.bytes)[0]
}

/** The file for one episode inside a season pack, or null when nothing matches. */
export function findEpisodeFile(files: DebridTorrentFile[], season: number, episode: number): DebridTorrentFile | null {
  const basename = (f: DebridTorrentFile) => f.path.split('/').pop() ?? f.path
  const patterns = [
    new RegExp(`s0*${season}[._\\s-]*ep?0*${episode}(?!\\d)`, 'i'), // S05E03, S5.E3, S05 E03, S01.EP03
    new RegExp(`\\b${season}x0*${episode}(?!\\d)`, 'i'), // 5x03
    new RegExp(`\\bep?0*${episode}(?!\\d)`, 'i'), // per-season torrent named just "E03" / "EP03"
  ]
  for (const pattern of patterns) {
    const match = files.find((f) => pattern.test(basename(f)))
    if (match) return match
  }
  // A bare episode number as its own word, e.g. "03 - Title.mkv" (4-digit years stripped first).
  const bareNumber = new RegExp(`(?:^|[^\\d])0*${episode}(?:[^\\d]|$)`)
  return files.find((f) => bareNumber.test(basename(f).replace(/\d{4}/g, ''))) ?? null
}

// ---------------------------------------------------------------------------
// Playback
// ---------------------------------------------------------------------------

export interface DebridAudioTrack {
  /** Real-Debrid's track key, e.g. "eng1" — the {audio} slot of the transcode URL. */
  id: string
  lang: string
  langIso: string
  codec: string | null
  channels: number | null
}

export interface DebridMediaSummary {
  videoCodec: string | null
  /** In file order — the first one is what a direct (non-transcoded) stream plays. */
  audioTracks: DebridAudioTrack[]
  /** The track the HLS links below carry (preferred language, else the first). */
  selectedAudio: string | null
  duration: number | null
}

export type PlaybackResult =
  | {
      /** `instantOnly` was set and the release wasn't cached after all; the torrent was removed again. */
      status: 'not-cached'
    }
  | {
      status: 'downloading'
      torrentId: string
      /** 0-100 */
      progress: number
      speed: number
      seeders: number
      debridStatus: DebridTorrentStatus
    }
  | {
      status: 'failed'
      torrentId: string
      debridStatus: DebridTorrentStatus
      reason: string
    }
  | {
      status: 'ready'
      torrentId: string
      fileId: number
      fileName: string
      fileSize: number
      mimeType: string
      /** Real-Debrid's direct link — supports range requests, so the browser can seek freely. */
      directUrl: string
      /**
       * Real-Debrid's own HLS transcode of the preferred-language audio track:
       * always H.264 + AAC, whatever the source codecs. Null when Real-Debrid
       * couldn't produce one (non-video file, etc.).
       */
      hls: string | null
      media: DebridMediaSummary | null
    }

const PREFERRED_AUDIO_LANGUAGES = (process.env.DEBRID_PREFERRED_AUDIO_LANGS || 'eng,en')
  .split(',')
  .map((l) => l.trim().toLowerCase())
  .filter(Boolean)

function summarizeMedia(info: DebridMediaInfos): DebridMediaSummary {
  const video = Object.values(info.details?.video ?? {})[0]
  const audioTracks: DebridAudioTrack[] = Object.entries(info.details?.audio ?? {})
    .map(([id, t]) => ({
      id,
      lang: t.lang,
      langIso: (t.lang_iso || '').toLowerCase(),
      codec: t.codec ?? null,
      channels: typeof t.channels === 'number' ? t.channels : null,
      order: parseInt((t.stream || '').split(':')[1] ?? '', 10),
    }))
    .sort((a, b) => (Number.isFinite(a.order) && Number.isFinite(b.order) ? a.order - b.order : 0))
    .map(({ order: _order, ...track }) => track)

  const preferred =
    PREFERRED_AUDIO_LANGUAGES.map((lang) => audioTracks.find((t) => t.langIso === lang)).find(Boolean) ??
    audioTracks[0]

  return {
    videoCodec: video?.codec ?? null,
    audioTracks,
    selectedAudio: preferred?.id ?? null,
    duration: Number.isFinite(info.duration) ? info.duration : null,
  }
}

/** Fill Real-Debrid's transcode URL template. */
function transcodeUrl(modelUrl: string, audio: string, quality: string): string {
  return modelUrl
    .replace('{audio}', encodeURIComponent(audio))
    .replace('{subtitles}', 'none')
    .replace('{audioCodec}', 'aac')
    .replace('{quality}', quality)
    .replace('{format}', 'm3u8')
}

/**
 * Only the "full" rendition is offered. The 1080p one ("1080p_8mbps") lives in
 * the same directory, so its playlist names the very same segment URLs — and
 * those came back byte-identical (both H.264, measured 2026-10-05 on an HEVC
 * source). As a fallback it could only fail the same way a second time.
 */
const TRANSCODE_QUALITY = 'full'

/**
 * Resolve the streams for one ready file. Media info and the transcode links
 * are best-effort: when they fail the direct link still plays wherever the
 * browser can decode the file.
 */
async function resolveStreams(link: string): Promise<Omit<Extract<PlaybackResult, { status: 'ready' }>, 'status' | 'torrentId' | 'fileId'>> {
  const unrestricted = await debridFetch<DebridUnrestricted>('/unrestrict/link', { form: { link } })
  // /unrestrict returns the download id with a 3-digit host suffix
  // ("5GTUPMTIYFBQU128"); the /streaming endpoints only accept the bare
  // 13-character id and answer "{id} is invalid" otherwise.
  const streamingId = unrestricted.id.length > 13 ? unrestricted.id.slice(0, 13) : unrestricted.id

  let media: DebridMediaSummary | null = null
  let hls: string | null = null

  if (unrestricted.streamable === 1) {
    const [infos, links] = await Promise.all([
      debridFetch<DebridMediaInfos>(`/streaming/mediaInfos/${streamingId}`).catch((err: unknown) => {
        logger.warn('Real-Debrid mediaInfos failed', { error: err instanceof Error ? err.message : String(err) })
        return null
      }),
      debridFetch<DebridTranscodeLinks>(`/streaming/transcode/${streamingId}`).catch((err: unknown) => {
        logger.warn('Real-Debrid transcode links failed', { error: err instanceof Error ? err.message : String(err) })
        return null
      }),
    ])

    if (infos) media = summarizeMedia(infos)

    if (infos?.modelUrl && media?.selectedAudio) {
      hls = transcodeUrl(infos.modelUrl, media.selectedAudio, TRANSCODE_QUALITY)
    } else if (links?.apple?.original) {
      hls = links.apple.original
    }
  }

  return {
    fileName: unrestricted.filename,
    fileSize: unrestricted.filesize,
    mimeType: unrestricted.mimeType,
    directUrl: unrestricted.download,
    hls,
    media,
  }
}

/**
 * Get one release to a playable state. Pass `hash` the first time (the
 * torrent is reused from the account when already there, otherwise added),
 * then `torrentId` on every poll while it downloads.
 *
 * `instantOnly` — for releases Torrentio tagged as cached: if Real-Debrid
 * starts downloading instead (the tag was stale), the torrent this call added
 * is deleted again and `not-cached` returned, so the player can move on to
 * the next release without leaving a download running in the account.
 */
export async function preparePlayback(params: {
  hash?: string
  torrentId?: string
  name?: string
  fileName?: string
  fileIdx?: number
  season?: number
  episode?: number
  instantOnly?: boolean
}): Promise<PlaybackResult> {
  let torrentId = params.torrentId
  let addedHere = false
  if (!torrentId) {
    if (!params.hash) throw new Error('hash or torrentId is required')
    const existing = await findTorrentByHash(params.hash).catch(() => null)
    if (existing) {
      torrentId = existing.id
    } else {
      torrentId = await addMagnet(params.hash, params.name)
      addedHere = true
    }
  }

  let info = await getTorrentInfo(torrentId)

  if (info.status === 'waiting_files_selection') {
    const ids = filesToSelect(info.files)
    await debridFetch<null>(`/torrents/selectFiles/${encodeURIComponent(torrentId)}`, {
      form: { files: ids.length ? ids.join(',') : 'all' },
    })
    info = await getTorrentInfo(torrentId)
  }

  if (params.instantOnly && addedHere && info.status !== 'downloaded') {
    await deleteTorrent(torrentId).catch((err: unknown) => {
      logger.warn('Could not remove non-instant torrent', { torrentId, error: err instanceof Error ? err.message : String(err) })
    })
    invalidateTorrentLookup()
    return { status: 'not-cached' }
  }

  if (DEAD_STATUSES.has(info.status)) {
    return { status: 'failed', torrentId, debridStatus: info.status, reason: `Real-Debrid reported "${info.status}"` }
  }

  if (info.status !== 'downloaded') {
    return {
      status: 'downloading',
      torrentId,
      progress: info.progress ?? 0,
      speed: info.speed ?? 0,
      seeders: info.seeders ?? 0,
      debridStatus: info.status,
    }
  }

  // `links` lines up one-to-one with the selected files, in file order.
  const selected = info.files.filter((f) => f.selected === 1).sort((a, b) => a.id - b.id)
  const file = pickPlaybackFile(selected, params)
  const linkIndex = file ? selected.indexOf(file) : -1
  const link =
    linkIndex >= 0 && selected.length === info.links.length ? info.links[linkIndex] : info.links.length === 1 ? info.links[0] : null

  if (!file || !link) {
    return { status: 'failed', torrentId, debridStatus: info.status, reason: 'No playable video file in this release' }
  }

  const streams = await resolveStreams(link)
  return { status: 'ready', torrentId, fileId: file.id, ...streams }
}

/** Resolve a direct link for any selected file of a downloaded torrent (Cloud library). */
export async function fileStreams(torrentId: string, fileId: number): Promise<PlaybackResult> {
  const info = await getTorrentInfo(torrentId)
  if (info.status !== 'downloaded') {
    return {
      status: 'downloading',
      torrentId,
      progress: info.progress ?? 0,
      speed: info.speed ?? 0,
      seeders: info.seeders ?? 0,
      debridStatus: info.status,
    }
  }
  const selected = info.files.filter((f) => f.selected === 1).sort((a, b) => a.id - b.id)
  const index = selected.findIndex((f) => f.id === fileId)
  const link = index >= 0 && selected.length === info.links.length ? info.links[index] : null
  if (!link) {
    return { status: 'failed', torrentId, debridStatus: info.status, reason: 'That file is not available' }
  }
  const streams = await resolveStreams(link)
  return { status: 'ready', torrentId, fileId, ...streams }
}

// ---------------------------------------------------------------------------
// Release search
// ---------------------------------------------------------------------------

/** A single searchable release, from Torrentio or apibay. */
export interface DebridRelease {
  /** Stable id (info-hash for Torrentio, apibay row id otherwise) */
  id: string
  name: string
  /** Info-hash (uppercase hex) */
  info_hash: string
  seeders: string
  leechers: string
  size: string
  num_files: string
  /** Source index: "torrentio" or the apibay uploader */
  username: string
  added: string
  category: string
  /** IMDB ID if available e.g. "tt1375666" */
  imdb?: string
  /** True when Real-Debrid is known to have this release cached (instant playback) */
  cached: boolean
  /** File Torrentio matched inside the torrent — helps pick the right file of a pack */
  file_name?: string
  file_idx?: number
}

const APIBAY_BASE = 'https://apibay.org'

/** apibay.org raw result shape */
interface ApibayResult {
  id: string
  name: string
  info_hash: string
  leechers: string
  seeders: string
  num_files: string
  size: string
  username: string
  added: string
  status: string
  category: string
  imdb: string
}

/**
 * Fetch raw torrent index results from apibay.org (Pirate Bay mirror).
 *
 * @param poolSize - Max raw results to return. Callers that post-filter
 *                   should pass a pool larger than their final count.
 * @param cat      - apibay category: 0=all, 207=HD movies, 205=movies, 208=TV
 */
async function fetchApibayResults(query: string, poolSize: number, cat: number): Promise<ApibayResult[]> {
  const apiUrl = `${APIBAY_BASE}/q.php?q=${encodeURIComponent(query)}&cat=${cat}`
  const indexRes = await fetch(apiUrl, {
    headers: { 'User-Agent': 'StreamVault/1.0' },
    signal: AbortSignal.timeout(8000),
  })

  if (!indexRes.ok) {
    throw new Error(`apibay search failed: ${indexRes.status}`)
  }

  const raw = (await indexRes.json()) as ApibayResult[]

  // apibay returns [{"id":"0","name":"No results returned"}] when empty
  const results = Array.isArray(raw)
    ? raw.filter((r) => r.id !== '0' && r.info_hash && r.info_hash.length === 40)
    : []

  return results.slice(0, poolSize)
}

/**
 * Free-text torrent search via apibay.org. Real-Debrid no longer exposes a
 * cache check, so these come back with `cached: false` — "Play" in the UI
 * finds out by adding the release (instant when it was cached after all).
 */
export async function searchTorrents(query: string, limit = 20, cat = 0): Promise<DebridRelease[]> {
  const results = await fetchApibayResults(query, limit, cat)
  return results.map((r) => ({
    id: r.id,
    name: r.name,
    info_hash: r.info_hash.toUpperCase(),
    seeders: r.seeders,
    leechers: r.leechers,
    size: r.size,
    num_files: r.num_files,
    username: r.username,
    added: r.added,
    category: r.category,
    imdb: r.imdb || undefined,
    cached: false,
  }))
}

/**
 * Upper bound on release size for the auto-play search. Excludes 100GB+
 * IMAX/UHD remuxes while still allowing normal 4K WEB-DL/BluRay encodes
 * (typically 8-25GB) through.
 */
const MAX_RELEASE_SIZE_BYTES = 40 * 1024 * 1024 * 1024 // 40 GiB

/** Quality rank for sorting — higher is preferred. */
function releaseQualityRank(name: string): number {
  if (/\b(2160p|4K|UHD)\b/i.test(name)) return 4
  if (/\b1080p\b/i.test(name)) return 3
  if (/\b720p\b/i.test(name)) return 2
  return 1
}

/**
 * True when the release name marks it as a non-English-only release — a
 * foreign dub tag (ITA, FRENCH, RUS, ...) or a title in a non-Latin script —
 * with no sign of an English track alongside (ENG, MULTi, Dual). Mirrored in
 * src/lib/debridApi.ts.
 */
export function isLikelyNonEnglishRelease(name: string): boolean {
  if (/\b(ENG|English|MULTi|Dual)\b/i.test(name)) return false
  return (
    // Greek/Cyrillic/Arabic/Indic/.../CJK letters; punctuation and emoji fall outside.
    /[\u0370-\u1FFF\u3000-\uFFEF]/u.test(name) ||
    /\b(ITA|iTALiAN|FRENCH|TRUEFRENCH|VFF|VFQ|VF2|GERMAN|SPANISH|ESP|Castellano|Latino|RUS|UKR|POL|Hindi|Tamil|Telugu|Dubbed|KOR|JAP)\b/i.test(name)
  )
}

/** True when the release name declares an IMAX (theatrical or "Enhanced") cut. */
export function isImaxRelease(name: string): boolean {
  return /\bIMAX\b/i.test(name)
}

const SEQUEL_MARKERS: Record<string, number> = {
  '2': 2, '3': 3, '4': 4, '5': 5, '6': 6, '7': 7, '8': 8, '9': 9,
  ii: 2, iii: 3, iv: 4, v: 5, vi: 6, vii: 7, viii: 8, ix: 9, x: 10,
}
const SEQUEL_MARKER_RE = Object.keys(SEQUEL_MARKERS).join('|')

function normalizeForTitleMatch(s: string): string {
  return s.toLowerCase().replace(/['’]/g, '').replace(/[^a-z0-9]+/g, ' ').trim()
}

/**
 * True when the release is plainly a *different* entry of the same franchise
 * — "Planet Earth III" for Planet Earth II, "Toy Story 2" for Toy Story.
 * Torrentio matches by IMDb id but its indexers are fuzzy. Only a sequel
 * marker right after the title counts, so alternate titles, foreign names
 * and missing titles all still pass.
 *
 * @param title - The wanted title; a trailing year (as the player appends
 *   for movies) is ignored.
 */
export function isDifferentSequel(name: string, title: string): boolean {
  const wanted = normalizeForTitleMatch(title).replace(/\s(19|20)\d{2}$/, '')
  const titleMatch = wanted.match(new RegExp(`^(.+?)\\s(${SEQUEL_MARKER_RE})$`))
  const base = titleMatch ? titleMatch[1] : wanted
  const wantedNumber = titleMatch ? SEQUEL_MARKERS[titleMatch[2]] : 1
  if (!base) return false

  const escaped = base.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const found = normalizeForTitleMatch(name).match(
    new RegExp(`(?:^|\\s)${escaped}(?:\\s(${SEQUEL_MARKER_RE}))?(?:\\s|$)`)
  )
  if (!found) return false
  const releaseNumber = found[1] ? SEQUEL_MARKERS[found[1]] : 1
  // An unnumbered release for a numbered title ("Planet Earth S01E02" when
  // asking for II) is ambiguous rather than wrong — keep it.
  return found[1] !== undefined && releaseNumber !== wantedNumber
}

/**
 * Below this, a release claiming 2160p is a fake, a sample, or a mislabeled
 * low-bitrate encode.
 */
const MIN_4K_RELEASE_BYTES = 400 * 1024 * 1024

function isImplausibleRelease(name: string, size: number): boolean {
  return size > 0 && size < MIN_4K_RELEASE_BYTES && releaseQualityRank(name) === 4
}

// ---------------------------------------------------------------------------
// Indexer lookup caching (searchMediaReleases only)
// ---------------------------------------------------------------------------

/** apibay never returns more than 100 rows; cache the whole page and slice per request. */
const APIBAY_MAX_RESULTS = 100

/** How long a movie search waits for Torrentio (from search start) once apibay already has results. */
const MOVIE_TORRENTIO_GRACE_MS = 4000

/** How long a search waits for Torrentio when it's the only source with results (TV, obscure movies). */
const TORRENTIO_ONLY_WAIT_MS = 12_000

/**
 * Torrentio returns every release it knows (2,000+ for a popular movie).
 * Cached ones are always kept; the rest are trimmed to the best-seeded few
 * hundred.
 */
const TORRENTIO_UNCACHED_CANDIDATES_MAX = 200

const inflightIndexLookups = new Map<string, Promise<unknown[]>>()

/**
 * Serve an indexer lookup from cache, sharing one in-flight request between
 * concurrent callers for the same key. Empty results aren't cached — those
 * are as likely to be a transient indexer failure as a genuine "no releases".
 */
async function cachedIndexLookup<T>(key: string, fetcher: () => Promise<T[]>): Promise<T[]> {
  const hit = await cache.debrid.get<T[]>(key)
  if (hit) return hit

  const inflight = inflightIndexLookups.get(key) as Promise<T[]> | undefined
  if (inflight) return inflight

  const lookup = fetcher()
    .then(async (results) => {
      if (results.length > 0) await cache.debrid.set(key, results)
      return results
    })
    .finally(() => inflightIndexLookups.delete(key))

  inflightIndexLookups.set(key, lookup)
  return lookup
}

/** Resolve with `promise`'s value if it settles within `ms`, otherwise `undefined` (the promise keeps running). */
function resolveWithin<T>(promise: Promise<T>, ms: number): Promise<T | undefined> {
  return new Promise((resolve) => {
    const timer = setTimeout(() => resolve(undefined), ms)
    promise.then(
      (value) => {
        clearTimeout(timer)
        resolve(value)
      },
      () => {
        clearTimeout(timer)
        resolve(undefined)
      }
    )
  })
}

function trimTorrentioCandidates(candidates: TorrentioTorrentCandidate[]): TorrentioTorrentCandidate[] {
  const sane = candidates
    .filter((c) => c.size === 0 || c.size <= MAX_RELEASE_SIZE_BYTES)
    .sort((a, b) => b.seeders - a.seeders)
  return [
    ...sane.filter((c) => c.cached),
    ...sane.filter((c) => !c.cached).slice(0, TORRENTIO_UNCACHED_CANDIDATES_MAX),
  ]
}

/** Whether Torrentio may see the Real-Debrid key (for "[RD+]" cache tags). */
function torrentioDebridKey(): string | undefined {
  return process.env.TORRENTIO_DEBRID_CACHE === 'false' ? undefined : debridKey()
}

/**
 * Search for a specific movie/episode by TMDB-derived identity (title +
 * IMDb id, + season/episode for TV): Torrentio (many indexers, matched by
 * IMDb id, tagged with Real-Debrid cache status) and, for movies only,
 * apibay as a fallback source.
 *
 * Indexer results are cached per title/episode for an hour (see
 * cachedIndexLookup and the `debrid` cache namespace).
 */
export async function searchMediaReleases(params: {
  title: string
  imdbId?: string
  mediaType: 'movie' | 'tv'
  season?: number
  episode?: number
  limit?: number
}): Promise<DebridRelease[]> {
  const { title, imdbId, mediaType, season, episode, limit = 20 } = params
  const useApibay = mediaType === 'movie'
  const startedAt = Date.now()
  const torrentioKey = torrentioDebridKey()

  const torrentioPromise: Promise<TorrentioTorrentCandidate[]> = imdbId
    ? cachedIndexLookup(
        `torrentio:${torrentioKey ? 'rd' : 'plain'}:${mediaType}:${imdbId}:${season ?? ''}:${episode ?? ''}`,
        async () =>
          trimTorrentioCandidates(
            torrentioTorrentCandidates(
              await searchTorrentio(imdbId, mediaType === 'tv' ? 'series' : 'movie', season, episode, torrentioKey)
            )
          )
      ).catch(() => [])
    : Promise.resolve([])

  const apibayPromise: Promise<ApibayResult[]> = useApibay
    ? cachedIndexLookup(`apibay:207:${title.toLowerCase()}`, () =>
        fetchApibayResults(title, APIBAY_MAX_RESULTS, 207)
      ).catch(() => [])
    : Promise.resolve([])

  const apibayResults = (await apibayPromise).slice(0, Math.max(limit * 3, 60))

  // Torrentio is the only source that knows what's cached, so it gets a
  // generous window even when apibay already answered; a slow lookup keeps
  // running in the background and lands in the cache for the next search.
  const torrentioWaitMs =
    apibayResults.length > 0
      ? Math.max(0, MOVIE_TORRENTIO_GRACE_MS - (Date.now() - startedAt))
      : TORRENTIO_ONLY_WAIT_MS
  const torrentioCandidates = (await resolveWithin(torrentioPromise, torrentioWaitMs)) ?? []

  const merged = new Map<string, DebridRelease>()

  for (const c of torrentioCandidates) {
    merged.set(c.infoHash, {
      id: c.infoHash,
      name: c.name,
      info_hash: c.infoHash,
      seeders: String(c.seeders),
      leechers: '0',
      size: String(c.size),
      num_files: '1',
      username: 'torrentio',
      added: '0',
      category: mediaType === 'tv' ? '208' : '207',
      imdb: imdbId,
      cached: c.cached,
      file_name: c.fileName,
      file_idx: c.fileIdx,
    })
  }

  for (const r of apibayResults) {
    const hash = r.info_hash.toUpperCase()
    if (merged.has(hash)) continue
    merged.set(hash, {
      id: hash,
      name: r.name,
      info_hash: hash,
      seeders: r.seeders,
      leechers: r.leechers,
      size: r.size,
      num_files: r.num_files,
      username: 'apibay',
      added: r.added,
      category: '207',
      imdb: imdbId,
      cached: false,
    })
  }

  // Drop oversized releases, wrong-sequel matches and implausibly small "4K"
  // files outright. Unknown sizes (0) are kept.
  const candidates = [...merged.values()].filter((c) => {
    const size = parseInt(c.size, 10) || 0
    return (
      (size === 0 || size <= MAX_RELEASE_SIZE_BYTES) &&
      !isImplausibleRelease(c.name, size) &&
      !isDifferentSequel(c.name, title)
    )
  })

  return selectBalancedReleases(candidates, limit)
}

/** Min share of the returned list reserved for each of the 4K and 1080p tiers (when they have that many releases). */
const RESERVED_TIER_SHARE = 0.4

/**
 * Order releases best-first and cut them to `limit` without letting one
 * quality tier crowd out the others — a popular title with 15+ 4K releases
 * used to return nothing but 4K, leaving no 1080p fallback for browsers that
 * can't decode 10-bit HEVC.
 *
 * Within a tier: cached first (instant playback), then releases likely to
 * have English audio, then the IMAX cut, then seeders.
 */
export function selectBalancedReleases(releases: DebridRelease[], limit: number): DebridRelease[] {
  const withinTier = (a: DebridRelease, b: DebridRelease) => {
    if (a.cached !== b.cached) return b.cached ? 1 : -1
    const langDiff = Number(isLikelyNonEnglishRelease(a.name)) - Number(isLikelyNonEnglishRelease(b.name))
    if (langDiff !== 0) return langDiff
    const imaxDiff = Number(isImaxRelease(b.name)) - Number(isImaxRelease(a.name))
    if (imaxDiff !== 0) return imaxDiff
    return (parseInt(b.seeders, 10) || 0) - (parseInt(a.seeders, 10) || 0)
  }
  const byQuality = (a: DebridRelease, b: DebridRelease) =>
    releaseQualityRank(b.name) - releaseQualityRank(a.name) || withinTier(a, b)

  const reserved = Math.ceil(limit * RESERVED_TIER_SHARE)
  const picked = new Set<DebridRelease>()
  for (const rank of [4, 3]) {
    releases
      .filter((r) => releaseQualityRank(r.name) === rank)
      .sort(withinTier)
      .slice(0, reserved)
      .forEach((r) => picked.add(r))
  }
  for (const r of [...releases].sort(byQuality)) {
    if (picked.size >= limit) break
    picked.add(r)
  }

  return [...picked].sort(byQuality).slice(0, limit)
}
