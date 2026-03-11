import { Router, Request, Response } from 'express'
import * as cache from '../services/cache'
import { logger } from '../lib/logger'
import { hybridSearch } from '../cinematch/search/hybridSearch'
import { withTmdbRateLimit } from '../services/tmdbLimiter'

const router = Router()

const TMDB_API_KEY = process.env.VITE_TMDB_API_KEY
const TMDB_BASE_URL = 'https://api.themoviedb.org/3'

if (!TMDB_API_KEY) {
  throw new Error('CRITICAL: VITE_TMDB_API_KEY environment variable is not set. Server cannot start without it.')
}

/**
 * Fetch from TMDB with caching, retry logic, and rate limit handling
 */
async function fetchTMDB(endpoint: string, retries = 3): Promise<any> {
  const cacheKey = cache.generateCacheKey('tmdb', endpoint)
  const cached = await cache.tmdb.get(cacheKey)

  if (cached) {
    return cached
  }

  const url = `${TMDB_BASE_URL}${endpoint}${endpoint.includes('?') ? '&' : '?'}api_key=${TMDB_API_KEY}`

  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      const response = await fetch(url)

      // Handle rate limiting (429 Too Many Requests)
      if (response.status === 429) {
        const isLastAttempt = attempt === retries

        if (!isLastAttempt) {
          // Exponential backoff for rate limits: 5s, 10s, 20s
          const delay = Math.min(5000 * Math.pow(2, attempt - 1), 20000)
          logger.warn('TMDB rate limit hit, backing off', {
            attempt,
            maxRetries: retries,
            delayMs: delay,
            endpoint
          })
          await new Promise(resolve => setTimeout(resolve, delay))
          continue
        } else {
          logger.error('TMDB rate limit exceeded, max retries reached', { endpoint })
          // Return empty data instead of crashing
          return { results: [], total_pages: 0 }
        }
      }

      if (!response.ok) {
        const errorText = await response.text()
        logger.error('TMDB API error', { status: response.status, error: errorText, endpoint })
        throw new Error(`TMDB API error: ${response.status} ${response.statusText}`)
      }

      const data = await response.json()
      // Extended cache TTL to 2 hours to reduce API calls
      await cache.tmdb.set(cacheKey, data, 7200)
      return data
    } catch (error: any) {
      const isLastAttempt = attempt === retries
      const isConnectionError = error?.code === 'ECONNRESET' || error?.errno === 0

      if (isConnectionError && !isLastAttempt) {
        // Wait before retrying (exponential backoff, max 3s)
        const delay = Math.min(1000 * Math.pow(2, attempt - 1), 3000)
        logger.warn('TMDB connection reset, retrying', { attempt, maxRetries: retries, delayMs: delay })
        await new Promise(resolve => setTimeout(resolve, delay))
        continue
      }

      logger.error('TMDB fetch error', { endpoint, error: error.message || error })

      // Last attempt failed - return empty data gracefully
      if (isLastAttempt) {
        return { results: [], total_pages: 0 }
      }

      throw error
    }
  }

  // Fallback (should never reach here)
  return { results: [], total_pages: 0 }
}

/**
 * GET /tmdb/discover/:mediaType
 * Fetch popular media (movies/tv)
 */
router.get('/discover/:mediaType', async (req: Request, res: Response) => {
  const { mediaType } = req.params
  const page = req.query.page || '1'
  const with_watch_providers = req.query.with_watch_providers as string
  const watch_region = req.query.watch_region || 'IN'

  const sort_by = req.query.sort_by || 'popularity.desc'

  if (mediaType !== 'movie' && mediaType !== 'tv') {
    return res.status(400).json({ error: 'Invalid media type' })
  }

  try {
    let url = `/discover/${mediaType}?sort_by=${sort_by}&page=${page}`

    if (with_watch_providers) {
      url += `&with_watch_providers=${with_watch_providers}&watch_region=${watch_region}`
    }

    // Forward additional filters
    const validParams = [
        'vote_count.gte',
        'primary_release_date.lte',
        'primary_release_date.gte',
        'first_air_date.lte',
        'first_air_date.gte',
        'with_watch_monetization_types',
        'with_genres'
    ]

    validParams.forEach(param => {
        if (req.query[param]) {
            url += `&${param}=${req.query[param]}`
        }
    })

    const data = await fetchTMDB(url)
    // Stale-while-revalidate: serve cached version instantly, update in background
    res.setHeader('Cache-Control', 'public, max-age=1800, stale-while-revalidate=3600') // 30min cache, 1hr stale
    res.json(data)
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch popular media' })
  }
})

