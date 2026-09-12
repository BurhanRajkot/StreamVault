/**
 * TorBox route handler
 *
 * All TorBox API calls are proxied through this backend router so that the
 * API key (`TORBOX_API_KEY`) is never exposed to the browser.
 *
 * Route summary:
 *   GET  /torbox/status           — TorBox up-status (no auth required)
 *   GET  /torbox/mylist           — List active torrents (no auth required)
 *   POST /torbox/check            — Check if a hash is cached (any logged-in user)
 *   POST /torbox/add              — Add a magnet (admin only)
 *   GET  /torbox/stream/:tid/:fid — Get a direct stream/download URL (premium or admin)
 *   POST /torbox/control          — Pause / resume / delete a torrent (admin only)
 *   GET  /torbox/search           — Search torrents (premium or admin)
 *   GET  /torbox/media-search     — Search by IMDb id (premium or admin)
 *   POST /torbox/add-hash         — Add a torrent by info-hash (premium or admin)
 *   POST /torbox/hls/start        — Start (or skip) audio-transcode for a file (premium or admin)
 *   GET  /torbox/hls/:sid/playlist.m3u8 — Serve the growing HLS playlist for a session
 *   GET  /torbox/hls/:sid/:segment      — Serve one HLS segment for a session
 */

import { Router, Request, Response } from 'express'
import path from 'path'
import { checkAuth } from '../middleware/auth'
import { downloadRateLimiter } from '../middleware/rateLimiter'
import { logger } from '../lib/logger'
import { getUserId } from '../utils/auth'
import { isPaidUser } from '../lib/subscription'
import * as torbox from '../lib/torbox'
import * as transcode from '../lib/transcode'


const router = Router()

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Gate callers behind login only — no subscription required. `checkAuth` has
 * already run by the time this is called, so this just confirms it resolved
 * to an actual identity (admin token or Auth0 user) rather than falling
 * through silently.
 * Returns `null` when access is allowed; otherwise an object to send as the
 * error response.
 */
function requireLogin(
  req: Request
): { status: number; body: { error: string } } | null {
  if (process.env.NODE_ENV !== 'production') return null
  if (req.admin) return null
  if (!getUserId(req)) return { status: 401, body: { error: 'Unauthorized' } }
  return null
}

/**
 * Gate the actual debrid feature (search, add, stream) behind an active
 * subscription. Admins bypass. Unlike `requireLogin`, this is NOT relaxed
 * outside production — the whole point is that the feature costs money via
 * the shared TorBox account, so it must never be reachable for free.
 */
async function authorizeTorboxAccess(
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
      body: { error: 'TorBox streaming is only available for premium users. Please upgrade.' },
    }
  }

  return null
}

// ---------------------------------------------------------------------------
// GET /torbox/status — public, no auth needed
// ---------------------------------------------------------------------------

router.get('/status', async (_req, res) => {
  try {
    const result = await torbox.getUpStatus()
    return res.json(result)
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err)
    logger.warn('TorBox status check failed', { error: message })
    return res.status(502).json({ error: 'TorBox unreachable', detail: message })
  }
})

// ---------------------------------------------------------------------------
// GET /torbox/mylist — public, no auth needed
//
// Reads the shared TorBox account's torrent list — same trust level as
// /add-hash and /stream below, which are already unauthenticated. The
// automatic player pane (TorboxPlayerPane) needs this for guests too, to
// look up a torrent's file list and pick the right episode.
// ---------------------------------------------------------------------------

router.get('/mylist', async (_req: Request, res: Response) => {
  try {
    const result = await torbox.myList()
    return res.json(result)
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err)
    logger.error('TorBox myList failed', { error: message })
    return res.status(502).json({ error: 'Failed to fetch TorBox library', detail: message })
  }
})

// ---------------------------------------------------------------------------
// POST /torbox/check — any logged-in user
// Body: { hash: string }
// ---------------------------------------------------------------------------

router.post('/check', checkAuth, async (req: Request, res: Response) => {
  const denied = requireLogin(req)
  if (denied) return res.status(denied.status).json(denied.body)

  const { hash } = req.body as { hash?: string }
  if (!hash || typeof hash !== 'string' || !/^[a-fA-F0-9]{40}$/.test(hash)) {
    return res.status(400).json({ error: 'A valid 40-char hex torrent hash is required' })
  }

  try {
    const result = await torbox.checkCached(hash)
    return res.json(result)
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err)
    logger.error('TorBox checkCached failed', { hash, error: message })
    return res.status(502).json({ error: 'Cache check failed', detail: message })
  }
})

