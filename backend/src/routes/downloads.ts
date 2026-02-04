import { Router, Request } from 'express'
import { supabase } from '../lib/supabase'
import { checkJwt } from '../middleware/auth'
import { optionalAdminAuth } from '../admin/middleware'
import path from 'path'
import fs from 'fs'

const router = Router()

function getUserId(req: Request) {
  return (req as any).auth?.payload?.sub as string | undefined
}

async function isPaidUser(userId: string): Promise<boolean> {
  const { data: user } = await supabase
    .from('User')
    .select('subscriptionStatus')
    .eq('id', userId)
    .single()

  return user?.subscriptionStatus === 'active'
}

router.get('/', checkJwt, optionalAdminAuth, async (req, res) => {
  // Check if user is admin - bypass premium check
  if (req.admin) {
    console.log(`✅ Admin access granted to downloads`)

    const { data, error } = await supabase
      .from('Download')
      .select('*')
      .order('createdAt', { ascending: false })

    if (error) {
      console.error('Downloads fetch error:', error)
      return res.status(500).json({ error: 'Server error' })
    }

    return res.json(data || [])
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

  const { data, error } = await supabase
    .from('Download')
    .select('*')
    .order('createdAt', { ascending: false })

  if (error) {
    console.error('Downloads fetch error:', error)
    return res.status(500).json({ error: 'Server error' })
  }

  res.json(data || [])
})

router.get('/:id/file', checkJwt, optionalAdminAuth, async (req, res) => {
  // Check if user is admin - bypass premium check
  if (req.admin) {
    console.log(`✅ Admin file download access`)

    const { id } = req.params

    const { data: item } = await supabase
      .from('Download')
      .select('*')
      .eq('id', id)
      .single()

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

    return res.download(filePath, item.filename)
  }

  // Regular user flow - check premium status
  const userId = getUserId(req)
  if (!userId) {
    return res.status(401).json({ error: 'Unauthorized' })
  }

  const isPaid = await isPaidUser(userId)
  if (!isPaid) {
    return res.status(403).json({ error: 'Downloads are only available for premium users.' })
  }

  const { id } = req.params

  const { data: item } = await supabase
    .from('Download')
    .select('*')
    .eq('id', id)
    .single()

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
