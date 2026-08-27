import { Router, Request, Response } from 'express'
import { supabaseAdmin } from '../lib/supabase'
import { checkAuth } from '../middleware/auth'
import { downloadRateLimiter } from '../middleware/rateLimiter'
import { logger } from '../lib/logger'
import { getUserId } from '../utils/auth'
import path from 'path'
import { Readable } from 'stream'
import { pipeline } from 'stream/promises'
import type { ReadableStream as NodeReadableStream } from 'stream/web'

/** A single download record (from DB or seeded) */
interface DownloadItem {
  id: string
  title?: string
  quality?: string
  filename: string
  createdAt: string
  /** When set, the file is served by redirecting here instead of from Supabase Storage. */
  externalUrl?: string
  [key: string]: unknown
}

const router = Router()

// Security: Sanitize filename to prevent path traversal attacks
function sanitizeFilename(filename: string): string {
  // Reject any filename containing path traversal sequences explicitly
  if (filename.includes('..') || filename.includes('/') || filename.includes('\\')) {
    throw new Error('Invalid filename: Path traversal detected')
  }

  // Remove any path separators and only keep the basename (defense in depth)
  const basename = path.basename(filename)

  // Only allow alphanumeric, dots, hyphens, and underscores
  let sanitized = basename.replace(/[^a-zA-Z0-9._-]/g, '_')

  // Fallback to safe default if string becomes empty after sanitization
  // or if the string only contains safe characters like underscores/hyphens/dots but no actual name
  if (!sanitized || sanitized.replace(/[._-]/g, '').length === 0) {
    sanitized = 'download_file'
  }

  return sanitized
}

async function isPaidUser(userId: string): Promise<boolean> {
  const { data: user } = await supabaseAdmin
    .from('User')
    .select('subscriptionStatus')
    .eq('id', userId)
    .single()

  return user?.subscriptionStatus === 'active'
}

// ---------------------------------------------------------
// SEEDED CATALOGUE ENTRIES
//
// These titles are not in the Download table yet. They are merged into the
// listing at read time so the catalogue is not empty, and they go through the
// exact same auth + premium checks as database-backed rows.
//
// This belongs in a seed migration against the Download table; until then it
// lives here as the single source for these entries.
// ---------------------------------------------------------
const SEEDED_DOWNLOADS: readonly DownloadItem[] = [
  {
    id: 'seed-mumbai-mafia',
    title: 'Mumbai Mafia: Police vs The Underworld',
    quality: '1080p WEBRip',
    filename: 'Mumbai.Mafia.Police.vs.The.Underworld.2023.1080p.WEBRip.x264-RARBG-xpost.mp4',
    createdAt: '2024-01-03T00:00:00.000Z',
    externalUrl: 'https://drive.google.com/uc?export=download&id=1ZKfHMswUcdHhOsRfnwWmyHN5pd-qD0Et',
  },
]

/** Merge seeded entries into DB results, newest first. */
function withSeededDownloads(results: DownloadItem[]): DownloadItem[] {
  const merged = [...results]

  for (const item of SEEDED_DOWNLOADS) {
    if (!merged.some((i) => i.filename === item.filename)) {
      merged.push(item)
    }
  }

  return merged.sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
  )
}

/** Fetch the full download catalogue (DB rows + seeded entries). */
async function listDownloads(): Promise<DownloadItem[]> {
  const { data, error } = await supabaseAdmin
    .from('Download')
    .select('*')
    .order('createdAt', { ascending: false })

  if (error) {
    logger.error('Downloads fetch error', { error: error.message })
    throw new Error('Failed to load downloads')
  }

  return withSeededDownloads(data || [])
}

/**
 * Authorise a request for download content.
 * Admins bypass the paywall; everyone else needs an active subscription.
 * Returns null when allowed, or the response to send when denied.
 */
async function authorizeDownloadAccess(
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
      body: { error: 'Downloads are only available for premium users. Please upgrade.' },
    }
  }

  return null
}

router.get('/', checkAuth, async (req, res) => {
  const denied = await authorizeDownloadAccess(req)
  if (denied) {
    return res.status(denied.status).json(denied.body)
  }

  try {
    return res.json(await listDownloads())
  } catch {
    return res.status(500).json({ error: 'Server error' })
  }
})

// Helper to stream file from Supabase Storage
async function streamDownloadFromStorage(res: Response, filename: string) {
  try {
    // Security: Sanitize filename to prevent path traversal
    let sanitizedFilename: string
    try {
      sanitizedFilename = sanitizeFilename(filename)
    } catch (sanitizeErr) {
      logger.warn('Invalid filename requested', {
        filename,
        error: sanitizeErr instanceof Error ? sanitizeErr.message : String(sanitizeErr)
      })
      return res.status(400).json({ error: 'Invalid filename' })
    }

    logger.info('File download requested', { filename: sanitizedFilename })

    const { data, error } = await supabaseAdmin.storage
      .from('downloads')
      .download(sanitizedFilename)

    if (error) {
      logger.error('Supabase storage download error', { error: error.message, filename: sanitizedFilename })
      return res.status(404).json({ error: 'File not found' })
    }

    if (!data) {
      return res.status(404).json({ error: 'File data is empty' })
    }

    // Set headers for download
    res.setHeader('Content-Disposition', `attachment; filename="${sanitizedFilename}"`)
    res.setHeader('Content-Type', data.type || 'application/octet-stream')
    res.setHeader('Content-Length', data.size.toString())

    // Pipe the blob straight through. Buffering via arrayBuffer() would hold the
    // whole file in memory, so a handful of concurrent multi-GB downloads could
    // exhaust the container's heap.
    // The runtime value is a web ReadableStream; the DOM and node:stream/web
    // declarations of that type just aren't structurally compatible.
    const webStream = data.stream() as unknown as NodeReadableStream<Uint8Array>
    await pipeline(Readable.fromWeb(webStream), res)
  } catch (err: unknown) {
    logger.error('Stream download error', { error: err instanceof Error ? err.message : String(err) })
    // Headers are already flushed once piping starts; tearing down the socket is
    // the only way left to signal failure.
    if (res.headersSent) {
      res.destroy()
      return
    }
    res.status(500).json({ error: 'Server error' })
  }
}

router.get('/:id/file', downloadRateLimiter, checkAuth, async (req, res) => {
  const { id } = req.params

  // 1. Authorise BEFORE resolving the file. Every download — seeded or
  //    database-backed — goes through the same paywall.
  const denied = await authorizeDownloadAccess(req)
  if (denied) {
    return res.status(denied.status).json(denied.body)
  }

  // 2. Resolve the item
  const seeded = SEEDED_DOWNLOADS.find((item) => item.id === id)
  let item: Pick<DownloadItem, 'filename' | 'externalUrl'> | null = seeded ?? null

  if (!item) {
    const { data } = await supabaseAdmin
      .from('Download')
      .select('filename')
      .eq('id', id)
      .single()

    item = data ?? null
  }

  if (!item) return res.status(404).json({ error: 'Not found' })

  // 3. Deliver
  if (item.externalUrl) {
    logger.info('Redirecting to external download host', { id })
    return res.redirect(302, item.externalUrl)
  }

  return streamDownloadFromStorage(res, item.filename)
})

export default router