/**
 * GET /tmdb/trending/:mediaType using this for the pupose of getting files and other things
 * Fetch trending media
 */
router.get('/trending/:mediaType', async (req: Request, res: Response) => {
  const { mediaType } = req.params

  if (mediaType !== 'movie' && mediaType !== 'tv') {
    return res.status(400).json({ error: 'Invalid media type' })
  }

  try {
    const data = await fetchTMDB(`/trending/${mediaType}/week`)
    res.setHeader('Cache-Control', 'public, max-age=1800, stale-while-revalidate=3600')
    res.json(data)
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch trending media' })
  }
})

/**
 * GET /tmdb/search/hybrid
 * BM25 + TMDB multi-search with hybrid scoring (relevance + popularity blend)
 * This is the upgraded search route for the CineMatch discovery engine.
 */
router.get('/search/hybrid', async (req: Request, res: Response) => {
  const query = req.query.query as string
  const page = parseInt((req.query.page as string) || '1', 10)
  const mediaOnly = req.query.mediaOnly === 'true'
  const mediaType = req.query.mediaType as 'movie' | 'tv' | undefined

  if (!query || query.trim().length === 0) {
    return res.status(400).json({ error: 'Query parameter required' })
  }

  if (mediaType && mediaType !== 'movie' && mediaType !== 'tv') {
    return res.status(400).json({ error: 'mediaType must be movie or tv' })
  }

  try {
    const results = await hybridSearch({ query: query.trim(), page, mediaOnly, mediaType })
    res.setHeader('Cache-Control', 'public, max-age=300, stale-while-revalidate=900')
    res.json({ results, total_results: results.length, query })
  } catch (error: any) {
    logger.error('Hybrid search error', { error: error.message, query })
    res.status(500).json({ error: 'Hybrid search failed' })
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
    res.setHeader('Cache-Control', 'public, max-age=900, stale-while-revalidate=1800') // 15min cache, 30min stale
    res.json(data)
  } catch (error) {
    res.status(500).json({ error: 'Failed to search media' })
  }
})

/**
 * GET /tmdb/:mediaType/:id/videos
 * Get videos (trailers, teasers, etc.) for a specific media item
 */
