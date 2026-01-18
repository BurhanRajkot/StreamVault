import { Router } from 'express'
import path from 'path'
import fs from 'fs'
import { prisma } from '../lib/prisma'

const router = Router()

// GET all downloads
router.get('/', async (_req, res) => {
  const downloads = await prisma.download.findMany({
    orderBy: { createdAt: 'desc' },
  })
  res.json(downloads)
})

// DOWNLOAD file
router.get('/:id/file', async (req, res) => {
  const download = await prisma.download.findUnique({
    where: { id: req.params.id },
  })

  if (!download) return res.status(404).json({ error: 'Not found' })

  const filePath = path.join(
    process.cwd(),
    'public',
    'downloads',
    download.filename
  )

  if (!fs.existsSync(filePath)) {
    return res.status(404).json({ error: 'File missing' })
  }

  res.download(filePath)
})

export default router
