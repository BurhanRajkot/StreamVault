/**
 * TorBox API wrapper
 *
 * Thin, typed wrapper around the TorBox REST API.
 * Base URL: https://api.torbox.app/v1/api
 *
 * Every request carries `Authorization: Bearer <TORBOX_API_KEY>` — the key
 * never leaves the backend process.
 *
 * TorBox response envelope:
 *   { success: boolean, error: string | null, detail: string, data: T }
 *
 * Search strategy:
 *   TorBox does not have its own public torrent search index.
 *   We use apibay.org (official Pirate Bay API mirror) to get torrent hashes
 *   for a title query, then cross-check with TorBox's /checkcached to see
 *   which are instantly available. Cached hashes can be streamed immediately;
 *   uncached hashes are shown with an "Add to TorBox" option.
 */

import { searchComet, cometTorrentCandidates } from './comet'

const TORBOX_BASE = 'https://api.torbox.app/v1/api'
const TORBOX_KEY = process.env.TORBOX_API_KEY

// ---------------------------------------------------------------------------
// Response types
// ---------------------------------------------------------------------------

export interface TorboxEnvelope<T> {
  success: boolean
  error: string | null
  detail: string
  data: T
}

export interface TorboxFile {
  id: number
  md5: string | null
  s3_path: string
  name: string
  size: number
  mimetype: string
  short_name: string
  zipped?: boolean
  infected?: boolean
  absolute_path?: string
  opensubtitles_hash?: string | null
}

export interface TorboxTorrent {
  id: number
  hash: string
  name: string
  magnet: string | null
  size: number
  /** Bytes downloaded so far */
  downloaded: number
  /** Download progress 0-100 */
  progress: number
  /** e.g. "downloading" | "seeding" | "completed" | "stalled" | "paused" | "cached" */
  download_state: string
  /** Seeds available */
  seeds: number
  peers: number
  ratio: number
  /** Estimated seconds remaining */
  eta: number
  /** Downloads/second */
  download_speed: number
  /** Uploads/second */
  upload_speed: number
  /** Torrent files */
  files: TorboxFile[]
  created_at: string
  updated_at: string
  cached: boolean
  cached_at?: string
  auth_id: string
  owner?: string
  download_present: boolean
  download_finished: boolean
  active: boolean
  availability?: number
  allow_zipped?: boolean
  private?: boolean
  tags?: string[]
}

export interface TorboxCacheResult {
  /** The queried hash */
  hash: string
  /** Torrent name (only returned when cached) */
  name?: string
  /** File size in bytes */
  size?: number
}

/** A single result from apibay.org torrent index */
export interface TorboxSearchResult {
  /** apibay ID */
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
  /** IMDB ID if available e.g. "tt1375666" */
  imdb?: string
  /** True when TorBox has this hash cached for instant streaming */
  torbox_cached: boolean
}

export type TorboxDownloadLink = string | { url: string }

export interface TorboxUpStatus {
  connected: boolean
  note: string | null
}

interface TorboxUserInfo {
  is_subscribed: boolean
  plan: number
}

// ---------------------------------------------------------------------------
// Internal fetch helper
// ---------------------------------------------------------------------------

