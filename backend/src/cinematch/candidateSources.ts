// ============================================================
// CineMatch AI — Candidate Sources
// X Algorithm equivalent: Thunder (in-network) + Phoenix Retrieval (out-of-network)
//
// SOURCE 1: tmdb_similar          — user's watch history → similar titles
// SOURCE 2: tmdb_recommendations  — TMDB curated picks seeded from history
// SOURCE 3: trending              — global weekly trending (movie + TV)
// SOURCE 4: popular_fallback      — genre-targeted discovery / cold-start
// SOURCE 5: collaborative         — peer-based (users with matching taste) ← NEW
//
// All sources run in PARALLEL via Promise.allSettled
// ============================================================

import { supabaseAdmin } from '../lib/supabase'
import { Candidate, UserProfile, MediaType } from './types'

const TMDB_API_KEY = process.env.VITE_TMDB_API_KEY || ''
const TMDB_BASE = 'https://api.themoviedb.org/3'

// ── TMDB fetch helper ─────────────────────────────────────
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

// ── SOURCE 1: TMDB Similar ────────────────────────────────
// Thunder equivalent — seeded from user's recent watch history
export async function tmdbSimilarSource(profile: UserProfile): Promise<Candidate[]> {
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

// ── SOURCE 2: TMDB Recommendations ───────────────────────
// TMDB's curated human+ML picks seeded from user's history
export async function tmdbRecommendationsSource(profile: UserProfile): Promise<Candidate[]> {
  if (profile.recentlyWatched.length === 0) return []

  const results = await Promise.allSettled(
    profile.recentlyWatched.slice(0, 3).map(async (item) => {
      const data = await fetchTMDB(`/${item.mediaType}/${item.tmdbId}/recommendations`)
      return (data.results || [])
        .slice(0, 10)
        .map((r: any) => {
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

// ── SOURCE 3: Trending ────────────────────────────────────
// Phoenix out-of-network equivalent — weekly trending pool
export async function trendingSource(primaryMediaType: MediaType = 'movie'): Promise<Candidate[]> {
  const [movieData, tvData] = await Promise.allSettled([
    fetchTMDB('/trending/movie/week'),
    fetchTMDB('/trending/tv/week'),
  ])

  const movies = movieData.status === 'fulfilled'
    ? (movieData.value.results || []).slice(0, 10)
        .map((r: any) => mapTMDBItem(r, 'movie', 'trending')).filter(Boolean)
    : []

  const tv = tvData.status === 'fulfilled'
    ? (tvData.value.results || []).slice(0, 10)
        .map((r: any) => mapTMDBItem(r, 'tv', 'trending')).filter(Boolean)
    : []

  return primaryMediaType === 'tv' ? [...tv, ...movies] : [...movies, ...tv]
}

// ── SOURCE 4: Genre-Targeted Discovery ───────────────────
// Maps user's top 2 preferred genres to TMDB /discover
export async function popularFallbackSource(profile: UserProfile): Promise<Candidate[]> {
  const topGenres = Object.entries(profile.genreVector)
    .sort(([, a], [, b]) => b - a)
    .slice(0, 2)
    .map(([id]) => id)

  if (topGenres.length === 0) {
    const data = await fetchTMDB('/discover/movie?sort_by=popularity.desc&vote_count.gte=100')
    return (data.results || []).slice(0, 20)
      .map((r: any) => mapTMDBItem(r, 'movie', 'popular_fallback'))
      .filter(Boolean) as Candidate[]
  }

  const results = await Promise.allSettled(
    topGenres.map(async (genreId) => {
      const data = await fetchTMDB(
        `/discover/movie?sort_by=popularity.desc&with_genres=${genreId}&vote_count.gte=50`
      )
      return (data.results || []).slice(0, 10)
        .map((r: any) => mapTMDBItem(r, 'movie', 'popular_fallback'))
        .filter(Boolean) as Candidate[]
    })
  )

  return results
    .filter(r => r.status === 'fulfilled')
    .flatMap(r => (r as PromiseFulfilledResult<Candidate[]>).value)
}

// ── SOURCE 5: Collaborative Filtering ────────────────────
// Finds peer users with similar genre taste vectors, then surfaces
// content they loved that the current user hasn't seen.
//
// Algorithm:
//   1. Fetch all UserGenreProfiles (excluding current user)
//   2. Compute cosine similarity between user's genreVector and each peer's genreMap
//   3. Take top-N peer userIds by similarity score
//   4. Fetch those peers' top-rated tmdbIds from UserInteractions
//   5. Return as Candidate[] filtered against user's already-watched set
export async function collaborativeSource(profile: UserProfile): Promise<Candidate[]> {
  // Skip for empty profiles — no useful signal
  if (Object.keys(profile.genreVector).length === 0) return []

  try {
    // Step 1: Fetch all peer genre profiles (max 500 rows — sufficient for current scale)
    const { data: peers, error } = await supabaseAdmin
      .from('UserGenreProfile')
      .select('userId, genreMap')
      .neq('userId', profile.userId)
      .limit(500)

    if (error || !peers || peers.length === 0) return []

    // Step 2: Compute cosine similarity for each peer
    const userGenreKeys = Object.keys(profile.genreVector).map(Number)
    const userMagnitude = Math.sqrt(
      userGenreKeys.reduce((sum, g) => sum + (profile.genreVector[g] ?? 0) ** 2, 0)
    )
    if (userMagnitude === 0) return []

    const peerSimilarities: Array<{ userId: string; similarity: number }> = peers
      .filter(p => p.genreMap && typeof p.genreMap === 'object')
      .map(peer => {
        const peerMap = peer.genreMap as Record<string, number>

        // Dot product
        let dot = 0
        for (const g of userGenreKeys) {
          dot += (profile.genreVector[g] ?? 0) * (peerMap[String(g)] ?? 0)
        }

        // Peer magnitude
        const peerMagnitude = Math.sqrt(
          Object.values(peerMap).reduce((sum, v) => sum + v ** 2, 0)
        )

        const similarity = peerMagnitude > 0 ? dot / (userMagnitude * peerMagnitude) : 0
        return { userId: peer.userId as string, similarity }
      })
      .filter(p => p.similarity > 0.4) // Only significantly similar peers
      .sort((a, b) => b.similarity - a.similarity)
      .slice(0, 10) // Top-10 peers

    if (peerSimilarities.length === 0) return []

    // Step 3: Fetch top-watched tmdbIds from peer interactions (last 90 days)
    const peerUserIds = peerSimilarities.map(p => p.userId)
    const ninetyDaysAgo = new Date(Date.now() - 90 * 86_400_000).toISOString()

    const { data: peerInteractions, error: intError } = await supabaseAdmin
      .from('UserInteractions')
      .select('tmdbId, mediaType, weight')
      .in('userId', peerUserIds)
      .gte('weight', 0.8)  // Only strongly positive interactions
      .gte('createdAt', ninetyDaysAgo)
      .order('weight', { ascending: false })
      .limit(100)

    if (intError || !peerInteractions || peerInteractions.length === 0) return []

    // Step 4: Aggregate by tmdbId (count how many peers watched it)
    const tmdbScores = new Map<string, { tmdbId: number; mediaType: MediaType; peerCount: number }>()

    for (const interaction of peerInteractions) {
      const key = `${interaction.mediaType}:${interaction.tmdbId}`
      // Skip content the current user already watched or disliked
      if (profile.watchedIds.has(interaction.tmdbId)) continue
      if (profile.dislikedIds.has(interaction.tmdbId)) continue

      const existing = tmdbScores.get(key)
      if (existing) {
        existing.peerCount++
      } else {
        tmdbScores.set(key, {
          tmdbId: interaction.tmdbId,
          mediaType: interaction.mediaType as MediaType,
          peerCount: 1,
        })
      }
    }

    // Step 5: Fetch TMDB metadata for top collaborative candidates
    const topCandidates = Array.from(tmdbScores.values())
      .sort((a, b) => b.peerCount - a.peerCount)
      .slice(0, 20)

    const candidateResults = await Promise.allSettled(
      topCandidates.map(async (c) => {
        try {
          const data = await fetchTMDB(`/${c.mediaType}/${c.tmdbId}`)
          const candidate = mapTMDBItem(
            { ...data, genre_ids: (data.genres || []).map((g: any) => g.id) },
            c.mediaType,
            'collaborative'
          )
          return candidate
        } catch {
          return null
        }
      })
    )

    return candidateResults
      .filter(r => r.status === 'fulfilled' && r.value !== null)
      .map(r => (r as PromiseFulfilledResult<Candidate>).value)

  } catch (err) {
    console.error('[CineMatch] Collaborative source error:', err)
    return []
  }
}

// ── MASTER SOURCE FETCHER ─────────────────────────────────
// All 5 sources run in parallel — equivalent to X's "Sources" stage
export async function fetchAllSources(profile: UserProfile): Promise<Candidate[]> {
  const primaryType: MediaType =
    profile.recentlyWatched[0]?.mediaType ?? 'movie'

  const [similar, recommendations, trending, fallback, collaborative] = await Promise.allSettled([
    tmdbSimilarSource(profile),
    tmdbRecommendationsSource(profile),
    trendingSource(primaryType),
    popularFallbackSource(profile),
    collaborativeSource(profile),
  ])

  const allCandidates: Candidate[] = [
    ...(similar.status === 'fulfilled' ? similar.value : []),
    ...(recommendations.status === 'fulfilled' ? recommendations.value : []),
    ...(trending.status === 'fulfilled' ? trending.value : []),
    ...(fallback.status === 'fulfilled' ? fallback.value : []),
    ...(collaborative.status === 'fulfilled' ? collaborative.value : []),
  ]

  return allCandidates
}
