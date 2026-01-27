import { Router } from 'express'
import { supabase } from '../lib/supabase'
import { checkJwt } from '../middleware/auth'

const router = Router()

router.get('/', checkJwt, async (req, res) => {
  const userId = req.auth?.payload.sub
  if (!userId) {
    return res.status(401).json({ error: 'Unauthorized' })
  }

  const { data, error } = await supabase
    .from('ContinueWatching')
    .select('*')
    .eq('userId', userId)
    .order('updatedAt', { ascending: false })
    .limit(20)

  if (error) {
    console.error('Continue watching fetch error:', error)
    return res.status(500).json({ error: 'Server error' })
  }

  res.json(data || [])
})

router.post('/', checkJwt, async (req, res) => {
  const userId = req.auth?.payload.sub
  if (!userId) {
    return res.status(401).json({ error: 'Unauthorized' })
  }

  const { tmdbId, mediaType, season, episode, progress } = req.body

  if (!tmdbId || !mediaType || progress === undefined) {
    return res.status(400).json({ error: 'Missing required fields' })
  }

  const { data: existing } = await supabase
    .from('ContinueWatching')
    .select('id')
    .eq('userId', userId)
    .eq('tmdbId', tmdbId)
    .eq('mediaType', mediaType)
    .single()

  let result
  if (existing) {
    const { data, error } = await supabase
      .from('ContinueWatching')
      .update({
        season,
        episode,
        progress,
        updatedAt: new Date().toISOString(),
      })
      .eq('id', existing.id)
      .select()
      .single()

    if (error) {
      console.error('Continue watching update error:', error)
      return res.status(500).json({ error: 'Server error' })
    }
    result = data
  } else {
    const { data, error } = await supabase
      .from('ContinueWatching')
      .insert({
        userId,
        tmdbId,
        mediaType,
        season,
        episode,
        progress,
        updatedAt: new Date().toISOString(),
      })
      .select()
      .single()

    if (error) {
      console.error('Continue watching create error:', error)
      return res.status(500).json({ error: 'Server error' })
    }
    result = data
  }

  res.json(result)
})

router.delete('/:tmdbId/:mediaType', checkJwt, async (req, res) => {
  const userId = req.auth?.payload.sub
  const tmdbId = Number(req.params.tmdbId)
  const mediaType = req.params.mediaType

  if (!userId || !tmdbId || !mediaType) {
    return res.status(400).json({ error: 'Invalid request' })
  }

  const { error } = await supabase
    .from('ContinueWatching')
    .delete()
    .eq('userId', userId)
    .eq('tmdbId', tmdbId)
    .eq('mediaType', mediaType)

  if (error) {
    console.error('Continue watching delete error:', error)
    return res.status(500).json({ error: 'Server error' })
  }

  res.json({ success: true })
})

export default router
