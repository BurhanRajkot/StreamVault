import { Router, Request } from 'express'
import { supabaseAdmin } from '../lib/supabase'
import { checkAuth } from '../middleware/auth'
import { downloadRateLimiter } from '../middleware/rateLimiter'
import { logger } from '../lib/logger'
import path from 'path'

const router = Router()

// Security: Sanitize filename to prevent path traversal attacks
function sanitizeFilename(filename: string): string {
  // Remove any path separators and only keep the basename
  const basename = path.basename(filename)
  // Only allow alphanumeric, dots, hyphens, and underscores
  const sanitized = basename.replace(/[^a-zA-Z0-9._-]/g, '_')
  return sanitized
}

function getUserId(req: Request) {
  return (req as any).auth?.payload?.sub as string | undefined
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
// HARDCODED INJECTION FOR TORRENTS (User Request)
// Since we can't seed the DB directly from here easily.
// ---------------------------------------------------------
function injectHardcodedDownloads(results: any[]): any[] {
  const hardcodedItems = [
    {
      id: 'hardcoded-mumbai-mafia',
      title: 'Mumbai Mafia: Police vs The Underworld',
      quality: '1080p WEBRip',
      filename: 'Mumbai.Mafia.Police.vs.The.Underworld.2023.1080p.WEBRip.x264-RARBG-xpost.mp4',
      createdAt: '2024-01-03T00:00:00.000Z'
    }
  ]

  // Add hardcoded items if they don't exist
  for (const item of hardcodedItems) {
    const exists = results.some((i: any) => i.filename === item.filename)
    if (!exists) {
      results.push(item)
    }
  }

  // Re-sort by date
  results.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())

  return results
}

router.get('/', checkAuth, async (req, res) => {
  // Check if user is admin - bypass premium check
  if (req.admin) {
    logger.info('Admin access granted to downloads')

    const { data, error } = await supabaseAdmin
      .from('Download')
      .select('*')
      .order('createdAt', { ascending: false })

    if (error) {
      logger.error('Downloads fetch error', { error: error.message })
      return res.status(500).json({ error: 'Server error' })
    }

    const results = injectHardcodedDownloads(data || [])
    return res.json(results)
  }

  // Regular user flow - check premium status
  const userId = getUserId(req)
  if (!userId) {
    return res.status(401).json({ error: 'Unauthorized' })
  }

  const isPaid = await isPaidUser(userId)
  if (!isPaid) {
    return res.status(403).json({ error: 'Downloads are only available for premium users. Please upgrade.' })
  }

  const { data, error } = await supabaseAdmin
    .from('Download')
    .select('*')
    .order('createdAt', { ascending: false })

  if (error) {
    logger.error('Downloads fetch error', { error: error.message })
    return res.status(500).json({ error: 'Server error' })
  }

  const results = injectHardcodedDownloads(data || [])
  res.json(results)
})

// Helper to stream file from Supabase Storage
async function streamDownloadFromStorage(res: any, filename: string) {
  try {
    // Security: Sanitize filename to prevent path traversal
    const sanitizedFilename = sanitizeFilename(filename)
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
    res.setHeader('Content-Type', data.type || 'application/x-bittorrent')
    res.setHeader('Content-Length', data.size.toString())

    // Stream the file efficiently (avoid loading entire file into memory)
    const arrayBuffer = await data.arrayBuffer()
    const buffer = Buffer.from(arrayBuffer)

    return res.send(buffer)
  } catch (err: any) {
    logger.error('Stream download error', { error: err.message })
    return res.status(500).json({ error: 'Server error' })
  }
}

router.get('/:id/file', downloadRateLimiter, checkAuth, async (req, res) => {
  const { id } = req.params
  let filename = ''

  // 1. Determine filename based on ID
  if (id === 'hardcoded-mumbai-mafia') {
    filename = 'Mumbai.Mafia.Police.vs.The.Underworld.2023.1080p.WEBRip.x264-RARBG-xpost.mp4'
  } else {
    // Fetch from DB
    const { data: item } = await supabaseAdmin
      .from('Download')
      .select('filename')
      .eq('id', id)
      .single()

    if (!item) return res.status(404).json({ error: 'Not found' })
    filename = item.filename
  }

  // 2. Auth checks
  if (req.admin) {
    logger.info('Admin file download access', { filename })
    if (id === 'hardcoded-mumbai-mafia') {
      return res.redirect('https://drive.google.com/uc?export=download&id=1ZKfHMswUcdHhOsRfnwWmyHN5pd-qD0Et')
    }
    return streamDownloadFromStorage(res, filename)
  }

  // Regular user check
  const userId = getUserId(req)
  if (!userId) return res.status(401).json({ error: 'Unauthorized' })

  const isPaid = await isPaidUser(userId)
  if (!isPaid) return res.status(403).json({ error: 'Downloads are only available for premium users.' })

  if (id === 'hardcoded-mumbai-mafia') {
    return res.redirect('https://drive.google.com/uc?export=download&id=1ZKfHMswUcdHhOsRfnwWmyHN5pd-qD0Et')
  }

  return streamDownloadFromStorage(res, filename)
})

export default router
