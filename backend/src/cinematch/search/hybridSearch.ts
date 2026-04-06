// ============================================================
// CineMatch — Hybrid Search Orchestrator
//
// Pipeline for a user search query:
//   1. Fetch TMDB /search/multi (broad retrieve)
//   2. Re-rank results with BM25 over [title, overview, tagline]
//   3. Return unified ranked result list
//
// This gives exact-match precision (BM25) while retaining the
// broad recall of TMDB's search index.
// ============================================================

import { rankWithBM25, BM25Document } from './bm25'
import { logger } from '../../lib/logger'
import { parseQueryNLU } from './queryParser'
import { crossEncoderReRank } from './crossEncoder'

const TMDB_API_KEY = process.env.TMDB_API_KEY || process.env.VITE_TMDB_API_KEY
const TMDB_BASE_URL = 'https://api.themoviedb.org/3'

// ── TMDB Result shape (simplified) ───────────────────────

interface TMDBMultiResult {
  id: number
  media_type: 'movie' | 'tv' | 'person'
  title?: string
  name?: string
  overview?: string
  tagline?: string
  poster_path?: string | null
  backdrop_path?: string | null
  vote_average?: number
  vote_count?: number
  popularity?: number
  release_date?: string
  first_air_date?: string
  genre_ids?: number[]
  known_for_department?: string
  profile_path?: string | null
  known_for?: TMDBMultiResult[]
}

// ── Hybrid Search Result ──────────────────────────────────

export interface HybridSearchResult extends TMDBMultiResult {
  bm25Score: number
  hybridScore: number
}

// ── Fetch from TMDB ───────────────────────────────────────

async function fetchMultiSearch(
  query: string,
  page: number = 1,
): Promise<TMDBMultiResult[]> {
  if (!TMDB_API_KEY) return []

  try {
    const url = `${TMDB_BASE_URL}/search/multi?query=${encodeURIComponent(query)}&page=${page}&api_key=${TMDB_API_KEY}`
    const res = await fetch(url)
    if (!res.ok) {
      logger.error('[HybridSearch] TMDB fetch failed', { status: res.status })
      return []
    }
    const data = await res.json()
    return (data.results || []) as TMDBMultiResult[]
  } catch (err: any) {
    logger.error('[HybridSearch] TMDB network error', { error: err.message })
    return []
  }
}

async function fetchDiscover(
  mediaType: 'movie' | 'tv',
  filters: Record<string, string>,
  page: number = 1
): Promise<TMDBMultiResult[]> {
  if (!TMDB_API_KEY) return []
  
  try {
    const params = new URLSearchParams()
    params.append('api_key', TMDB_API_KEY)
    params.append('page', page.toString())
    for (const [k, v] of Object.entries(filters)) {
      if (v) params.append(k, v)
    }
    
    // Sort by popularity for general discover queries
    params.append('sort_by', 'popularity.desc')
    
    const url = `${TMDB_BASE_URL}/discover/${mediaType}?${params.toString()}`
    const res = await fetch(url)
    if (!res.ok) {
      logger.error('[HybridSearch] TMDB discover failed', { status: res.status })
      return []
    }
    const data = await res.json()
    // Inject missing media_type since /discover doesn't return it
    return (data.results || []).map((r: any) => ({ ...r, media_type: mediaType }))
  } catch (err: any) {
    logger.error('[HybridSearch] TMDB network error', { error: err.message })
    return []
  }
}

// ── BM25 Adapter ─────────────────────────────────────────

// Adapter type that satisfies BM25Document without conflicting with TMDBMultiResult.id
interface TMDBBm25Doc extends BM25Document {
  id: string          // String composite key ("movie:12345")
  numericId: number   // Original TMDB numeric id preserved separately
  fields: Record<string, string>
  media_type: 'movie' | 'tv' | 'person'
  title?: string
  name?: string
  overview?: string
  tagline?: string
  poster_path?: string | null
  backdrop_path?: string | null
  vote_average?: number
  vote_count?: number
  popularity?: number
  release_date?: string
  first_air_date?: string
  genre_ids?: number[]
  known_for_department?: string
  profile_path?: string | null
  known_for?: TMDBMultiResult[]
}

function toDocuments(results: TMDBMultiResult[]): TMDBBm25Doc[] {
  return results.map(r => ({
    ...r,
    id: `${r.media_type}:${r.id}`,      // String composite key for BM25Document
    numericId: r.id,                      // Preserve original numeric TMDB id
    fields: {
      title: r.title || r.name || '',
      name: r.name || r.title || '',
      overview: r.overview || '',
      tagline: r.tagline || '',
    },
  }))
}

