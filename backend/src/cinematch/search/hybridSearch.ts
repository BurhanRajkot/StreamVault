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
import { fetchTMDB } from '../utils/tmdb'

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
  try {
    const url = `/search/multi?query=${encodeURIComponent(query)}&page=${page}`
    const data = await fetchTMDB(url)
    // fetchTMDB swallows HTTP errors and returns { results: [] }
    // but a successful multi-search response should have a page field.
    const paged = data as { page?: number; results?: TMDBMultiResult[] }
    if (!paged || !paged.page) {
      logger.error('[HybridSearch] TMDB fetch failed or returned unexpected data')
      return []
    }
    return paged.results || []
  } catch (err: unknown) {
    logger.error('[HybridSearch] TMDB MultiSearch error', { error: err instanceof Error ? err.message : String(err) })
    return []
  }
}
async function fetchDiscover(
  mediaType: 'movie' | 'tv',
  filters: Record<string, string>,
  page: number = 1
): Promise<TMDBMultiResult[]> {
  try {
    const cleanFilters: Record<string, string> = {
      page: page.toString(),
    }
    for (const k in filters) {
      const v = filters[k]
      if (!v || k === 'api_key') continue

      // Drop date filters that belong to the opposite media type
      if (mediaType === 'movie' && (k === 'first_air_date.gte' || k === 'first_air_date.lte')) continue
      if (mediaType === 'tv' && (k === 'primary_release_date.gte' || k === 'primary_release_date.lte')) continue

      cleanFilters[k] = v
    }
    // Sort by popularity for general discover queries
    if (!cleanFilters.sort_by) {
      cleanFilters.sort_by = 'popularity.desc'
    }
    const params = new URLSearchParams(cleanFilters)
    
    const url = `/discover/${mediaType}?${params.toString()}`
    const data = await fetchTMDB(url) as { results?: TMDBMultiResult[] } | null
    // Inject missing media_type since /discover doesn't return it
    return (data?.results || []).map((r) => ({ ...r, media_type: mediaType }))
  } catch (err: unknown) {
    logger.error('[HybridSearch] TMDB Discover error', { error: err instanceof Error ? err.message : String(err) })
    return []
  }
}
// ── BM25 Adapter ─────────────────────────────────────────
// Adapter type that satisfies BM25Document without conflicting with TMDBMultiResult.id
interface TMDBBm25Doc extends BM25Document {
  id: string          // String composite key ("movie:12345")
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
    fields: {
      title: r.title || r.name || '',
      name: r.name || r.title || '',
      overview: r.overview || '',
      tagline: r.tagline || '',
    },
  }))
}
// ── Ranking ───────────────────────────────────────────────
/** Lowercased letters and digits, single-spaced: "Spider-Man: No Way Home" → "spider man no way home". */
function normalizeTitle(s: string): string {
  return s
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
}

/**
 * How well a title matches what has been typed so far, 0–1. BM25 only scores
 * whole words, so an as-you-type query ("nar") gave Narcos and Naruto nothing
 * and put whatever was literally called "Nar" above them.
 */
export function titleMatchScore(title: string, query: string): number {
  const t = normalizeTitle(title)
  const q = normalizeTitle(query)
  if (!t || !q) return 0
  if (t === q) return 1
  if (t.startsWith(q)) return 0.85
  const titleWords = t.split(' ')
  const queryWords = q.split(' ')
  const last = queryWords[queryWords.length - 1]
  const earlier = queryWords.slice(0, -1)
  // Every finished word is in the title, and the one being typed starts a word
  if (earlier.every((w) => titleWords.includes(w)) && titleWords.some((w) => w.startsWith(last))) return 0.6
  if (t.includes(q)) return 0.4
  return 0
}

/** No poster and (nearly) nobody has rated it: TMDB filler that shows up as a blank tile. */
export function isSearchNoise(r: { poster_path?: string | null; vote_count?: number }): boolean {
  return !r.poster_path && (r.vote_count ?? 0) < 20
}

/**
 * A short single word is almost always a word still being typed ("nar"):
 * BM25's exact-word bonus there mostly rewards obscure titles that happen to
 * be literally that word, so it counts for little and prefix + popularity
 * decide.
 */
function scoreWeights(query: string): { bm25: number; title: number; popularity: number } {
  const words = normalizeTitle(query).split(' ').filter(Boolean)
  return words.length === 1 && words[0].length <= 4
    ? { bm25: 0.1, title: 0.45, popularity: 0.45 }
    : { bm25: 0.4, title: 0.35, popularity: 0.25 }
}

/**
 * Order search hits: relevance — BM25 over title/overview/tagline, plus how
 * well the title matches what's typed (titleMatchScore) — blended with
 * log-scaled popularity, so a blockbuster that merely mentions the word
 * doesn't bury the exact match. Titles almost nobody has rated are damped:
 * among equally good matches, the one people actually watch comes first.
 */
export function rankSearchResults(query: string, results: TMDBMultiResult[]): HybridSearchResult[] {
  if (results.length === 0) return []
  const weights = scoreWeights(query)
  const bm25 = new Map(rankWithBM25(query, toDocuments(results)).map((r) => [r.doc.id, r.bm25Score]))
  const maxBM25 = Math.max(0, ...bm25.values())
  const maxPop = Math.max(0, ...results.map((r) => r.popularity || 0))
  return results
    .map((r) => {
      const bm25Score = bm25.get(`${r.media_type}:${r.id}`) ?? 0
      const bm25Norm = maxBM25 > 0 ? bm25Score / maxBM25 : 0
      const popNorm = maxPop > 0 ? Math.log1p(r.popularity || 0) / Math.log1p(maxPop) : 0
      const titleMatch = titleMatchScore(r.title || r.name || '', query)
      // 0 votes → ×0.6, 1000+ votes → ×1
      const confidence = 0.6 + 0.4 * Math.min(1, Math.log1p(r.vote_count || 0) / Math.log1p(1000))
      const hybridScore =
        (weights.bm25 * bm25Norm + weights.title * titleMatch + weights.popularity * popNorm) * confidence
      return { ...r, bm25Score, hybridScore }
    })
    .sort((a, b) => b.hybridScore - a.hybridScore)
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
 *   2. Drop filler (no poster, no votes)
 *   3. Rank: BM25 across title, overview, tagline + as-you-type title
 *      matching, blended with popularity (see rankSearchResults)
 */
export async function hybridSearch(opts: HybridSearchOptions): Promise<HybridSearchResult[]> {
  const { query, page = 1, mediaOnly = false, mediaType } = opts
  let results: TMDBMultiResult[]
  
  // 1. Attempt local NLU parsing of the query (synchronous — no API call)
  const parsed = parseQueryNLU(query)
  
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
  // Filler TMDB returns for loose queries — no artwork, no audience.
  results = results.filter((r) => !isSearchNoise(r))
  if (results.length === 0) return []

  const ranked = rankSearchResults(query, results)
  logger.info('[HybridSearch] ranked results', {
    query,
    count: ranked.length,
    topResult: `${ranked[0]?.title || ranked[0]?.name} (${ranked[0]?.hybridScore.toFixed(3)})`,
  })
  return ranked
}