// ---------------------------------------------------------------------------
// POST /torbox/add — admin only
// Body: { magnet: string, name?: string }
// ---------------------------------------------------------------------------

router.post('/add', checkAuth, async (req: Request, res: Response) => {
  if (!req.admin) {
    return res.status(403).json({ error: 'Admin access required to add torrents' })
  }

  const { magnet, name } = req.body as { magnet?: string; name?: string }
  if (!magnet || typeof magnet !== 'string' || !magnet.startsWith('magnet:')) {
    return res.status(400).json({ error: 'A valid magnet URI is required' })
  }

  try {
    const result = await torbox.createTorrent(magnet, name)
    logger.info('TorBox torrent added', { name: result.data?.name, hash: result.data?.hash })
    return res.json(result)
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err)
    logger.error('TorBox createTorrent failed', { error: message })
    return res.status(502).json({ error: 'Failed to add torrent', detail: message })
  }
})

// ---------------------------------------------------------------------------
// GET /torbox/stream/:torrentId/:fileId — any logged-in user, rate-limited
//
// Returns { url } — the caller navigates / opens this URL to stream/download.
// The URL is short-lived (TorBox CDN signed link, ~1 h).
// ---------------------------------------------------------------------------

router.get(
  '/stream/:torrentId/:fileId',
  checkAuth,
  downloadRateLimiter,
  async (req: Request, res: Response) => {
    const denied = await authorizeTorboxAccess(req)
    if (denied) return res.status(denied.status).json(denied.body)

    const torrentId = parseInt(req.params.torrentId, 10)
    const fileId = parseInt(req.params.fileId, 10)

    if (isNaN(torrentId) || isNaN(fileId)) {
      return res.status(400).json({ error: 'torrentId and fileId must be integers' })
    }

    // Best-effort caller IP for TorBox geo-routing
    const userIp =
      (req.headers['x-forwarded-for'] as string | undefined)?.split(',')[0]?.trim() ||
      req.socket.remoteAddress

    try {
      const result = await torbox.requestDownloadLink(torrentId, fileId, {
        userIp,
      })

      const url =
        typeof result.data === 'string'
          ? result.data
          : (result.data as { url?: string } | null)?.url

      if (!result.success || !url) {
        logger.warn('TorBox returned no URL', { torrentId, fileId, detail: result.detail })
        return res.status(404).json({ error: result.detail || 'No stream URL available' })
      }

      return res.json({ url })
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err)
      logger.error('TorBox requestDownloadLink failed', { torrentId, fileId, error: message })
      return res.status(502).json({ error: 'Failed to get stream URL', detail: message })
    }
  }
)

// ---------------------------------------------------------------------------
// POST /torbox/hls/start — any logged-in user, rate-limited
// Body: { torrentId: number, fileId: number, releaseName?: string }
//
// Resolves the TorBox direct link (same call /stream makes) and decides
// whether the audio needs transcoding purely from the release name (see
// hasIncompatibleAudio) — no ffprobe round-trip against the actual file.
//
// This used to also fall back to probing the file directly when the name
// was ambiguous, defaulting to "transcode" on a probe failure/timeout. That
// turned out to be too aggressive against real TorBox links (probing a
// multi-GB remote file is unreliable — slow index near EOF, network hiccups,
// etc.), and a failed probe defaulting to "transcode" was dragging otherwise
// fine 1080p streams into the transcode path and breaking them too. Deciding
// from the name alone is a network-free, instant, deterministic check with
// no failure mode of its own — anything not explicitly declaring DTS/TrueHD/
// Atmos plays exactly as it always did, direct from TorBox's CDN.
//
// Video is never re-encoded either way (`-c:v copy`) — only ever the audio.
// ---------------------------------------------------------------------------

