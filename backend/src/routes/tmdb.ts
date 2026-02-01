import { Router, Request, Response } from 'express'
import * as cache from '../services/cache'

const router = Router()

const TMDB_API_KEY = process.env.VITE_TMDB_API_KEY || '668a0dd95d2a554867a2c610467fb934'
const TMDB_BASE_URL = 'https://api.themoviedb.org/3'

/**
 * Fetch from TMDB with caching and retry logic
 */
async function fetchTMDB(endpoint: string, retries = 2): Promise<any> {
  const cacheKey = cache.generateCacheKey('tmdb', endpoint)
  const cached = cache.tmdb.get(cacheKey)

  if (cached) {
    return cached
  }

  const url = `${TMDB_BASE_URL}${endpoint}${endpoint.includes('?') ? '&' : '?'}api_key=${TMDB_API_KEY}`

  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      const response = await fetch(url)
      if (!response.ok) {
        throw new Error(`TMDB API error: ${response.statusText}`)
      }

      const data = await response.json()
      cache.tmdb.set(cacheKey, data, 600) // 10 minutes TTL (increased from 5)
      return data
    } catch (error: any) {
      const isLastAttempt = attempt === retries
      const isConnectionError = error?.code === 'ECONNRESET' || error?.errno === 0

      if (isConnectionError && !isLastAttempt) {
        // Wait before retrying (exponential backoff, max 2s)
        const delay = Math.min(500 * Math.pow(2, attempt - 1), 2000)
        console.log(`🔄 TMDB connection reset, retrying in ${delay}ms (attempt ${attempt}/${retries})`)
        await new Promise(resolve => setTimeout(resolve, delay))
        continue
      }

      console.error('TMDB fetch error:', error)
      throw error
    }
  }
}

/**
 * GET /tmdb/discover/:mediaType
 * Fetch popular media (movies/tv)
 */
router.get('/discover/:mediaType', async (req: Request, res: Response) => {
  const { mediaType } = req.params
  const page = req.query.page || '1'

  if (mediaType !== 'movie' && mediaType !== 'tv') {
    return res.status(400).json({ error: 'Invalid media type' })
  }

  try {
    const data = await fetchTMDB(`/discover/${mediaType}?sort_by=popularity.desc&page=${page}`)
    res.setHeader('Cache-Control', 'public, max-age=600') // 10 minutes
    res.json(data)
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch popular media' })
  }
})

/**
 * GET /tmdb/trending/:mediaType
 * Fetch trending media
 */
router.get('/trending/:mediaType', async (req: Request, res: Response) => {
  const { mediaType } = req.params

  if (mediaType !== 'movie' && mediaType !== 'tv') {
    return res.status(400).json({ error: 'Invalid media type' })
  }

  try {
    const data = await fetchTMDB(`/trending/${mediaType}/week`)
    res.setHeader('Cache-Control', 'public, max-age=600')
    res.json(data)
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch trending media' })
  }
})

/**
 * GET /tmdb/search/:mediaType
 * Search media
 */
router.get('/search/:mediaType', async (req: Request, res: Response) => {
  const { mediaType } = req.params
  const query = req.query.query as string
  const page = req.query.page || '1'

  if (!query) {
    return res.status(400).json({ error: 'Query parameter required' })
  }

  if (mediaType !== 'movie' && mediaType !== 'tv') {
    return res.status(400).json({ error: 'Invalid media type' })
  }

  try {
    const data = await fetchTMDB(`/search/${mediaType}?query=${encodeURIComponent(query)}&page=${page}`)
    res.setHeader('Cache-Control', 'public, max-age=300')
    res.json(data)
  } catch (error) {
    res.status(500).json({ error: 'Failed to search media' })
  }
})

/**
 * GET /tmdb/:mediaType/:id
 * Get media details
 */
router.get('/:mediaType/:id', async (req: Request, res: Response) => {
  const { mediaType, id } = req.params

  if (mediaType !== 'movie' && mediaType !== 'tv') {
    return res.status(400).json({ error: 'Invalid media type' })
  }

  try {
    const data = await fetchTMDB(`/${mediaType}/${id}`)
    res.setHeader('Cache-Control', 'public, max-age=7200') // 2 hours for details
    res.json(data)
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch media details' })
  }
})

/**
 * GET /tmdb/tv/:id/seasons
 * Get TV show seasons
 */
router.get('/tv/:id/seasons', async (req: Request, res: Response) => {
  const { id } = req.params

  try {
    const cacheKey = cache.generateCacheKey('seasons', id)
    const cached = cache.seasons.get(cacheKey)

    if (cached) {
      res.setHeader('X-Cache', 'HIT')
      return res.json(cached)
    }

    const data = await fetchTMDB(`/tv/${id}`)
    const seasons = data.seasons?.filter((s: any) => s.season_number > 0) || []

    cache.seasons.set(cacheKey, seasons, 7200) // 2 hours TTL
    res.setHeader('X-Cache', 'MISS')
    res.setHeader('Cache-Control', 'public, max-age=3600')
    res.json(seasons)
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch seasons' })
  }
})

export default router
