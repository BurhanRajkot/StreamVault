/**
 * Debrid (Real-Debrid) route handler
 *
 * All Real-Debrid API calls go through this backend router so that the
 * API key (`DEBRID_API_KEY`) is never exposed to the browser. Only metadata
 * passes through here — the video itself streams straight from Real-Debrid
 * to the viewer (direct link or Real-Debrid's own HLS transcode).
 *
 * Route summary:
 *   GET    /debrid/status                         — account status (no auth required)
 *   GET    /debrid/search                         — free-text search (premium or admin)
 *   GET    /debrid/media-search                   — search by IMDb id (premium or admin)
 *   POST   /debrid/play                           — add/reuse a release and resolve its streams (premium or admin)
 *   GET    /debrid/play/:torrentId                — poll a release that is still downloading (premium or admin)
 *   GET    /debrid/torrents                       — the account's torrents (premium or admin)
 *   GET    /debrid/torrents/:torrentId            — one torrent with its files (premium or admin)
 *   GET    /debrid/torrents/:torrentId/files/:fileId/stream — streams for one library file (premium or admin)
 *   DELETE /debrid/torrents/:torrentId            — remove a torrent (admin only)
 */

import { Router, Request, Response } from 'express'
import { checkAuth } from '../middleware/auth'
import { downloadRateLimiter } from '../middleware/rateLimiter'
import { logger } from '../lib/logger'
import { getUserId } from '../utils/auth'
import { isPaidUser } from '../lib/subscription'
import * as debrid from '../lib/debrid'

const router = Router()

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Gate the debrid feature behind an active subscription. Admins bypass. Not
 * relaxed outside production — the feature runs on a paid shared account, so
 * it must never be reachable for free.
 */
async function authorizeDebridAccess(
  req: Request
): Promise<{ status: number; body: { error: string } } | null> {
  if (req.admin) return null

  const userId = getUserId(req)
  if (!userId) {
    return { status: 401, body: { error: 'Unauthorized' } }
  }

  if (!(await isPaidUser(userId))) {
    return {
      status: 403,
      body: { error: 'Debrid streaming is only available for premium users. Please upgrade.' },
    }
  }

  return null
}

const HASH_RE = /^[a-fA-F0-9]{40}$/
/** Real-Debrid torrent ids: 13 base32 characters. */
const TORRENT_ID_RE = /^[A-Z0-9]{8,20}$/

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err)
}

/** Pass Real-Debrid's own 4xx through (bad hash, unknown id, ...); everything else is a 502. */
function upstreamStatus(err: unknown): number {
  if (err instanceof debrid.DebridError) {
    if (err.status === 429) return 429
    if (err.status === 404) return 404
    if (err.status >= 400 && err.status < 500 && err.status !== 401 && err.status !== 403) return 400
  }
  return 502
}

/**
 * Send a failed Real-Debrid call back to the browser. Account/server-wide
 * failures (blocked IP, bad token, traffic exhausted, ...) are a 503 with
 * `code: 'debrid_unavailable'` and the reason, so the player stops instead of
 * trying every release; anything else keeps its upstream status.
 */
function sendDebridFailure(res: Response, err: unknown, error: string) {
  const accountReason = debrid.accountErrorMessage(err)
  if (accountReason) {
    return res.status(503).json({ error: accountReason, code: 'debrid_unavailable', detail: errorMessage(err) })
  }
  return res.status(upstreamStatus(err)).json({ error, detail: errorMessage(err) })
}

function optionalInt(value: unknown): number | undefined {
  const n = typeof value === 'string' ? parseInt(value, 10) : typeof value === 'number' ? value : NaN
  return Number.isInteger(n) && n >= 0 ? n : undefined
}

// ---------------------------------------------------------------------------
// GET /debrid/status — public, no auth needed
// ---------------------------------------------------------------------------

router.get('/status', async (_req, res) => {
  try {
    return res.json(await debrid.getAccountStatus())
  } catch (err: unknown) {
    logger.warn('Debrid status check failed', { error: errorMessage(err) })
    return res.status(502).json({ error: 'Real-Debrid unreachable' })
  }
})

// ---------------------------------------------------------------------------
// GET /debrid/search?q=title[&limit=20][&cat=0] — auth + premium
//
// Free-text apibay search. Real-Debrid has no cache-check endpoint any more,
// so these are all reported uncached; playing one finds out.
// Cat codes: 0=all, 207=HD movies, 205=movies, 208=TV
// ---------------------------------------------------------------------------