router.post(
  '/hls/start',
  checkAuth,
  downloadRateLimiter,
  async (req: Request, res: Response) => {
    const denied = await authorizeTorboxAccess(req)
    if (denied) return res.status(denied.status).json(denied.body)

    const { torrentId, fileId, releaseName } = req.body as {
      torrentId?: number
      fileId?: number
      releaseName?: string
    }

    if (!Number.isInteger(torrentId) || !Number.isInteger(fileId)) {
      return res.status(400).json({ error: 'torrentId and fileId must be integers' })
    }

    const userIp =
      (req.headers['x-forwarded-for'] as string | undefined)?.split(',')[0]?.trim() ||
      req.socket.remoteAddress

    try {
      const result = await torbox.requestDownloadLink(torrentId as number, fileId as number, {
        userIp,
      })

      const url =
        typeof result.data === 'string'
          ? result.data
          : (result.data as { url?: string } | null)?.url

      if (!result.success || !url) {
        logger.warn('TorBox returned no URL for HLS start', { torrentId, fileId, detail: result.detail })
        return res.status(404).json({ error: result.detail || 'No stream URL available' })
      }

      const needsTranscode = !!releaseName && torbox.hasIncompatibleAudio(releaseName)

      if (!needsTranscode) {
        return res.json({ mode: 'direct', url })
      }

      const session = transcode.createHlsSession(url)
      logger.info('Started TorBox HLS audio-transcode session', {
        torrentId,
        fileId,
        sessionId: session.id,
        releaseName,
      })

      return res.json({
        mode: 'hls',
        sessionId: session.id,
        playlistUrl: `/torbox/hls/${session.id}/playlist.m3u8`,
      })
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err)
      logger.error('TorBox HLS start failed', { torrentId, fileId, error: message })
      return res.status(502).json({ error: 'Failed to start stream', detail: message })
    }
  }
)

// ---------------------------------------------------------------------------
// GET /torbox/hls/:sessionId/playlist.m3u8 — same trust tier as /mylist
// (opaque, unguessable session id stands in for auth, same as a TorBox CDN
// link) — kept header-free so both hls.js and native Safari HLS can fetch it
// directly without custom request headers.
// ---------------------------------------------------------------------------

const SESSION_ID_RE = /^[0-9a-f-]{36}$/i
const SEGMENT_NAME_RE = /^seg_\d{5}\.ts$/

router.get('/hls/:sessionId/playlist.m3u8', async (req: Request, res: Response) => {
  const { sessionId } = req.params
  if (!SESSION_ID_RE.test(sessionId)) {
    return res.status(400).json({ error: 'Invalid session id' })
  }

  const session = transcode.getSession(sessionId)
  if (!session) {
    return res.status(404).json({ error: 'Stream session not found or expired' })
  }
  if (session.error) {
    return res.status(500).json({ error: 'Transcode failed', detail: session.error })
  }

  const ready = await transcode.waitForPlaylistReady(session.dir)
  if (!ready) {
    return res.status(504).json({ error: 'Timed out waiting for stream to start' })
  }

  res.set('Content-Type', 'application/vnd.apple.mpegurl')
  res.set('Cache-Control', 'no-store')
  return res.sendFile(path.join(session.dir, 'playlist.m3u8'))
})

// ---------------------------------------------------------------------------
// GET /torbox/hls/:sessionId/:segment — one .ts segment for a session
// ---------------------------------------------------------------------------

router.get('/hls/:sessionId/:segment', async (req: Request, res: Response) => {
  const { sessionId, segment } = req.params
  if (!SESSION_ID_RE.test(sessionId) || !SEGMENT_NAME_RE.test(segment)) {
    return res.status(400).json({ error: 'Invalid session or segment id' })
  }

  const session = transcode.getSession(sessionId)
  if (!session) {
    return res.status(404).json({ error: 'Stream session not found or expired' })
  }
  if (session.error) {
    return res.status(500).json({ error: 'Transcode failed', detail: session.error })
  }

  const segmentPath = path.join(session.dir, segment)
  const ready = await transcode.waitForFile(segmentPath)
  if (!ready) {
    return res.status(404).json({ error: 'Segment not available' })
  }

  res.set('Content-Type', 'video/mp2t')
  res.set('Cache-Control', 'no-store')
  return res.sendFile(segmentPath)
})

// ---------------------------------------------------------------------------
// POST /torbox/control — admin only
// Body: { torrentId: number, operation: "pause"|"resume"|"delete"|"reannounce" }
// ---------------------------------------------------------------------------

