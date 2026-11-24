/**
 * Release search — which torrents exist for a film or an episode.
 *
 *   GET /releases?title=...&type=movie|tv[&imdb=tt...][&season=&episode=][&limit=20]
 *
 * Public: it feeds the Download sheet, which hands visitors magnet links for
 * their own torrent app. It asks the public indexers only (Torrentio, apibay)
 * and never involves the Real-Debrid account — no key sent along, nothing
 * looked up in it — so it costs the account nothing however many people use it.
 *
 * The admin-only Premium player searches through /debrid/media-search
 * instead, which shares this file's query parsing and adds what Real-Debrid
 * already has cached.
 */

import { Router, Request, Response } from 'express'
import { logger } from '../lib/logger'
import { searchMediaReleases } from '../lib/debrid'

const router = Router()

export interface ReleaseSearchQuery {
  title: string
  imdbId?: string
  mediaType: 'movie' | 'tv'
  season?: number
  episode?: number
  limit: number
  /** The audio language wanted (ISO 639-1) — releases in it are kept and put first. */
  audioLang?: string
}

function optionalInt(value: unknown): number | undefined {
  const n = typeof value === 'string' ? parseInt(value, 10) : NaN
  return Number.isInteger(n) && n >= 0 ? n : undefined
}

/** Validate a release search's query string — the search params, or what's wrong with them. */
export function parseReleaseSearchQuery(query: Request['query']): ReleaseSearchQuery | { error: string } {
  const title = typeof query.title === 'string' ? query.title.trim().slice(0, 200) : ''
  const imdbId = typeof query.imdb === 'string' ? query.imdb.trim() : undefined
  if (!title) return { error: 'title is required' }
  if (imdbId && !/^tt\d+$/.test(imdbId)) return { error: 'imdb must be a valid IMDb id (e.g. tt1375666)' }
  return {
    title,
    imdbId: imdbId || undefined,
    mediaType: query.type === 'tv' ? 'tv' : 'movie',
    season: optionalInt(query.season),
    episode: optionalInt(query.episode),
    limit: Math.min(optionalInt(query.limit) || 20, 50),
    // ISO 639-1; anything else is English, as before
    audioLang: typeof query.lang === 'string' && /^[a-z]{2}$/.test(query.lang) ? query.lang : undefined,
  }
}

router.get('/', async (req: Request, res: Response) => {
  const search = parseReleaseSearchQuery(req.query)
  if ('error' in search) return res.status(400).json({ error: search.error })

  try {
    const data = await searchMediaReleases({ ...search, debridTags: false })
    // The indexers' answers are cached for an hour server-side; let browsers and the CDN hold them a while too.
    res.set('Cache-Control', 'public, max-age=600')
    return res.json({ data })
  } catch (err: unknown) {
    logger.error('Release search failed', {
      title: search.title,
      imdbId: search.imdbId,
      mediaType: search.mediaType,
      error: err instanceof Error ? err.message : String(err),
    })
    return res.status(502).json({ error: 'Search failed' })
  }
})

export default router
