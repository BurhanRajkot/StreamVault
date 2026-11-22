/**
 * Finding a title's Premium releases — one request shared by the title page,
 * which starts it as soon as the page opens, and the player, which then
 * doesn't wait for it again when Play is pressed.
 *
 * The search is the first step of every Premium play: 1-2s for a title the
 * backend has looked up recently, up to ~11s when its indexers have to be
 * asked afresh (measured 2026-11-08). Started with the page, it's usually
 * done before the viewer reaches the Play button. The backend caches indexer
 * results for an hour, so asking early costs nothing extra there.
 */

import { searchDebridMedia, type DebridRelease } from './debridApi'

/**
 * Releases from somewhere other than the title search (Torrentio and apibay
 * by IMDb id and title) — the F1 archive's, which has no IMDb ids to go by.
 */
export interface PremiumReleaseSource {
  /** Names what's being searched: a new key searches again, and keys the resume point. */
  key: string
  find: (opts: { fresh: boolean }) => Promise<DebridRelease[]>
  /** Sent when a release is started: picks that F1 session's file out of a torrent holding the whole race weekend. */
  session?: string
  /** What the player says when nothing turns up. */
  notFoundMessage?: string
  /**
   * Ask Real-Debrid about releases nobody shares any more too, before
   * downloading anything: an old broadcast is often still in its cache long
   * after the last person stopped sharing it.
   */
  probeUnseeded?: boolean
}

export interface PremiumSearchTarget {
  title: string
  year?: string | number
  imdbId?: string | null
  mediaType: 'movie' | 'tv'
  season?: number
  episode?: number
}

/** A search reused for this long; the releases themselves change far more slowly. */
const SEARCH_TTL_MS = 10 * 60_000
const SEARCH_LIMIT = 25

const searches = new Map<string, { at: number; releases: Promise<DebridRelease[]> }>()

function searchKey(target: PremiumSearchTarget): string {
  const { title, year, imdbId, mediaType, season, episode } = target
  return JSON.stringify([imdbId || `${title}:${year ?? ''}`, mediaType, mediaType === 'tv' ? season : null, mediaType === 'tv' ? episode : null])
}

/**
 * The releases for a movie, or for one episode — the request already in
 * flight (or answered in the last few minutes) when there is one.
 *
 * Failures and empty answers aren't kept: an indexer that was down a moment
 * ago may answer the next time.
 */
export function findPremiumReleases(
  target: PremiumSearchTarget,
  token?: string,
  { fresh = false }: { fresh?: boolean } = {}
): Promise<DebridRelease[]> {
  const key = searchKey(target)
  const hit = searches.get(key)
  if (hit && !fresh && Date.now() - hit.at < SEARCH_TTL_MS) return hit.releases

  const { title, year, imdbId, mediaType, season, episode } = target
  const cleanTitle = title.replace(/[^a-zA-Z0-9\s]/g, ' ').trim()
  const queryTitle = year ? `${cleanTitle} ${year}` : cleanTitle
  const releases = searchDebridMedia(queryTitle, imdbId ?? undefined, mediaType, token, {
    season: mediaType === 'tv' ? season : undefined,
    episode: mediaType === 'tv' ? episode : undefined,
    limit: SEARCH_LIMIT,
  })
  const entry = { at: Date.now(), releases }
  searches.set(key, entry)
  const drop = () => {
    if (searches.get(key) === entry) searches.delete(key)
  }
  releases.then((rows) => {
    if (rows.length === 0) drop()
  }, drop)
  return releases
}

/** Start finding a title's releases ahead of Play. Never throws. */
export function prefetchPremiumReleases(target: PremiumSearchTarget, token?: string): void {
  findPremiumReleases(target, token).catch(() => {})
}