router.get('/:mediaType/:id/videos', async (req: Request, res: Response) => {
  const { mediaType, id } = req.params

  if (mediaType !== 'movie' && mediaType !== 'tv') {
    return res.status(400).json({ error: 'Invalid media type' })
  }

  const parsedId = Number(id)
  if (!Number.isInteger(parsedId) || parsedId <= 0 || parsedId > 100_000_000) {
    return res.status(400).json({ error: 'Invalid media id: must be a positive integer' })
  }

  try {
    const data = await fetchTMDB(`/${mediaType}/${parsedId}/videos`)
    res.setHeader('Cache-Control', 'public, max-age=3600, stale-while-revalidate=7200')
    res.json(data)
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch videos' })
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

  // Validate id is a safe positive integer to prevent path injection
  const parsedId = Number(id)
  if (!Number.isInteger(parsedId) || parsedId <= 0 || parsedId > 100_000_000) {
    return res.status(400).json({ error: 'Invalid media id: must be a positive integer' })
  }

  try {
    let url = `/${mediaType}/${parsedId}`
    const queryParts: string[] = []

    if (req.query.append_to_response) {
      queryParts.push(`append_to_response=${req.query.append_to_response}`)
    }
    if (req.query.include_image_language) {
      queryParts.push(`include_image_language=${req.query.include_image_language}`)
    }

    if (queryParts.length > 0) {
      url += `?${queryParts.join('&')}`
    }

    const data = await fetchTMDB(url)
    res.setHeader('Cache-Control', 'public, max-age=7200, stale-while-revalidate=14400') // 2hr cache, 4hr stale
    res.json(data)
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch media details' })
  }
})

/**
 * GET /tmdb/:mediaType/:id/watch/providers
 * Get watch providers for a specific media item
 */
router.get('/:mediaType/:id/watch/providers', async (req: Request, res: Response) => {
  const { mediaType, id } = req.params

  if (mediaType !== 'movie' && mediaType !== 'tv') {
    return res.status(400).json({ error: 'Invalid media type' })
  }

  // Validate id is a safe positive integer to prevent path injection
  const parsedId = Number(id)
  if (!Number.isInteger(parsedId) || parsedId <= 0 || parsedId > 100_000_000) {
    return res.status(400).json({ error: 'Invalid media id: must be a positive integer' })
  }

  try {
    const data = await fetchTMDB(`/${mediaType}/${parsedId}/watch/providers`)
    res.setHeader('Cache-Control', 'public, max-age=3600, stale-while-revalidate=7200') // 1hr cache, 2hr stale
    res.json(data)
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch watch providers' })
  }
})

/**
 * GET /tmdb/tv/:id/seasons
 * Get TV show seasons
 */
router.get('/tv/:id/seasons', async (req: Request, res: Response) => {
  const { id } = req.params

  // Validate id is a safe positive integer to prevent path injection
  const parsedId = Number(id)
  if (!Number.isInteger(parsedId) || parsedId <= 0 || parsedId > 100_000_000) {
    return res.status(400).json({ error: 'Invalid media id: must be a positive integer' })
  }

  try {
    const cacheKey = cache.generateCacheKey('seasons', String(parsedId))
    const cached = await cache.seasons.get(cacheKey)

    if (cached) {
      res.setHeader('X-Cache', 'HIT')
      return res.json(cached)
    }

    const data = await fetchTMDB(`/tv/${parsedId}`)
    const seasons = data.seasons?.filter((s: any) => s.season_number > 0) || []

    await cache.seasons.set(cacheKey, seasons, 7200) // 2 hours TTL
    res.setHeader('X-Cache', 'MISS')
    res.setHeader('Cache-Control', 'public, max-age=3600, stale-while-revalidate=7200') // 1hr cache, 2hr stale
    res.json(seasons)
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch seasons' })
  }
})

/**
 * POST /tmdb/continue-watching-details
 * BFF (Backend-For-Frontend) endpoint to aggregating TMDB details
 * for multiple continue watching items in a single request,
 * eliminating the N+1 fetch bottleneck on the client side.
 */
router.post('/continue-watching-details', async (req: Request, res: Response) => {
  const items = req.body
  const MAX_BATCH_SIZE = 20

  if (!Array.isArray(items)) {
    return res.status(400).json({ error: 'Body must be an array of progress items' })
  }
  if (items.length > MAX_BATCH_SIZE) {
    return res.status(400).json({ error: `Body must contain at most ${MAX_BATCH_SIZE} items` })
  }

  try {
    // We wrap fetchTMDB with our bottleneck instance to protect against 429 errors from TMDB
    const safeFetchTMDB = withTmdbRateLimit(fetchTMDB)

    // Using Promise.all here is safe because Bottleneck controls the actual execution concurrency!
    const resolvedItems = await Promise.all(
      items.map(async (item) => {
        const tmdbId = Number(item?.tmdbId)
        const mediaType = item?.mediaType

        if (!Number.isInteger(tmdbId) || tmdbId <= 0) return null
        if (mediaType !== 'movie' && mediaType !== 'tv') return null

        try {
          const tmdbData = await safeFetchTMDB(`/${mediaType}/${tmdbId}`)
          return {
            media: tmdbData,
            item,
          }
        } catch (err: any) {
          logger.warn(`Failed to fetch tmdb details for ${mediaType} ${tmdbId}:`, { error: err.message || err })
          return null
        }
      })
    )

    // Filter out any failed fetches and return
    res.json(resolvedItems.filter(Boolean))
  } catch (error: any) {
    logger.error('Failed to batch fetch continue watching details', { error: error.message || error })
    res.status(500).json({ error: 'Server error fetching aggregated media' })
  }
})

export default router
