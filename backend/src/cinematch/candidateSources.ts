// ============================================================
// CineMatch AI — Candidate Sources
// X Algorithm equivalent: Thunder (in-network) + Phoenix Retrieval (out-of-network)
//
// Thunder-equivalent: content seeded from user's own watch history
//   → tmdbSimilarSource, tmdbRecommendationsSource
//
// Phoenix-equivalent: global corpus discovery
//   → trendingSource, popularFallbackSource
//
// All sources run in PARALLEL via Promise.allSettled
// ============================================================

import { Candidate, UserProfile, MediaType } from './types'

const TMDB_API_KEY = process.env.VITE_TMDB_API_KEY || ''
const TMDB_BASE = 'https://api.themoviedb.org/3'

async function fetchTMDB(path: string): Promise<any> {
  const sep = path.includes('?') ? '&' : '?'
  const url = `${TMDB_BASE}${path}${sep}api_key=${TMDB_API_KEY}`
  const res = await fetch(url)
  if (!res.ok) return { results: [] }
  return res.json()
}

function mapTMDBItem(
  item: any,
  mediaType: MediaType,
  source: Candidate['source'],
): Candidate | null {
  const tmdbId = item.id
  if (!tmdbId) return null

  return {
    tmdbId,
    mediaType,
    title: item.title || item.name || '',
    posterPath: item.poster_path || null,
    backdropPath: item.backdrop_path || null,
    overview: item.overview || '',
    releaseDate: item.release_date || item.first_air_date || '',
    voteAverage: item.vote_average || 0,
    voteCount: item.vote_count || 0,
    popularity: item.popularity || 0,
    genreIds: item.genre_ids || [],
    source,
  }
}

// ── SOURCE 1: TMDB Similar ────────────────────────────────────
// Thunder equivalent — seeded from user's recent watch history
// "Because you watched Game of Thrones"
export async function tmdbSimilarSource(
  profile: UserProfile,
): Promise<Candidate[]> {
  if (profile.recentlyWatched.length === 0) return []

  const results = await Promise.allSettled(
    profile.recentlyWatched.slice(0, 3).map(async (item) => {
      const data = await fetchTMDB(`/${item.mediaType}/${item.tmdbId}/similar`)
      return (data.results || [])
        .slice(0, 10)
        .map((r: any) => mapTMDBItem(r, item.mediaType, 'tmdb_similar'))
        .filter(Boolean) as Candidate[]
    })
  )

  return results
    .filter(r => r.status === 'fulfilled')
    .flatMap(r => (r as PromiseFulfilledResult<Candidate[]>).value)
}

// ── SOURCE 2: TMDB Recommendations ───────────────────────────
// Curated TMDB picks (human + ML curated by TMDB's team)
export async function tmdbRecommendationsSource(
  profile: UserProfile,
): Promise<Candidate[]> {
  if (profile.recentlyWatched.length === 0) return []

  const results = await Promise.allSettled(
    profile.recentlyWatched.slice(0, 3).map(async (item) => {
      const data = await fetchTMDB(`/${item.mediaType}/${item.tmdbId}/recommendations`)
      return (data.results || [])
        .slice(0, 10)
        .map((r: any) => {
          // recommendations API returns mixed media_type field
          const mt: MediaType = r.media_type === 'tv' ? 'tv' : item.mediaType
          return mapTMDBItem(r, mt, 'tmdb_recommendations')
        })
        .filter(Boolean) as Candidate[]
    })
  )

  return results
    .filter(r => r.status === 'fulfilled')
    .flatMap(r => (r as PromiseFulfilledResult<Candidate[]>).value)
}

// ── SOURCE 3: Trending ────────────────────────────────────────
// Phoenix out-of-network equivalent — weekly trending pool
export async function trendingSource(
  primaryMediaType: MediaType = 'movie',
): Promise<Candidate[]> {
  // Fetch both movie + TV trending in parallel
  const [movieData, tvData] = await Promise.allSettled([
    fetchTMDB('/trending/movie/week'),
    fetchTMDB('/trending/tv/week'),
  ])

  const movies =
    movieData.status === 'fulfilled'
      ? (movieData.value.results || [])
          .slice(0, 10)
          .map((r: any) => mapTMDBItem(r, 'movie', 'trending'))
          .filter(Boolean)
      : []

  const tv =
    tvData.status === 'fulfilled'
      ? (tvData.value.results || [])
          .slice(0, 10)
          .map((r: any) => mapTMDBItem(r, 'tv', 'trending'))
          .filter(Boolean)
      : []

  // Interleave based on primary preference
  return primaryMediaType === 'tv'
    ? [...tv, ...movies]
    : [...movies, ...tv]
}

// ── SOURCE 4: Genre-Targeted Discovery ────────────────────────
// For users with known genre affinity — discover top items in fav genres
// Also serves as cold-start fallback for new users
export async function popularFallbackSource(
  profile: UserProfile,
): Promise<Candidate[]> {
  // Pick top 2 preferred genres (or defaults for cold-start)
  const topGenres = Object.entries(profile.genreVector)
    .sort(([, a], [, b]) => b - a)
    .slice(0, 2)
    .map(([id]) => id)

  if (topGenres.length === 0) {
    // Cold-start: just return popular content
    const data = await fetchTMDB('/discover/movie?sort_by=popularity.desc&vote_count.gte=100')
    return (data.results || [])
      .slice(0, 20)
      .map((r: any) => mapTMDBItem(r, 'movie', 'popular_fallback'))
      .filter(Boolean) as Candidate[]
  }

  const results = await Promise.allSettled(
    topGenres.map(async (genreId) => {
      const data = await fetchTMDB(
        `/discover/movie?sort_by=popularity.desc&with_genres=${genreId}&vote_count.gte=50`
      )
      return (data.results || [])
        .slice(0, 10)
        .map((r: any) => mapTMDBItem(r, 'movie', 'popular_fallback'))
        .filter(Boolean) as Candidate[]
    })
  )

  return results
    .filter(r => r.status === 'fulfilled')
    .flatMap(r => (r as PromiseFulfilledResult<Candidate[]>).value)
}

// ── MASTER SOURCE FETCHER ─────────────────────────────────────
// Equivalent to the Home Mixer's "Sources" stage — all run in parallel
export async function fetchAllSources(profile: UserProfile): Promise<Candidate[]> {
  const primaryType: MediaType =
    profile.recentlyWatched[0]?.mediaType ?? 'movie'

  const [similar, recommendations, trending, fallback] = await Promise.allSettled([
    tmdbSimilarSource(profile),
    tmdbRecommendationsSource(profile),
    trendingSource(primaryType),
    popularFallbackSource(profile),
  ])

  const allCandidates: Candidate[] = [
    ...(similar.status === 'fulfilled' ? similar.value : []),
    ...(recommendations.status === 'fulfilled' ? recommendations.value : []),
    ...(trending.status === 'fulfilled' ? trending.value : []),
    ...(fallback.status === 'fulfilled' ? fallback.value : []),
  ]

  return allCandidates
}
