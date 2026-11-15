/**
 * Debrid (Real-Debrid) route handler — the ⚡ Premium server.
 *
 * All Real-Debrid API calls go through this backend router so that the
 * API key (`DEBRID_API_KEY`) is never exposed to the browser. Only metadata
 * passes through here — the video itself streams straight from Real-Debrid
 * to the viewer (direct link or Real-Debrid's own HLS transcode).
 *
 * Who may use it (since 2026-11-15): the admin (TOTP login, see
 * admin/routes), and signed-in accounts the admin has granted Premium from
 * the dashboard — see middleware/premiumAccess. Never the public: one
 * Real-Debrid account can't be shared widely (Real-Debrid refused the account
 * for exactly that on 2026-11-12). The account's status and deleting its
 * torrents stay admin-only.
 *
 * Route summary:
 *   GET    /debrid/status                 — the account: connected, premium, expiry (admin)
 *   GET    /debrid/media-search           — releases for a title, tagged with what Real-Debrid has cached
 *   POST   /debrid/play                   — add/reuse a release and resolve its streams
 *   GET    /debrid/play/:torrentId        — poll a release that is still downloading
 *   GET    /debrid/subtitles              — subtitles for the playing file, by language
 *   GET    /debrid/subtitles/file/:id     — one subtitle file's text
 *   DELETE /debrid/torrents/:torrentId    — remove a torrent from the account (admin)
 */

import { Router, Request, Response } from 'express'
import { requireAdminAuth } from '../admin/middleware'
import { requirePremiumAccess } from '../middleware/premiumAccess'
import { downloadRateLimiter } from '../cybersecurity/rateLimiter'
import { logger } from '../lib/logger'
import * as debrid from '../lib/debrid'
import * as subtitles from '../lib/subtitles'
import { parseReleaseSearchQuery } from './releases'

const router = Router()

// The admin's own routes first; everything after the gate below is the player's.
router.get('/status', requireAdminAuth, async (_req, res) => {
  try {
    return res.json(await debrid.getAccountStatus())
  } catch (err: unknown) {
    logger.warn('Debrid status check failed', { error: errorMessage(err) })
    // Still an answer, not an error: "not connected, and here is why" is what the dashboard is asking.
    const status: debrid.DebridAccountStatus = {
      connected: false,
      premium: false,
      expiration: null,
      note: debrid.accountErrorMessage(err) ?? errorMessage(err),
    }
    return res.json(status)
  }
})

