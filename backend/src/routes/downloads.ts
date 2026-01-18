import { Router } from 'express'
import { prisma } from '../lib/prisma'
import path from 'path'
import fs from 'fs'

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
  const { id } = req.params

  const item = await prisma.download.findUnique({ where: { id } })
  if (!item) return res.status(404).json({ error: 'Not found' })

  const filePath = path.join(
    process.cwd(),
    'public',
    'downloads',
    item.filename
  )

  if (!fs.existsSync(filePath)) {
    return res.status(404).json({ error: 'File missing on server' })
  }

  res.download(filePath, item.filename)
})

export default router
