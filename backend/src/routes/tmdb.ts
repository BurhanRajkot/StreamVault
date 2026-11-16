import { Router, Request, Response } from 'express'
import * as cache from '../services/cache'
import { logger } from '../lib/logger'
import { hybridSearch, normalizeTitle } from '../cinematch/search/hybridSearch'
import { resolveSearchEntity, type ResolvedEntity } from '../cinematch/search/entitySearch'
import { getNetflixTop10 } from '../lib/netflixTop10'
import { globalTrie } from '../cinematch/search/trieAutocomplete'
import { withTmdbRateLimit } from '../services/tmdbLimiter'
import { TMDB_BASE_URL } from '../lib/tmdbBase'
import { tmdbFetch } from '../lib/tmdbFetch'

const router = Router()

const TMDB_API_KEY = process.env.TMDB_API_KEY || process.env.VITE_TMDB_API_KEY

if (!TMDB_API_KEY) {
  throw new Error('CRITICAL: TMDB_API_KEY (or legacy VITE_TMDB_API_KEY) environment variable is not set. Server cannot start without it.')
}

/** TMDB caps discover/search paging at 500. */
const MAX_PAGE = 500
/** Trie (autocomplete) hits that make a full first page on their own. */
const TRIE_FULL_PAGE = 12

/** Upper bound on a single upstream TMDB request. */
const TMDB_TIMEOUT_MS = Number(process.env.TMDB_TIMEOUT_MS || 8000)

const DEFAULT_SORT_BY = 'popularity.desc'

/** Allowlist of TMDB discover sort keys the client may request. */
const ALLOWED_SORT_BY = new Set([
  'popularity.asc', 'popularity.desc',
  'revenue.asc', 'revenue.desc',
  'primary_release_date.asc', 'primary_release_date.desc',
  'first_air_date.asc', 'first_air_date.desc',
  'release_date.asc', 'release_date.desc',
  'original_title.asc', 'original_title.desc',
  'vote_average.asc', 'vote_average.desc',
  'vote_count.asc', 'vote_count.desc',
])

const DATE = /^\d{4}-\d{2}-\d{2}$/
/** Comma (AND) or pipe (OR) separated numeric ids: genres, companies, keywords, types. */
const ID_LIST = /^\d{1,9}([,|]\d{1,9}){0,19}$/
const COUNTRY = /^[A-Z]{2}$/
const LANGUAGE = /^[a-z]{2}$/
const NUMBER = /^\d{1,6}(\.\d{1,2})?$/

/** The TMDB discover filters the client may pass through, with the shape each must have. */
const DISCOVER_FILTERS: Array<[string, RegExp]> = [
  ['vote_count.gte', NUMBER],
  ['vote_average.gte', NUMBER],
  ['primary_release_date.lte', DATE],
  ['primary_release_date.gte', DATE],
  ['first_air_date.lte', DATE],
  ['first_air_date.gte', DATE],
  // TV: shows with an episode airing in this window — "still on the air"
  ['air_date.lte', DATE],
  ['air_date.gte', DATE],
  ['with_watch_monetization_types', /^(flatrate|free|ads|rent|buy)([|,](flatrate|free|ads|rent|buy)){0,4}$/],
  ['with_genres', ID_LIST],
  ['without_genres', ID_LIST],
  ['with_companies', ID_LIST],
  ['with_keywords', ID_LIST],
  ['with_networks', ID_LIST],
  // TV: 0 documentary, 1 news, 2 miniseries, 3 reality, 4 scripted, 5 talk show, 6 video
  ['with_type', /^[0-6]([|,][0-6]){0,6}$/],
  // The Anime tab: Japanese-language animation (with_genres=16 + ja)
  ['with_original_language', LANGUAGE],
  ['with_origin_country', COUNTRY],
]

/**
 * Express parses `?a=1&a=2` into an array and `?a[b]=1` into an object.
 * Collapse either to a single string so callers can't smuggle structured
 * values into places that expect a scalar.
 */
function firstString(value: unknown): string | undefined {
  if (typeof value === 'string') return value || undefined
  if (Array.isArray(value) && typeof value[0] === 'string') return value[0] || undefined
  return undefined
}

/** Returns the validated page number, or null when the input is unusable. */
function parsePage(value: unknown): number | null {
  const raw = firstString(value)
  if (raw === undefined) return 1

  const page = Number(raw)
  if (!Number.isInteger(page) || page < 1 || page > MAX_PAGE) return null
  return page
}