router.delete('/torrents/:torrentId', requireAdminAuth, async (req: Request, res: Response) => {
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

// The player: the admin, or an account the admin granted Premium.
router.use(requirePremiumAccess)

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

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

/**
 * A season or episode number that goes into an outside URL's path: digits
 * only, checked as text rather than parsed leniently like optionalInt, so
 * nothing but a number can reach the path.
 */
function pathNumber(value: unknown): number | undefined {
  if (typeof value !== 'string') return undefined
  if (!/^\d{1,4}$/.test(value)) return undefined
  return Number(value)
}

// ---------------------------------------------------------------------------
// GET /debrid/media-search?imdb=tt...&type=movie|tv&title=...[&season=&episode=][&limit=20]
//
// Matches a specific title by IMDb id (+ season/episode for TV) via
// Torrentio — which also says which releases Real-Debrid has cached — and,
// for movies, apibay too. Used by the automatic player pane.
// ---------------------------------------------------------------------------

router.get('/media-search', async (req: Request, res: Response) => {
  const search = parseReleaseSearchQuery(req.query)
  if ('error' in search) return res.status(400).json({ error: search.error })

  // Play usually follows a search within seconds — have the account's
  // "already added?" listing ready for it.
  debrid.warmTorrentLookup()

  try {
    return res.json({ data: await debrid.searchMediaReleases(search) })
  } catch (err: unknown) {
    logger.error('Debrid media-search failed', {
      title: search.title,
      imdbId: search.imdbId,
      mediaType: search.mediaType,
      error: errorMessage(err),
    })
    return res.status(502).json({ error: 'Search failed' })
  }
})

// ---------------------------------------------------------------------------
// POST /debrid/play — rate-limited
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

router.post('/play', downloadRateLimiter, async (req: Request, res: Response) => {
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
// GET /debrid/play/:torrentId[?fileName=&fileIdx=&season=&episode=]
//
// The polling half of POST /play. Not behind downloadRateLimiter: the player
// polls every few seconds while a release downloads.
// ---------------------------------------------------------------------------

router.get('/play/:torrentId', async (req: Request, res: Response) => {
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
// GET /debrid/subtitles?imdb=tt...&type=movie|tv[&season=&episode=]
//                      [&fileName=][&duration=][&langs=spa,fre]
//
// Subtitles from OpenSubtitles, by language, each language's versions ranked
// for the file playing (its release name and length). English and `langs`
// are searched in depth. Answers { languages: [{ code, name, options }] }.
// ---------------------------------------------------------------------------

router.get('/subtitles', async (req: Request, res: Response) => {
  const imdbId = typeof req.query.imdb === 'string' ? req.query.imdb.trim() : ''
  const mediaType = req.query.type === 'tv' ? 'tv' : 'movie'
  const season = pathNumber(req.query.season)
  const episode = pathNumber(req.query.episode)
  if (!/^tt\d{5,10}$/.test(imdbId)) {
    return res.status(400).json({ error: 'imdb must be a valid IMDb id (e.g. tt1375666)' })
  }
  if (mediaType === 'tv' && (season === undefined || episode === undefined)) {
    return res.status(400).json({ error: 'season and episode are required for a show' })
  }
  const fileName = typeof req.query.fileName === 'string' ? req.query.fileName.slice(0, 300) : undefined
  const duration = typeof req.query.duration === 'string' ? Number(req.query.duration) : NaN
  const languages =
    typeof req.query.langs === 'string'
      ? req.query.langs
          .split(',')
          .map((l) => l.trim().toLowerCase())
          .filter((l) => /^[a-z]{3}$/.test(l))
          .slice(0, 2)
      : []

  try {
    const found = await subtitles.findSubtitles({
      imdbId,
      mediaType,
      season,
      episode,
      languages,
      // Never the file's Real-Debrid link, even if an old page sends one: the
      // server reading it alongside the viewer looks like account sharing.
      file: { name: fileName, duration: Number.isFinite(duration) && duration > 0 && duration < 86_400 ? duration : null },
    })
    res.set('Cache-Control', 'private, max-age=600')
    return res.json({ languages: found })
  } catch (err: unknown) {
    logger.error('Subtitle search failed', { imdbId, mediaType, season, episode, error: errorMessage(err) })
    return res.status(502).json({ error: 'Subtitle search failed' })
  }
})

// ---------------------------------------------------------------------------
// GET /debrid/subtitles/file/:id
//
// One subtitle file as UTF-8 text (SubRip, WebVTT or SubStation Alpha), by
// the OpenSubtitles file id /debrid/subtitles listed. A file never changes.
// ---------------------------------------------------------------------------

router.get('/subtitles/file/:id', async (req: Request, res: Response) => {
  const { id } = req.params
  if (!subtitles.SUBTITLE_FILE_ID_RE.test(id)) {
    return res.status(400).json({ error: 'Invalid subtitle id' })
  }

  try {
    const text = await subtitles.fetchSubtitleFile(id)
    res.set('Cache-Control', 'private, max-age=604800, immutable')
    res.type('text/plain; charset=utf-8')
    return res.send(text)
  } catch (err: unknown) {
    const status = err instanceof subtitles.SubtitleFileError ? err.status : 502
    logger.warn('Subtitle file failed', { id, error: errorMessage(err) })
    return res.status(status).json({ error: status === 404 ? 'Subtitle not found' : 'Subtitle download failed' })
  }
})

export default router