// ── Hybrid Score ──────────────────────────────────────────
// Blend BM25 relevance with TMDB's own popularity signal
// so highly-relevant niche results aren't buried by big blockbusters.
//
//  hybridScore = 0.75 * bm25_norm + 0.25 * popularity_norm
//
// where bm25_norm and popularity_norm are min-max normalised to [0,1].

function computeHybridScores(
  bm25Results: Array<{ doc: TMDBBm25Doc; bm25Score: number }>,
): HybridSearchResult[] {
  if (bm25Results.length === 0) return []

  const maxBM25 = Math.max(...bm25Results.map(r => r.bm25Score), 1e-9)
  const popularities = bm25Results.map(r => r.doc.popularity || 0)
  const maxPop = Math.max(...popularities, 1e-9)

  return bm25Results.map(({ doc, bm25Score }) => {
    const bm25Norm = bm25Score / maxBM25
    const popNorm = (doc.popularity || 0) / maxPop
    const hybridScore = 0.75 * bm25Norm + 0.25 * popNorm

    // Reconstruct the TMDBMultiResult shape with the numeric id
    const tmdbResult: TMDBMultiResult = {
      ...doc,
      id: doc.numericId,
    }

    return {
      ...tmdbResult,
      bm25Score,
      hybridScore,
    }
  }).sort((a, b) => b.hybridScore - a.hybridScore)
}

// ── Public API ────────────────────────────────────────────

export interface HybridSearchOptions {
  query: string
  page?: number
  /** If true, filter out 'person' results and only return media */
  mediaOnly?: boolean
  /** If provided, restrict to only this media type */
  mediaType?: 'movie' | 'tv'
}

/**
 * Execute a hybrid search:
 *   1. Fetch TMDB /search/multi results
 *   2. Re-rank with BM25 across title, overview, tagline
 *   3. Blend with popularity for final hybrid score
 *
 * Falls back to raw TMDB results if BM25 produces all-zero scores
 * (e.g. very short single-word queries that are all stopwords).
 */
export async function hybridSearch(opts: HybridSearchOptions): Promise<HybridSearchResult[]> {
  const { query, page = 1, mediaOnly = false, mediaType } = opts

  let results: TMDBMultiResult[] = []
  
  // 1. Attempt LLM/NLU parsing of the query
  const parsed = await parseQueryNLU(query)
  
  if (parsed && parsed.isConversational) {
    logger.info('[HybridSearch] Using NLU parsed filters via Discover', { query })
    
    // Fallback search term if they included a title portion
    if (parsed.remainingQuery) {
      parsed.filters['with_text_query'] = parsed.remainingQuery
    }
    
    if (parsed.mediaType) {
      // If NLU strongly detected a specific media type
      results = await fetchDiscover(parsed.mediaType, parsed.filters as Record<string, string>, page)
    } else if (mediaType) {
      // If client requested a specific media type
      results = await fetchDiscover(mediaType, parsed.filters as Record<string, string>, page)
    } else {
      // Fetch both discover movies and tv
      const [movies, tv] = await Promise.all([
        fetchDiscover('movie', parsed.filters as Record<string, string>, page),
        fetchDiscover('tv', parsed.filters as Record<string, string>, page)
      ])
      // Merge and sort purely by popularity since discovery results lack BM25 scores yet
      results = [...movies, ...tv].sort((a, b) => (b.popularity || 0) - (a.popularity || 0))
    }
  } else {
    // 2. Standard heuristic flow: Fetch from TMDB Multi Search
    results = await fetchMultiSearch(query, page)
  }

  // Apply type filters
  if (mediaType) {
    results = results.filter(r => r.media_type === mediaType)
  } else if (mediaOnly) {
    results = results.filter(r => r.media_type === 'movie' || r.media_type === 'tv')
  }

  if (results.length === 0) return []

  // Convert to BM25 document format and score
  const docs = toDocuments(results)
  const bm25Ranked = rankWithBM25(query, docs)

  // Check if BM25 produced any signal (all-zero = pure stopwords query)
  const hasSignal = bm25Ranked.some(r => r.bm25Score > 0)
  if (!hasSignal) {
    // Fall back to TMDB ordering by popularity
    logger.info('[HybridSearch] BM25 produced no signal, using TMDB ordering', { query })
    return results.map(r => ({ ...r, bm25Score: 0, hybridScore: r.popularity || 0 }))
  }

  logger.info('[HybridSearch] BM25 re-ranked results', {
    query,
    count: results.length,
    topResult: `${bm25Ranked[0]?.doc.title || bm25Ranked[0]?.doc.name} (${bm25Ranked[0]?.bm25Score.toFixed(3)})`,
  })

  const scoredHybrid = computeHybridScores(bm25Ranked)
  
  // 3. Stage 2 Precision Re-Ranking via Cross-Encoder proxy
  return await crossEncoderReRank(query, scoredHybrid, 10)
}