router.post('/control', checkAuth, async (req: Request, res: Response) => {
  if (!req.admin) {
    return res.status(403).json({ error: 'Admin access required' })
  }

  const { torrentId, operation } = req.body as {
    torrentId?: number
    operation?: 'pause' | 'resume' | 'delete' | 'reannounce'
  }

  const validOps = ['pause', 'resume', 'delete', 'reannounce'] as const
  if (!torrentId || !operation || !validOps.includes(operation)) {
    return res.status(400).json({ error: 'torrentId and a valid operation are required' })
  }

  try {
    const result = await torbox.controlTorrent(torrentId, operation)
    logger.info('TorBox torrent controlled', { torrentId, operation })
    return res.json(result)
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err)
    logger.error('TorBox controlTorrent failed', { torrentId, operation, error: message })
    return res.status(502).json({ error: 'Control operation failed', detail: message })
  }
})
// ---------------------------------------------------------------------------
// GET /torbox/search?q=title[&limit=20][&cat=0] — auth + premium
//
// Queries apibay.org for hashes matching the title, then batch-checks TorBox
// cache to annotate which are instantly streamable.
//
// Cat codes: 0=all, 207=HD movies, 205=movies, 208=TV
// ---------------------------------------------------------------------------

router.get('/search', checkAuth, async (req: Request, res: Response) => {
  const denied = await authorizeTorboxAccess(req)
  if (denied) return res.status(denied.status).json(denied.body)

  const q = (req.query.q as string | undefined)?.trim()
  if (!q || q.length < 2) {
    return res.status(400).json({ error: 'Query must be at least 2 characters' })
  }

  const limit = Math.min(parseInt((req.query.limit as string) || '20', 10) || 20, 50)
  const cat = parseInt((req.query.cat as string) || '0', 10) || 0

  try {
    const result = await torbox.searchTorrents(q, limit, cat)
    return res.json(result)
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err)
    logger.error('TorBox search failed', { q, error: message })
    return res.status(502).json({ error: 'Search failed', detail: message })
  }
})

// ---------------------------------------------------------------------------
// GET /torbox/media-search?imdb=tt...&type=movie|tv&title=...[&season=&episode=][&limit=20]
//
// Like /search, but matches a specific title by IMDb id (+ season/episode
// for TV) across Comet (many indexers, reliable per-episode matching) and,
// for movies, apibay too. Used by the automatic TorBox player pane instead
// of the free-text /search endpoint.
// ---------------------------------------------------------------------------

router.get('/media-search', checkAuth, async (req: Request, res: Response) => {
  const denied = await authorizeTorboxAccess(req)
  if (denied) return res.status(denied.status).json(denied.body)

  const title = (req.query.title as string | undefined)?.trim()
  const imdbId = (req.query.imdb as string | undefined)?.trim()
  const mediaType = (req.query.type as string) === 'tv' ? 'tv' : 'movie'
  const season = req.query.season ? parseInt(req.query.season as string, 10) : undefined
  const episode = req.query.episode ? parseInt(req.query.episode as string, 10) : undefined
  const limit = Math.min(parseInt((req.query.limit as string) || '20', 10) || 20, 50)

  if (!title) {
    return res.status(400).json({ error: 'title is required' })
  }
  if (imdbId && !/^tt\d+$/.test(imdbId)) {
    return res.status(400).json({ error: 'imdb must be a valid IMDb id (e.g. tt1375666)' })
  }

  try {
    const result = await torbox.searchMediaTorrents({ title, imdbId, mediaType, season, episode, limit })
    return res.json(result)
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err)
    logger.error('TorBox media-search failed', { title, imdbId, mediaType, error: message })
    return res.status(502).json({ error: 'Search failed', detail: message })
  }
})

// ---------------------------------------------------------------------------
// POST /torbox/add-hash — auth + premium
// Body: { hash: string, name: string }
//
// Adds a torrent to TorBox by its info-hash (constructs the magnet URI).
// Used by the Search UI "Add to TorBox" button for uncached results.
// ---------------------------------------------------------------------------

router.post('/add-hash', checkAuth, async (req: Request, res: Response) => {
  const denied = await authorizeTorboxAccess(req)
  if (denied) return res.status(denied.status).json(denied.body)

  const { hash, name } = req.body as { hash?: string; name?: string }

  if (!hash || typeof hash !== 'string' || !/^[a-fA-F0-9]{40}$/i.test(hash)) {
    return res.status(400).json({ error: 'A valid 40-char hex info-hash is required' })
  }

  const magnet = `magnet:?xt=urn:btih:${hash.toLowerCase()}${name ? `&dn=${encodeURIComponent(name)}` : ''}`

  try {
    const result = await torbox.createTorrent(magnet, name)
    logger.info('TorBox torrent added via hash', { hash, name })
    return res.json(result)
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err)
    logger.error('TorBox add-hash failed', { hash, error: message })
    return res.status(502).json({ error: 'Failed to add torrent', detail: message })
  }
})

export default router