/**
 * The actual upstream network call — this is the only part that needs to be
 * rate-limited. Wrapping fetchTMDB() itself (cache check included) meant
 * cache HITS were also serialized behind Bottleneck's 250ms dispatch pacing,
 * so e.g. 20 fully-cached continue-watching items took ~5s of pure artificial
 * delay for zero network calls. Only gate the real request.
 */
const rateLimitedNetworkFetch = withTmdbRateLimit((url: string) =>
  tmdbFetch(url, { signal: AbortSignal.timeout(TMDB_TIMEOUT_MS) })
)

/**
 * Fetch from TMDB with caching, retry logic, and rate limit handling
 */
async function fetchTMDB(endpoint: string, retries = 3): Promise<unknown> {
  const cacheKey = cache.generateCacheKey('tmdb', endpoint)
  const cached = await cache.tmdb.get(cacheKey)

  if (cached) {
    return cached
  }

  const url = `${TMDB_BASE_URL}${endpoint}${endpoint.includes('?') ? '&' : '?'}api_key=${TMDB_API_KEY}`

  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      // Without a deadline a stalled upstream connection pins an Express
      // handler (and its TMDB rate-limit slot) open indefinitely.
      const response = await rateLimitedNetworkFetch(url)

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
    } catch (error: unknown) {
      const isLastAttempt = attempt === retries
      const errObj = error as Record<string, unknown>
      const isConnectionError = errObj?.code === 'ECONNRESET' || errObj?.errno === 0 || (errObj?.message && typeof errObj.message === 'string' && errObj.message.includes('socket connection was closed unexpectedly'))

      if (isConnectionError && !isLastAttempt) {
        // Wait before retrying (exponential backoff, max 3s)
        const delay = Math.min(1000 * Math.pow(2, attempt - 1), 3000)
        logger.warn('TMDB connection reset, retrying', { attempt, maxRetries: retries, delayMs: delay })
        await new Promise(resolve => setTimeout(resolve, delay))
        continue
      }

      logger.error('TMDB fetch error', { endpoint, error: error instanceof Error ? error.message : String(error) })

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

  if (mediaType !== 'movie' && mediaType !== 'tv') {
    return res.status(400).json({ error: 'Invalid media type' })
  }

  const page = parsePage(req.query.page)
  if (page === null) {
    return res.status(400).json({ error: 'page must be an integer between 1 and 500' })
  }

  const sortBy = String(req.query.sort_by ?? DEFAULT_SORT_BY)
  if (!ALLOWED_SORT_BY.has(sortBy)) {
    return res.status(400).json({ error: 'Unsupported sort_by value' })
  }

  try {
    // URLSearchParams encodes every value, so a caller can't smuggle extra
    // upstream parameters (`&include_adult=true`, `&api_key=…`) through one of
    // these fields, nor mint unbounded distinct cache keys.
    const params = new URLSearchParams({ sort_by: sortBy, page: String(page) })

    const watchProviders = firstString(req.query.with_watch_providers)
    if (watchProviders) {
      params.set('with_watch_providers', watchProviders)
      params.set('watch_region', firstString(req.query.watch_region) || 'IN')
    }

    // Forward additional filters — each checked against the shape TMDB
    // expects, so a caller can't mint unbounded distinct cache keys.
    for (const [param, shape] of DISCOVER_FILTERS) {
      const value = firstString(req.query[param])
      if (!value) continue
      if (!shape.test(value)) {
        return res.status(400).json({ error: `Invalid ${param}` })
      }
      params.set(param, value)
    }
    // Monetization ("flatrate") needs a region even without a provider list
    if (params.has('with_watch_monetization_types') && !params.has('watch_region')) {
      const region = firstString(req.query.watch_region)
      if (region && COUNTRY.test(region)) params.set('watch_region', region)
    }

    const data = await fetchTMDB(`/discover/${mediaType}?${params.toString()}`)
    // Stale-while-revalidate: serve cached version instantly, update in background
    // 1hr browser cache, 6hr stale window — CDN can serve without hitting backend
    res.setHeader('Cache-Control', 'public, max-age=3600, stale-while-revalidate=21600')
    res.setHeader('Vary', 'Accept-Encoding')
    res.json(data)
  } catch (_error) {
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
    // Trending: longer stale window — weekly data doesn't change fast
    res.setHeader('Cache-Control', 'public, max-age=3600, stale-while-revalidate=43200') // 1hr cache, 12hr stale
    res.setHeader('Vary', 'Accept-Encoding')
    res.json(data)
  } catch (_error) {
    res.status(500).json({ error: 'Failed to fetch trending media' })
  }
})