router.get('/search', checkAuth, async (req: Request, res: Response) => {
  const denied = await authorizeDebridAccess(req)
  if (denied) return res.status(denied.status).json(denied.body)

  const q = (req.query.q as string | undefined)?.trim()
  if (!q || q.length < 2) {
    return res.status(400).json({ error: 'Query must be at least 2 characters' })
  }

  const limit = Math.min(parseInt((req.query.limit as string) || '20', 10) || 20, 50)
  const cat = parseInt((req.query.cat as string) || '0', 10) || 0

  try {
    return res.json({ data: await debrid.searchTorrents(q, limit, cat) })
  } catch (err: unknown) {
    logger.error('Debrid search failed', { q, error: errorMessage(err) })
    return res.status(502).json({ error: 'Search failed' })
  }
})

// ---------------------------------------------------------------------------
// GET /debrid/media-search?imdb=tt...&type=movie|tv&title=...[&season=&episode=][&limit=20]
//
// Matches a specific title by IMDb id (+ season/episode for TV) via
// Torrentio — which also says which releases Real-Debrid has cached — and,
// for movies, apibay too. Used by the automatic player pane.
// ---------------------------------------------------------------------------

router.get('/media-search', checkAuth, async (req: Request, res: Response) => {
  const denied = await authorizeDebridAccess(req)
  if (denied) return res.status(denied.status).json(denied.body)

  const title = (req.query.title as string | undefined)?.trim()
  const imdbId = (req.query.imdb as string | undefined)?.trim()
  const mediaType = (req.query.type as string) === 'tv' ? 'tv' : 'movie'
  const season = optionalInt(req.query.season)
  const episode = optionalInt(req.query.episode)
  const limit = Math.min(parseInt((req.query.limit as string) || '20', 10) || 20, 50)

  if (!title) {
    return res.status(400).json({ error: 'title is required' })
  }
  if (imdbId && !/^tt\d+$/.test(imdbId)) {
    return res.status(400).json({ error: 'imdb must be a valid IMDb id (e.g. tt1375666)' })
  }

  try {
    const data = await debrid.searchMediaReleases({ title, imdbId, mediaType, season, episode, limit })
    return res.json({ data })
  } catch (err: unknown) {
    logger.error('Debrid media-search failed', { title, imdbId, mediaType, error: errorMessage(err) })
    return res.status(502).json({ error: 'Search failed' })
  }
})

// ---------------------------------------------------------------------------
// POST /debrid/play — auth + premium, rate-limited
// Body: { hash: string, name?: string, fileName?: string, fileIdx?: number,
//         season?: number, episode?: number, instantOnly?: boolean }
//
// Reuses the torrent if it's already in the account, otherwise adds it, then
// selects its video files. Answers with one of:
//   { status: 'ready', directUrl, hls, media, ... } — play now
//   { status: 'downloading', torrentId, progress, ... } — poll GET /play/:torrentId
//   { status: 'failed', reason } — try another release
//   { status: 'not-cached' } — only with instantOnly: it wasn't instant, and was removed again
// ---------------------------------------------------------------------------

router.post('/play', checkAuth, downloadRateLimiter, async (req: Request, res: Response) => {
  const denied = await authorizeDebridAccess(req)
  if (denied) return res.status(denied.status).json(denied.body)

  const body = req.body as {
    hash?: unknown
    name?: unknown
    fileName?: unknown
    fileIdx?: unknown
    season?: unknown
    episode?: unknown
    instantOnly?: unknown
  }

  if (typeof body.hash !== 'string' || !HASH_RE.test(body.hash)) {
    return res.status(400).json({ error: 'A valid 40-char hex info-hash is required' })
  }

  try {
    const result = await debrid.preparePlayback({
      hash: body.hash,
      name: typeof body.name === 'string' ? body.name.slice(0, 300) : undefined,
      fileName: typeof body.fileName === 'string' ? body.fileName.slice(0, 300) : undefined,
      fileIdx: optionalInt(body.fileIdx),
      season: optionalInt(body.season),
      episode: optionalInt(body.episode),
      instantOnly: body.instantOnly === true,
    })
    if (result.status !== 'ready') {
      logger.info('Debrid release not instantly playable', {
        hash: body.hash,
        status: result.status,
        debridStatus: 'debridStatus' in result ? result.debridStatus : undefined,
      })
    }
    return res.json(result)
  } catch (err: unknown) {
    logger.error('Debrid play failed', { hash: body.hash, error: errorMessage(err) })
    return sendDebridFailure(res, err, 'Failed to start stream')
  }
})

