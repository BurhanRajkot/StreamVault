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

import { searchComet, cometTorrentCandidates, type CometTorrentCandidate } from './comet'
import * as cache from '../services/cache'
import { logger } from './logger'

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
 *
 * @param bypassCache - Force TorBox to rebuild the listing. Accurate to the
 *   second, but measured ~6.7s (vs ~1s) on a 145-torrent shared account, since
 *   it returns every torrent's full file list. Pass `false` when slightly
 *   stale download state is acceptable (e.g. finding a torrent by name).
 */
export async function myList(bypassCache = true): Promise<TorboxEnvelope<TorboxTorrent[]>> {
  return torboxFetch<TorboxTorrent[]>(`/torrents/mylist${bypassCache ? '?bypass_cache=true' : ''}`)
}

/**
 * Fetch a single torrent (with its file list and live download state) by id.
 * ~0.4s regardless of library size — use this instead of `myList()` whenever
 * the torrent id is already known.
 */
export async function getTorrent(torrentId: number): Promise<TorboxEnvelope<TorboxTorrent | null>> {
  return torboxFetch<TorboxTorrent | null>(
    `/torrents/mylist?bypass_cache=true&id=${encodeURIComponent(String(torrentId))}`
  )
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
 * @param query    - Movie / TV show title (e.g. "Inception 2010")
 * @param poolSize - Max raw results to return. Callers that post-filter
 *                   (size caps, dedup against another source) should pass a
 *                   pool larger than their final desired count, since
 *                   filtering happens after this — otherwise a candidate
 *                   that would've survived filtering can get truncated away
 *                   before it's even considered.
 * @param cat      - apibay category: 0=all, 207=HD movies, 205=movies, 208=TV
 */
async function fetchApibayResults(
  query: string,
  poolSize: number,
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

  return results.slice(0, poolSize)
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
 * Upper bound on release size for the auto-play search (searchMediaTorrents
 * only). Excludes 100GB+ IMAX/UHD remuxes — great quality, but too large to
 * be a sane default stream — while still allowing normal 4K WEB-DL/BluRay
 * encodes (typically 8-25GB) through.
 */
const MAX_RELEASE_SIZE_BYTES = 40 * 1024 * 1024 * 1024 // 40 GiB

/** Quality rank for sorting — higher is preferred once a release is cached (equal streaming speed, so quality wins). */
function releaseQualityRank(name: string): number {
  if (/\b(2160p|4K|UHD)\b/i.test(name)) return 4
  if (/\b1080p\b/i.test(name)) return 3
  if (/\b720p\b/i.test(name)) return 2
  return 1
}

/**
 * True when the release name explicitly declares an audio codec no
 * mainstream browser can decode natively — DTS (incl. DTS-HD/-X) and Dolby
 * TrueHD/Atmos. These are the default audio tracks on BluRay-sourced remuxes,
 * which UHD/4K releases are disproportionately sourced from, and the
 * `<video>` element plays the picture fine while silently dropping audio
 * instead of erroring — no exception, no onError. AC3/E-AC3/DD+ are left
 * untagged since browser support for those is inconsistent rather than
 * universally absent, so penalizing them would cause false positives.
 */
export function hasIncompatibleAudio(name: string): boolean {
  return /\bDTS(-?HD|-?X)?\b|\bTrueHD\b|\bAtmos\b/i.test(name)
}

/** True when the release name declares an IMAX (theatrical or "Enhanced") cut. */
export function isImaxRelease(name: string): boolean {
  return /\bIMAX\b/i.test(name)
}

// ---------------------------------------------------------------------------
// Indexer lookup caching (searchMediaTorrents only)
// ---------------------------------------------------------------------------

/** apibay never returns more than 100 rows; cache the whole page and slice per request. */
const APIBAY_MAX_RESULTS = 100

/** How long a movie search waits for Comet (from search start) once apibay already has results. */
const MOVIE_COMET_GRACE_MS = 2500

/** How long a search waits for Comet when it's the only source with results (TV, obscure movies). */
const COMET_ONLY_WAIT_MS = 12_000

/**
 * Comet returns every release it knows (2,000+ for a popular movie). Only the
 * best-seeded few hundred ever reach the cache check below, so that's all
 * worth caching.
 */
const COMET_CACHED_CANDIDATES_MAX = 300

const inflightIndexLookups = new Map<string, Promise<unknown[]>>()

/**
 * Serve an indexer lookup from cache, sharing one in-flight request between
 * concurrent callers for the same key. Non-empty results are cached; empty
 * ones aren't, since those are as likely to be a transient indexer failure
 * as a genuine "no releases", and a retry should get a real second chance.
 */
async function cachedIndexLookup<T>(key: string, fetcher: () => Promise<T[]>): Promise<T[]> {
  const hit = await cache.torbox.get<T[]>(key)
  if (hit) return hit

  const inflight = inflightIndexLookups.get(key) as Promise<T[]> | undefined
  if (inflight) return inflight

  const lookup = fetcher()
    .then(async (results) => {
      if (results.length > 0) await cache.torbox.set(key, results)
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

function trimCometCandidates(candidates: CometTorrentCandidate[]): CometTorrentCandidate[] {
  return candidates
    .filter((c) => c.size === 0 || c.size <= MAX_RELEASE_SIZE_BYTES)
    .sort((a, b) => Number(b.cachedHint) - Number(a.cachedHint) || b.seeders - a.seeders)
    .slice(0, COMET_CACHED_CANDIDATES_MAX)
}

/**
 * Search for a specific movie/episode by TMDB-derived identity (title +
 * IMDb id, + season/episode for TV) across every source we have: Comet
 * (many indexers, matched by IMDb id — reliable for TV episodes) and, for
 * movies only, apibay (title search is too unreliable for TV season packs
 * vs per-episode releases, which is why TorBox wasn't offered for TV before).
 *
 * Results from both sources are merged (de-duped by info-hash, Comet wins
 * ties since it's the more precisely-matched source), filtered to a sane
 * size cap, then checked against TorBox's cache in a single batched call.
 *
 * Indexer results are cached per title/episode (see cachedIndexLookup); only
 * the cache-status check runs fresh on every call.
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
  const startedAt = Date.now()

  // Both lookups start immediately and are cached per title/episode, with the
  // `.catch` attached up front so a source failing while we're still awaiting
  // the other can't surface as an unhandled rejection.
  const cometPromise: Promise<CometTorrentCandidate[]> = imdbId
    ? cachedIndexLookup(`comet:${mediaType}:${imdbId}:${season ?? ''}:${episode ?? ''}`, async () =>
        trimCometCandidates(
          cometTorrentCandidates(
            await searchComet(imdbId, mediaType === 'tv' ? 'series' : 'movie', season, episode)
          )
        )
      ).catch(() => [])
    : Promise.resolve([])

  const apibayPromise: Promise<ApibayResult[]> = useApibay
    ? cachedIndexLookup(`apibay:207:${title.toLowerCase()}`, () =>
        fetchApibayResults(title, APIBAY_MAX_RESULTS, 207)
      ).catch(() => [])
    : Promise.resolve([])

  // Fetch a larger pool than `limit` — the size cap + Comet dedup below
  // filter this down, so slicing to `limit` here first could throw away
  // a smaller, well-seeded 4K release in favor of one that gets excluded
  // for being oversized.
  const apibayResults = (await apibayPromise).slice(0, Math.max(limit * 3, 60))

  // Don't let Comet hold a movie search hostage: once apibay has produced
  // releases, give Comet only what's left of a short grace window. If it
  // misses that, it keeps running in the background and lands in the cache,
  // so the next search for this title gets both sources instantly. With no
  // apibay results (TV, or an obscure movie) Comet is the only source, so
  // it's worth waiting on longer.
  const cometWaitMs =
    apibayResults.length > 0
      ? Math.max(0, MOVIE_COMET_GRACE_MS - (Date.now() - startedAt))
      : COMET_ONLY_WAIT_MS
  const cometCandidates = (await resolveWithin(cometPromise, cometWaitMs)) ?? []

  interface Candidate {
    name: string
    info_hash: string
    size: number
    seeders: number
    leechers: number
    num_files: number
    source: 'comet' | 'apibay'
    /** Source already believes it's cached on TorBox (Comet's ⚡ tag) — used to prioritize the cache check. */
    cachedHint: boolean
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
      cachedHint: c.cachedHint,
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
      cachedHint: false,
    })
  }

  // Drop anything over the size cap outright — a 110GB IMAX remux should
  // never surface here, cached or not. Keep unknown sizes (0): Comet doesn't
  // always report `videoSize`, and an unknown size shouldn't be punished.
  const candidates = [...merged.values()].filter(
    (c) => c.size === 0 || c.size <= MAX_RELEASE_SIZE_BYTES
  )

  if (candidates.length === 0) {
    return { success: true, error: null, detail: 'No results found', data: [] }
  }

  const cachedSet = new Set<string>()
  // Cap the batch — no point cache-checking more than we'll ever show.
  // Comet no longer reports seeders, so its releases would all sort behind
  // apibay's and fall off this cap; check the ones it flags as cached first.
  const toCheck = candidates
    .sort((a, b) => Number(b.cachedHint) - Number(a.cachedHint) || b.seeders - a.seeders)
    .slice(0, Math.max(limit * 3, 30))
    .map((c) => c.info_hash)

  // A failed check isn't just cosmetic: with nothing marked cached, the player
  // skips straight to the slow add-and-download path. Retry a transient
  // failure (e.g. a TorBox rate limit) once before giving up.
  for (let attempt = 1; attempt <= 2; attempt++) {
    try {
      const cacheRes = await checkCachedBatch(toCheck)
      if (cacheRes.success && Array.isArray(cacheRes.data)) {
        for (const entry of cacheRes.data) cachedSet.add(entry.hash.toUpperCase())
        break
      }
      throw new Error(cacheRes.detail || 'checkcached returned success=false')
    } catch (err: unknown) {
      logger.warn('TorBox cache check failed', {
        attempt,
        error: err instanceof Error ? err.message : String(err),
      })
      if (attempt < 2) await new Promise((r) => setTimeout(r, 400))
    }
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

  // Audio compatibility first — silent 4K beats no one, so a release that
  // explicitly declares DTS/TrueHD/Atmos audio never outranks one that
  // doesn't, regardless of resolution. Then quality, ABOVE cached status: a
  // title's shared-account cache tends to fill up with whichever quality
  // gets streamed most (usually 1080p), so sorting cached-first can bury the
  // one 4K release that exists behind a dozen cached 1080p duplicates and
  // see it fall off the `limit` slice below entirely. Ranking quality first
  // guarantees a capped 4K release (when one exists at all) always survives
  // into the returned list — cached or not, it'll just take the
  // download-and-play path if uncached.
  annotated.sort((a, b) => {
    const audioDiff = Number(hasIncompatibleAudio(a.name)) - Number(hasIncompatibleAudio(b.name))
    if (audioDiff !== 0) return audioDiff
    const rankDiff = releaseQualityRank(b.name) - releaseQualityRank(a.name)
    if (rankDiff !== 0) return rankDiff
    // Same quality/audio tier — prefer the IMAX cut when one exists, since
    // that's a strictly better presentation of the same release.
    const imaxDiff = Number(isImaxRelease(b.name)) - Number(isImaxRelease(a.name))
    if (imaxDiff !== 0) return imaxDiff
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
): Promise<
  TorboxEnvelope<{ torrent_id: number; hash: string; name: string; files?: TorboxFile[] }>
> {
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