/**
 * GET /tmdb/search/hybrid
 * BM25 + TMDB multi-search with hybrid scoring (relevance + popularity blend)
 * This is the upgraded search route for the CineMatch discovery engine.
 */
router.get('/search/hybrid', async (req: Request, res: Response) => {
  const query = firstString(req.query.query)
  const mediaOnly = req.query.mediaOnly === 'true'
  const mediaType = firstString(req.query.mediaType) as 'movie' | 'tv' | undefined
  // The Anime tab's search: anime only (see isAnime)
  const anime = req.query.anime === 'true'

  if (!query || query.trim().length === 0) {
    return res.status(400).json({ error: 'Query parameter required' })
  }

  const page = parsePage(req.query.page)
  if (page === null) {
    return res.status(400).json({ error: 'page must be an integer between 1 and 500' })
  }

  if (mediaType && mediaType !== 'movie' && mediaType !== 'tv') {
    return res.status(400).json({ error: 'mediaType must be movie or tv' })
  }

  // A person, studio, franchise or topic ("Christopher Nolan", "Pixar",
  // "Star Wars", "true crime") answers with its own titles first. Not on the
  // Anime tab, whose search finds anime only.
  const entityPromise: Promise<ResolvedEntity | null> =
    page === 1 && !anime
      ? resolveSearchEntity(query).catch((error: unknown) => {
          logger.warn('Search entity lookup failed', { error: error instanceof Error ? error.message : String(error), query })
          return null
        })
      : Promise.resolve(null)

  // 1. Instant prefix check via the in-memory trie (O(m) in the query length).
  // It only holds a bounded set of top titles, so it answers alone only when
  // it has a full page; otherwise its hits lead and the TMDB search fills in
  // the rest — "na" used to come back as a single title.
  // Skipped for anime: trie entries carry no genre or language to check.
  let trieHits: Array<{ id: number; media_type: 'movie' | 'tv' }> = []
  if (page === 1 && req.query.autocomplete === 'true' && !anime) {
    trieHits = globalTrie
      .search(query)
      .filter((t) => !mediaType || t.mediaType === mediaType)
      .map((t) => ({
        id: t.id,
        media_type: t.mediaType,
        title: t.mediaType === 'movie' ? t.title : undefined,
        name: t.mediaType === 'tv' ? t.title : undefined,
        popularity: t.popularity,
        poster_path: t.poster_path,
        vote_average: t.vote_average,
        vote_count: t.vote_count,
        release_date: t.release_year ? `${t.release_year}-01-01` : undefined, // Approximation
        first_air_date: t.release_year ? `${t.release_year}-01-01` : undefined,
        _source: 'trie_autocomplete', // Debug flag
      }))

    // Short prefixes ("na") are answered from memory alone; anything long
    // enough to name a person or studio waits for that lookup first.
    if (trieHits.length >= TRIE_FULL_PAGE && normalizeTitle(query).length < ENTITY_MIN_LENGTH) {
      // Sub-10ms autocomplete. The trie is bounded, so there's nothing to page to.
      res.setHeader('Cache-Control', 'public, max-age=60')
      res.setHeader('X-Search-Engine', 'memory-trie')
      return res.json({ results: trieHits, total_results: trieHits.length, has_more: false, page, query })
    }
  }

  try {
    const [searched, resolved] = await Promise.all([
      hybridSearch({ query: query.trim(), page, mediaOnly, mediaType, anime }),
      entityPromise,
    ])
    const results = mergeSearchResults(query, trieHits, searched, resolved, mediaType)
    res.setHeader('Cache-Control', 'public, max-age=300, stale-while-revalidate=900')
    // `has_more` rather than a page count: hybridSearch re-ranks a single
    // upstream page, so it has no idea how many pages exist in total. Reporting
    // total_results as the length of this page made the client compute
    // total_pages = 1 and stop paginating after the first page every time.
    res.json({
      results,
      total_results: results.length,
      has_more: searched.length > 0 && page < MAX_PAGE,
      page,
      query,
      entity: resolved?.entity ?? null,
    })
  } catch (error: unknown) {
    logger.error('Hybrid search error', { error: error instanceof Error ? error.message : String(error), query })
    res.status(500).json({ error: 'Hybrid search failed' })
  }
})

/** Below this many letters a query is a prefix being typed, not a name. */
const ENTITY_MIN_LENGTH = 4

type SearchRow = { id: number; media_type: string; title?: string; name?: string; vote_count?: number }

/**
 * The order a search page is shown in: a title called exactly what was typed
 * (that people actually watch) first — "Heist" is still the film — then the
 * named person's / studio's / franchise's titles, then everything else.
 */