// ---------------------------------------------------------------------------
// GET /debrid/play/:torrentId[?fileName=&fileIdx=&season=&episode=] — auth + premium
//
// The polling half of POST /play. Not behind downloadRateLimiter: the player
// polls every few seconds while a release downloads.
// ---------------------------------------------------------------------------

router.get('/play/:torrentId', checkAuth, async (req: Request, res: Response) => {
  const denied = await authorizeDebridAccess(req)
  if (denied) return res.status(denied.status).json(denied.body)

  const { torrentId } = req.params
  if (!TORRENT_ID_RE.test(torrentId)) {
    return res.status(400).json({ error: 'Invalid torrent id' })
  }

  try {
    const result = await debrid.preparePlayback({
      torrentId,
      fileName: typeof req.query.fileName === 'string' ? req.query.fileName.slice(0, 300) : undefined,
      fileIdx: optionalInt(req.query.fileIdx),
      season: optionalInt(req.query.season),
      episode: optionalInt(req.query.episode),
    })
    return res.json(result)
  } catch (err: unknown) {
    logger.warn('Debrid play poll failed', { torrentId, error: errorMessage(err) })
    return sendDebridFailure(res, err, 'Failed to check download')
  }
})

// ---------------------------------------------------------------------------
// Library — GET /debrid/torrents, GET /debrid/torrents/:id — auth + premium
// ---------------------------------------------------------------------------

router.get('/torrents', checkAuth, async (req: Request, res: Response) => {
  const denied = await authorizeDebridAccess(req)
  if (denied) return res.status(denied.status).json(denied.body)

  try {
    return res.json({ data: await debrid.listTorrents(optionalInt(req.query.limit) ?? 100) })
  } catch (err: unknown) {
    logger.error('Debrid torrent list failed', { error: errorMessage(err) })
    return res.status(502).json({ error: 'Failed to fetch Real-Debrid library' })
  }
})

router.get('/torrents/:torrentId', checkAuth, async (req: Request, res: Response) => {
  const denied = await authorizeDebridAccess(req)
  if (denied) return res.status(denied.status).json(denied.body)

  const { torrentId } = req.params
  if (!TORRENT_ID_RE.test(torrentId)) {
    return res.status(400).json({ error: 'Invalid torrent id' })
  }

  try {
    return res.json({ data: await debrid.getTorrentInfo(torrentId) })
  } catch (err: unknown) {
    logger.warn('Debrid torrent info failed', { torrentId, error: errorMessage(err) })
    return res.status(upstreamStatus(err)).json({ error: 'Failed to fetch torrent' })
  }
})

// ---------------------------------------------------------------------------
// GET /debrid/torrents/:torrentId/files/:fileId/stream — auth + premium, rate-limited
// Same payload as POST /play, for a file picked from the Cloud library.
// ---------------------------------------------------------------------------

router.get(
  '/torrents/:torrentId/files/:fileId/stream',
  checkAuth,
  downloadRateLimiter,
  async (req: Request, res: Response) => {
    const denied = await authorizeDebridAccess(req)
    if (denied) return res.status(denied.status).json(denied.body)

    const { torrentId } = req.params
    const fileId = optionalInt(req.params.fileId)
    if (!TORRENT_ID_RE.test(torrentId) || fileId === undefined) {
      return res.status(400).json({ error: 'Invalid torrent or file id' })
    }

    try {
      return res.json(await debrid.fileStreams(torrentId, fileId))
    } catch (err: unknown) {
      logger.error('Debrid file stream failed', { torrentId, fileId, error: errorMessage(err) })
      return sendDebridFailure(res, err, 'Failed to get stream URL')
    }
  }
)

// ---------------------------------------------------------------------------
// DELETE /debrid/torrents/:torrentId — admin only
// ---------------------------------------------------------------------------

router.delete('/torrents/:torrentId', checkAuth, async (req: Request, res: Response) => {
  if (!req.admin) {
    return res.status(403).json({ error: 'Admin access required' })
  }

  const { torrentId } = req.params
  if (!TORRENT_ID_RE.test(torrentId)) {
    return res.status(400).json({ error: 'Invalid torrent id' })
  }

  try {
    await debrid.deleteTorrent(torrentId)
    logger.info('Debrid torrent deleted', { torrentId })
    return res.status(204).end()
  } catch (err: unknown) {
    logger.error('Debrid delete failed', { torrentId, error: errorMessage(err) })
    return res.status(upstreamStatus(err)).json({ error: 'Delete failed' })
  }
})

export default router
