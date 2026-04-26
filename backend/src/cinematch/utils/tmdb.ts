import NodeCache from 'node-cache'
import { Candidate, MediaType } from "../types"

const TMDB_API_KEY = process.env.TMDB_API_KEY || process.env.VITE_TMDB_API_KEY || ""
const TMDB_BASE = "https://api.themoviedb.org/3"
const TMDB_FETCH_TIMEOUT_MS = Number(process.env.CINEMATCH_TMDB_TIMEOUT_MS || 1800)

// In-memory TMDB response cache — 10 min TTL, check every 2 min
// This is the single biggest perf win: eliminates 35+ live HTTP calls
// per cold pipeline run and drops repeated calls to < 1ms
const tmdbResponseCache = new NodeCache({ stdTTL: 600, checkperiod: 120 })

// Deduplication map: if two concurrent callers request the same URL,
// the second waits for the first rather than firing a duplicate fetch
const tmdbInFlight = new Map<string, Promise<any>>()

export async function fetchTMDB(path: string, options: { timeoutMs?: number } = {}): Promise<any> {
  if (!TMDB_API_KEY) return { results: [] }

  const sep = path.includes("?") ? "&" : "?"
  // Strip the api_key from the cache key so it's not stored in the key string
  const cacheKey = `${TMDB_BASE}${path}`
  const url = `${cacheKey}${sep}api_key=${TMDB_API_KEY}`
  const timeoutMs = options.timeoutMs ?? TMDB_FETCH_TIMEOUT_MS

  // L1: in-memory cache hit (< 1ms)
  const cached = tmdbResponseCache.get<any>(cacheKey)
  if (cached !== undefined) return cached

  // Deduplicate in-flight requests for the same URL
  if (tmdbInFlight.has(cacheKey)) {
    return tmdbInFlight.get(cacheKey)!
  }

  const fetchPromise = (async () => {
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), timeoutMs)
    try {
      const res = await fetch(url, { signal: controller.signal })
      if (!res.ok) return { results: [] }
      const data = await res.json()
      tmdbResponseCache.set(cacheKey, data)
      return data
    } catch {
      return { results: [] }
    } finally {
      clearTimeout(timeout)
      tmdbInFlight.delete(cacheKey)
    }
  })()

  tmdbInFlight.set(cacheKey, fetchPromise)
  return fetchPromise
}

export function mapTMDBItem(
  item: any,
  mediaType: MediaType,
  source: Candidate["source"]
): Candidate | null {
  const tmdbId = item.id
  if (!tmdbId) return null
  const genreIds = Array.isArray(item.genre_ids)
    ? item.genre_ids
    : Array.isArray(item.genres)
      ? item.genres.map((g: any) => g.id).filter((id: any) => Number.isInteger(id))
      : []

  return {
    tmdbId,
    mediaType,
    title: item.title || item.name || "",
    posterPath: item.poster_path || null,
    backdropPath: item.backdrop_path || null,
    overview: item.overview || "",
    releaseDate: item.release_date || item.first_air_date || "",
    voteAverage: item.vote_average || 0,
    voteCount: item.vote_count || 0,
    popularity: item.popularity || 0,
    genreIds,
    source,
  }
}