export function mergeSearchResults(
  query: string,
  trieHits: SearchRow[],
  searched: SearchRow[],
  resolved: { results: SearchRow[] } | null,
  mediaType?: 'movie' | 'tv',
): SearchRow[] {
  const rest: SearchRow[] = [...trieHits, ...searched]
  const lead = (resolved?.results ?? []).filter((r) => !mediaType || r.media_type === mediaType)
  const q = normalizeTitle(query)
  const exact = rest.filter((r) => normalizeTitle(r.title || r.name || '') === q && (r.vote_count ?? 0) >= 200)
  const seen = new Set<string>()
  const out: SearchRow[] = []
  for (const r of [...exact, ...lead, ...rest]) {
    const key = `${r.media_type}:${r.id}`
    if (seen.has(key)) continue
    seen.add(key)
    out.push(r)
  }
  return out
}

/**
 * GET /tmdb/top10/:country/:category
 * This week's Netflix Top 10 for a country, matched to TMDB titles.
 */
router.get('/top10/:country/:category', async (req: Request, res: Response) => {
  const country = String(req.params.country).toUpperCase()
  const category = req.params.category
  if (!COUNTRY.test(country)) return res.status(400).json({ error: 'country must be a two-letter code' })
  if (category !== 'tv' && category !== 'movie') return res.status(400).json({ error: 'category must be tv or movie' })
  try {
    const top = await getNetflixTop10(country, category, (endpoint) => fetchTMDB(endpoint))
    if (!top) return res.status(404).json({ error: 'No Top 10 for that country' })
    res.setHeader('Cache-Control', 'public, max-age=3600, stale-while-revalidate=43200')
    res.json(top)
  } catch (error: unknown) {
    logger.error('Top 10 fetch failed', { error: error instanceof Error ? error.message : String(error), country, category })
    res.status(502).json({ error: 'Top 10 unavailable' })
  }
})

/**
 * GET /tmdb/search/:mediaType
 * Search media
 */
router.get('/search/:mediaType', async (req: Request, res: Response) => {
  const { mediaType } = req.params
  const query = firstString(req.query.query)

  if (!query) {
    return res.status(400).json({ error: 'Query parameter required' })
  }

  if (mediaType !== 'movie' && mediaType !== 'tv') {
    return res.status(400).json({ error: 'Invalid media type' })
  }

  const page = parsePage(req.query.page)
  if (page === null) {
    return res.status(400).json({ error: 'page must be an integer between 1 and 500' })
  }

  try {
    const params = new URLSearchParams({ query, page: String(page) })
    const data = await fetchTMDB(`/search/${mediaType}?${params.toString()}`)
    res.setHeader('Cache-Control', 'public, max-age=900, stale-while-revalidate=1800') // 15min cache, 30min stale
    res.json(data)
  } catch (_error) {
    res.status(500).json({ error: 'Failed to search media' })
  }
})

/**
 * GET /tmdb/:mediaType/:id/similar
 * Get similar titles for a specific media item (used by guest "Because you watched" row)
 */
router.get('/:mediaType/:id/similar', async (req: Request, res: Response) => {
  const { mediaType, id } = req.params

  if (mediaType !== 'movie' && mediaType !== 'tv') {
    return res.status(400).json({ error: 'Invalid media type' })
  }

  const parsedId = Number(id)
  if (!Number.isInteger(parsedId) || parsedId <= 0 || parsedId > 100_000_000) {
    return res.status(400).json({ error: 'Invalid media id: must be a positive integer' })
  }

  try {
    const data = await fetchTMDB(`/${mediaType}/${parsedId}/similar`)
    // Similar titles: 15min cache, 1hr stale — changes slowly
    res.setHeader('Cache-Control', 'public, max-age=900, stale-while-revalidate=3600')
    res.setHeader('Vary', 'Accept-Encoding')
    res.json(data)
  } catch (_error) {
    res.status(500).json({ error: 'Failed to fetch similar titles' })
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
    // Video lists change infrequently — cache 2hrs, serve stale for 24hrs
    res.setHeader('Cache-Control', 'public, max-age=7200, stale-while-revalidate=86400')
    res.setHeader('Vary', 'Accept-Encoding')
    res.json(data)
  } catch (_error) {
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
      queryParts.push(`append_to_response=${encodeURIComponent(String(req.query.append_to_response))}`)
    }
    if (req.query.include_image_language) {
      queryParts.push(`include_image_language=${encodeURIComponent(String(req.query.include_image_language))}`)
    }

    if (queryParts.length > 0) {
      url += `?${queryParts.join('&')}`
    }

    const data = await fetchTMDB(url)
    // Detail pages: 2hr browser cache, 12hr stale — movie metadata rarely changes
    res.setHeader('Cache-Control', 'public, max-age=7200, stale-while-revalidate=43200')
    res.setHeader('Vary', 'Accept-Encoding')
    res.json(data)
  } catch (_error) {
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
  } catch (_error) {
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
    const typedData = data as { seasons?: Array<{ season_number: number }> }
    const seasons = typedData.seasons?.filter((s) => s.season_number > 0) || []

    await cache.seasons.set(cacheKey, seasons, 7200) // 2 hours TTL
    res.setHeader('X-Cache', 'MISS')
    res.setHeader('Cache-Control', 'public, max-age=3600, stale-while-revalidate=7200') // 1hr cache, 2hr stale
    res.json(seasons)
  } catch (_error) {
    res.status(500).json({ error: 'Failed to fetch seasons' })
  }
})