async function torboxFetch<T>(
  path: string,
  options: RequestInit = {}
): Promise<TorboxEnvelope<T>> {
  if (!TORBOX_KEY) {
    throw new Error('TORBOX_API_KEY is not configured in the environment')
  }

  const url = `${TORBOX_BASE}${path}`
  const headers: Record<string, string> = {
    Authorization: `Bearer ${TORBOX_KEY}`,
    ...((options.headers as Record<string, string>) || {}),
  }

  // Do not set Content-Type if body is FormData (let fetch set boundary)
  if (typeof FormData !== 'undefined' && options.body instanceof FormData) {
    delete headers['Content-Type']
  } else if (!headers['Content-Type']) {
    headers['Content-Type'] = 'application/json'
  }

  const res = await fetch(url, {
    ...options,
    headers,
  })

  if (!res.ok) {
    const text = await res.text().catch(() => res.statusText)
    throw new Error(`TorBox API error ${res.status}: ${text}`)
  }

  return res.json() as Promise<TorboxEnvelope<T>>
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Check whether TorBox is reachable and our API key is valid.
 *
 * TorBox has no dedicated health-check route, so this piggybacks on
 * `/user/me` — the cheapest authenticated call that proves both.
 */
export async function getUpStatus(): Promise<TorboxEnvelope<TorboxUpStatus>> {
  const result = await torboxFetch<TorboxUserInfo>('/user/me')
  return {
    success: result.success,
    error: result.error,
    detail: result.detail,
    data: {
      connected: result.success,
      note: result.success && !result.data?.is_subscribed
        ? 'TorBox account is not on a premium plan'
        : null,
    },
  }
}

/**
 * List all active torrents in the user's TorBox account.
 */
export async function myList(): Promise<TorboxEnvelope<TorboxTorrent[]>> {
  return torboxFetch<TorboxTorrent[]>('/torrents/mylist?bypass_cache=true')
}

/**
 * Check whether one or more torrent hashes are instantly cached on TorBox.
 * Returns the list of hashes that ARE cached (with name + size).
 *
 * @param hashes - One or more info-hashes (hex, any case), comma-joined
 */
export async function checkCachedBatch(
  hashes: string[]
): Promise<TorboxEnvelope<TorboxCacheResult[]>> {
  const joined = hashes.map((h) => h.toLowerCase()).join(',')
  return torboxFetch<TorboxCacheResult[]>(
    `/torrents/checkcached?hash=${encodeURIComponent(joined)}&format=list&list_files=false`
  )
}

/** Convenience single-hash wrapper. */
export async function checkCached(
  hash: string
): Promise<TorboxEnvelope<TorboxCacheResult[]>> {
  return checkCachedBatch([hash])
}

// ---------------------------------------------------------------------------
// Torrent index search (via apibay.org, no auth required)
// ---------------------------------------------------------------------------

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
 * Fetch raw torrent index results from apibay.org (Pirate Bay mirror) for a
 * title query — no TorBox cache check, just the index lookup.
 *
 * @param query  - Movie / TV show title (e.g. "Inception 2010")
 * @param limit  - Max results to return
 * @param cat    - apibay category: 0=all, 207=HD movies, 205=movies, 208=TV
 */
async function fetchApibayResults(
  query: string,
  limit: number,
  cat: number
): Promise<ApibayResult[]> {
  const apiUrl = `${APIBAY_BASE}/q.php?q=${encodeURIComponent(query)}&cat=${cat}`
  const indexRes = await fetch(apiUrl, {
    headers: { 'User-Agent': 'StreamVault/1.0' },
    signal: AbortSignal.timeout(8000),
  })

  if (!indexRes.ok) {
    throw new Error(`apibay search failed: ${indexRes.status}`)
  }

  const raw = await indexRes.json() as ApibayResult[]

  // apibay returns [{"id":"0","name":"No results returned"}] when empty
  const results = Array.isArray(raw)
    ? raw.filter((r) => r.id !== '0' && r.info_hash && r.info_hash.length === 40)
    : []

  return results.slice(0, limit)
}

/**
 * Search for torrents by title using apibay.org (Pirate Bay mirror)
 * then cross-check TorBox cache to tag which are instantly streamable.
 *
 * @param query  - Movie / TV show title (e.g. "Inception 2010")
 * @param limit  - Max results to return (default 20)
 * @param cat    - apibay category: 0=all, 207=HD movies, 205=movies, 208=TV (default 0)
 */
export async function searchTorrents(
  query: string,
  limit = 20,
  cat = 0
): Promise<TorboxEnvelope<TorboxSearchResult[]>> {
  const sliced = await fetchApibayResults(query, limit, cat)

  if (sliced.length === 0) {
    return { success: true, error: null, detail: 'No results found', data: [] }
  }

  // Cross-check which hashes TorBox has cached
  const hashes = sliced.map((r) => r.info_hash)
  const cachedSet = new Set<string>()

  try {
    const cacheRes = await checkCachedBatch(hashes)
    if (cacheRes.success && Array.isArray(cacheRes.data)) {
      for (const entry of cacheRes.data) {
        cachedSet.add(entry.hash.toUpperCase())
      }
    }
  } catch {
    // Cache check failure is non-fatal — results just won't show instant badges
  }

  // 3. Merge and annotate
  const annotated: TorboxSearchResult[] = sliced.map((r) => ({
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
    torbox_cached: cachedSet.has(r.info_hash.toUpperCase()),
  }))

  return {
    success: true,
    error: null,
    detail: `Found ${annotated.length} results`,
    data: annotated,
  }
}

/**
 * Search for a specific movie/episode by TMDB-derived identity (title +
 * IMDb id, + season/episode for TV) across every source we have: Comet
 * (many indexers, matched by IMDb id — reliable for TV episodes) and, for
 * movies only, apibay (title search is too unreliable for TV season packs
 * vs per-episode releases, which is why TorBox wasn't offered for TV before).
 *
 * Results from both sources are merged (de-duped by info-hash, Comet wins
 * ties since it's the more precisely-matched source), then checked against
 * TorBox's cache in a single batched call.
 */
export async function searchMediaTorrents(params: {
  title: string
  imdbId?: string
  mediaType: 'movie' | 'tv'
  season?: number
  episode?: number
  limit?: number
}): Promise<TorboxEnvelope<TorboxSearchResult[]>> {
  const { title, imdbId, mediaType, season, episode, limit = 20 } = params
  const useApibay = mediaType === 'movie'

  const [apibaySettled, cometSettled] = await Promise.allSettled([
    useApibay
      ? fetchApibayResults(title, limit, 207)
      : Promise.resolve([] as ApibayResult[]),
    imdbId
      ? searchComet(imdbId, mediaType === 'tv' ? 'series' : 'movie', season, episode)
      : Promise.resolve([]),
  ])

  const apibayResults = apibaySettled.status === 'fulfilled' ? apibaySettled.value : []
  const cometCandidates =
    cometSettled.status === 'fulfilled' ? cometTorrentCandidates(cometSettled.value) : []

  interface Candidate {
    name: string
    info_hash: string
    size: number
    seeders: number
    leechers: number
    num_files: number
    source: 'comet' | 'apibay'
  }

  const merged = new Map<string, Candidate>()

  for (const c of cometCandidates) {
    merged.set(c.infoHash, {
      name: c.name,
      info_hash: c.infoHash,
      size: c.size,
      seeders: c.seeders,
      leechers: 0,
      num_files: 1,
      source: 'comet',
    })
  }

  for (const r of apibayResults) {
    const hash = r.info_hash.toUpperCase()
    if (merged.has(hash)) continue
    merged.set(hash, {
      name: r.name,
      info_hash: hash,
      size: parseInt(r.size, 10) || 0,
      seeders: parseInt(r.seeders, 10) || 0,
      leechers: parseInt(r.leechers, 10) || 0,
      num_files: parseInt(r.num_files, 10) || 1,
      source: 'apibay',
    })
  }

  const candidates = [...merged.values()]

  if (candidates.length === 0) {
    return { success: true, error: null, detail: 'No results found', data: [] }
  }

  const cachedSet = new Set<string>()
  try {
    // Cap the batch — no point cache-checking more than we'll ever show.
    const toCheck = candidates
      .sort((a, b) => b.seeders - a.seeders)
      .slice(0, Math.max(limit * 3, 30))
    const cacheRes = await checkCachedBatch(toCheck.map((c) => c.info_hash))
    if (cacheRes.success && Array.isArray(cacheRes.data)) {
      for (const entry of cacheRes.data) cachedSet.add(entry.hash.toUpperCase())
    }
  } catch {
    // Cache check failure is non-fatal — results just won't show instant badges
  }

  const annotated: TorboxSearchResult[] = candidates.map((c) => ({
    id: c.info_hash,
    name: c.name,
    info_hash: c.info_hash,
    seeders: String(c.seeders),
    leechers: String(c.leechers),
    size: String(c.size),
    num_files: String(c.num_files),
    username: c.source,
    added: '0',
    category: mediaType === 'tv' ? '208' : '207',
    imdb: imdbId,
    torbox_cached: cachedSet.has(c.info_hash),
  }))

  annotated.sort((a, b) => {
    if (a.torbox_cached !== b.torbox_cached) return b.torbox_cached ? 1 : -1
    return parseInt(b.seeders, 10) - parseInt(a.seeders, 10)
  })

  return {
    success: true,
    error: null,
    detail: `Found ${annotated.length} results`,
    data: annotated.slice(0, limit),
  }
}

/**
 * Add a magnet link to TorBox.
 * @param magnet - Full magnet URI
 * @param name   - Optional display name override
 */
export async function createTorrent(
  magnet: string,
  name?: string
): Promise<TorboxEnvelope<{ torrent_id: number; hash: string; name: string }>> {
  const formData = new FormData()
  formData.append('magnet', magnet)
  if (name) formData.append('name', name)

  return torboxFetch('/torrents/createtorrent', {
    method: 'POST',
    body: formData,
  })
}

/**
 * Request a direct download/stream link for a file inside a torrent.
 *
 * @param torrentId - The `id` field from `myList()`
 * @param fileId    - The `id` field from `torrent.files[]` (0 = largest/first)
 * @param options.zipLink   - Return a ZIP of all files instead
 * @param options.userIp    - User IP for geo-routing (optional)
 */
export async function requestDownloadLink(
  torrentId: number,
  fileId: number,
  options: { zipLink?: boolean; userIp?: string } = {}
): Promise<TorboxEnvelope<TorboxDownloadLink>> {
  const params = new URLSearchParams({
    token: TORBOX_KEY!,
    torrent_id: String(torrentId),
    file_id: String(fileId),
  })
  if (options.zipLink) params.set('zip_link', 'true')
  if (options.userIp) params.set('user_ip', options.userIp)

  return torboxFetch<TorboxDownloadLink>(`/torrents/requestdl?${params.toString()}`)
}

/**
 * Control (pause / resume / delete) a torrent.
 */
export async function controlTorrent(
  torrentId: number,
  operation: 'pause' | 'resume' | 'delete' | 'reannounce'
): Promise<TorboxEnvelope<null>> {
  return torboxFetch('/torrents/controltorrent', {
    method: 'POST',
    body: JSON.stringify({ torrent_id: torrentId, operation }),
  })
}
