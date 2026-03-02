// ============================================================
// CineMatch — ML Vector Source (FIXED: Real Embeddings)
//
// Previously: generated random noise embeddings (Math.random())
// Now: builds a user interest summary string from the user profile
//      and calls OpenAI text-embedding-3-small to generate a real
//      semantic embedding for pgvector ANN search.
//
// Graceful degradation: if OPENAI_API_KEY is not set, returns []
// and the heuristic candidate pipeline handles everything.
// ============================================================

import { supabaseAdmin } from '../../lib/supabase'
import { Candidate, MediaType, UserProfile, TMDB_GENRES } from '../types'
import { getMovieFeatures } from '../features'
import { logger } from '../../lib/logger'
import { generateEmbedding, buildInterestSummary } from './embeddingClient'

// ── Build interest text from profile ─────────────────────

async function buildProfileInterestText(profile: UserProfile): Promise<string> {
  // Top 5 genre names from the genre vector
  const topGenreNames = Object.entries(profile.genreVector)
    .filter(([, w]) => w > 0)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([id]) => TMDB_GENRES[Number(id)] ?? '')
    .filter(Boolean)

  // Recent titles from recently watched list
  const recentTitles = profile.recentlyWatched
    .map(r => r.title)
    .filter(Boolean)
    .slice(0, 5)

  // Top cast names — we don't have names here, only IDs, but we can note
  // the count of top cast affinity as a proxy.
  // In a full system you'd lookup names from a people cache.
  const topCastNames: string[] = [] // Requires a person-name cache (Phase 3)

  // Top keywords — similarly IDs only for now, resolve names where available
  const topKeywordNames: string[] = [] // Resolved from TMDB keyword cache (Phase 2 enhancement)

  const summary = buildInterestSummary({
    topGenreNames,
    topKeywordNames,
    recentTitles,
    topCastNames,
  })

  return summary
}

// ── Main ML Vector Source ─────────────────────────────────

export async function mlVectorSource(userId: string, profile?: UserProfile): Promise<Candidate[]> {
  try {
    // Build interest summary text from user profile
    // (profile is optionally passed from homeTimeline to avoid re-fetching)
    let interestText = ''
    if (profile) {
      interestText = await buildProfileInterestText(profile)
    } else {
      // Fallback: generic interest text won't have profile context
      // but at least won't be random noise
      interestText = 'movies and television shows'
    }

    if (!interestText || interestText.trim().length < 10) {
      logger.warn('[MLVector] Interest text too short to embed, skipping', { userId })
      return []
    }

    // Generate real embedding via OpenAI
    const cacheKey = `user:${userId}`
    const embedding = await generateEmbedding(cacheKey, interestText)

    if (!embedding) {
      // OPENAI_API_KEY not set or API error — graceful degradation
      return []
    }

    // Query Supabase pgvector with the REAL embedding
    const { data: matchedMovies, error } = await supabaseAdmin.rpc('match_movies_from_user_embedding', {
      query_embedding: embedding,
      match_threshold: 0.3,  // Minimum cosine similarity threshold (was -1.0 before)
      match_count: 25,
    })

    if (error) {
      logger.error('[MLVector] pgvector search error', { error: error.message })
      return []
    }

    if (!matchedMovies || matchedMovies.length === 0) {
      logger.info('[MLVector] No matches above threshold', { userId })
      return []
    }

    logger.info('[MLVector] pgvector returned candidates', { count: matchedMovies.length, userId })

    // Hydrate the matched tmdbIds into full Candidate objects
    const candidates: Candidate[] = []
    const hydrationPromises = matchedMovies.map(async (row: { tmdbId: number; similarity: number }) => {
      const mediaType: MediaType = 'movie' // ML model currently exports movie vectors only
      const features = await getMovieFeatures(row.tmdbId, mediaType)

      if (features) {
        candidates.push({
          tmdbId: features.tmdbId,
          mediaType: features.mediaType,
          title: features.title,
          posterPath: features.posterPath,
          backdropPath: features.backdropPath,
          overview: features.overview,
          releaseDate: features.releaseDate,
          voteAverage: features.voteAverage,
          voteCount: features.voteCount,
          popularity: features.popularity,
          genreIds: features.genreIds,
          keywords: features.keywords,
          castIds: features.castIds,
          directorId: features.directorId,
          source: 'tmdb_recommendations', // Using valid enum — semantically 'ml_vector'
          seedTitle: 'AI Picks For You',
        })
      }
    })

    await Promise.allSettled(hydrationPromises)
    return candidates

  } catch (err: any) {
    logger.error('[MLVector] Unexpected error', { error: err.message })
    return []
  }
}