/** One episode as the player's episode list draws it. */
interface EpisodeSummary {
  episode_number: number
  name: string
  overview: string
  still_path: string | null
  runtime: number | null
  air_date: string | null
}

/**
 * GET /tmdb/tv/:id/season/:season
 * The episodes of one season — names, stills and runtimes for the episode
 * list under the player. Trimmed to those fields: TMDB's season payload also
 * carries full crew and guest-star lists for every episode, ~100KB a season.
 */
router.get('/tv/:id/season/:season', async (req: Request, res: Response) => {
  const parsedId = Number(req.params.id)
  const parsedSeason = Number(req.params.season)
  if (!Number.isInteger(parsedId) || parsedId <= 0 || parsedId > 100_000_000) {
    return res.status(400).json({ error: 'Invalid media id: must be a positive integer' })
  }
  if (!Number.isInteger(parsedSeason) || parsedSeason < 0 || parsedSeason > 1000) {
    return res.status(400).json({ error: 'Invalid season number' })
  }

  try {
    const cacheKey = cache.generateCacheKey('episodes', `${parsedId}:${parsedSeason}`)
    const cached = await cache.seasons.get(cacheKey)
    if (cached) {
      res.setHeader('X-Cache', 'HIT')
      return res.json(cached)
    }

    const data = (await fetchTMDB(`/tv/${parsedId}/season/${parsedSeason}`)) as {
      episodes?: Array<Partial<EpisodeSummary>>
    }
    const episodes: EpisodeSummary[] = (data.episodes ?? [])
      .filter((e) => typeof e.episode_number === 'number')
      .map((e) => ({
        episode_number: e.episode_number as number,
        name: e.name ?? '',
        overview: e.overview ?? '',
        still_path: e.still_path ?? null,
        runtime: e.runtime ?? null,
        air_date: e.air_date ?? null,
      }))

    // fetchTMDB answers a rate-limited request with empty data rather than
    // throwing — don't pin that emptiness in the cache for two hours.
    if (episodes.length > 0) await cache.seasons.set(cacheKey, episodes, 7200)
    res.setHeader('X-Cache', 'MISS')
    res.setHeader('Cache-Control', 'public, max-age=3600, stale-while-revalidate=7200')
    res.json(episodes)
  } catch (_error) {
    res.status(500).json({ error: 'Failed to fetch episodes' })
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
    // fetchTMDB() already rate-limits (only) its real network calls and serves
    // cache hits immediately, so items already in the TMDB cache resolve in
    // parallel with no artificial delay — see rateLimitedNetworkFetch above.
    const resolvedItems = await Promise.all(
      items.map(async (item) => {
        const tmdbId = Number(item?.tmdbId)
        const mediaType = item?.mediaType

        if (!Number.isInteger(tmdbId) || tmdbId <= 0) return null
        if (mediaType !== 'movie' && mediaType !== 'tv') return null

        try {
          const tmdbData = await fetchTMDB(`/${mediaType}/${tmdbId}`)
          return {
            media: tmdbData,
            item,
          }
        } catch (err: unknown) {
          logger.warn(`Failed to fetch tmdb details for ${mediaType} ${tmdbId}:`, { error: err instanceof Error ? err.message : String(err) })
          return null
        }
      })
    )

    // Filter out any failed fetches and return
    res.json(resolvedItems.filter(Boolean))
  } catch (error: unknown) {
    logger.error('Failed to batch fetch continue watching details', { error: error instanceof Error ? error.message : String(error) })
    res.status(500).json({ error: 'Server error fetching aggregated media' })
  }
})

export default router
