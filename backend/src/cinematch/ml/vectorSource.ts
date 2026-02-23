import { supabaseAdmin } from '../../lib/supabase'
import { Candidate, MediaType } from '../types'
import { getMovieFeatures } from '../features'
import { logger } from '../../lib/logger'

// In a real production environment, you would call the PyTorch model running on a Python
// microservice (e.g. FastAPI on Google Cloud) to generate the query_embedding from the userId.
// For this prototype, we'll hit an imaginary proxy endpoint or, if it fails,
// gracefully return an empty array so the fallback heuristics take over.

export async function mlVectorSource(userId: string): Promise<Candidate[]> {
  try {
    // 1. Get the 64-dimensional User Embedding from the Python ML Microservice
    // Since we don't have that server running right now, we will simulate
    // fetching a user embedding.
    const mockUserEmbedding = Array.from({ length: 64 }, () => Math.random() * 2 - 1)

    // 2. Query Supabase pgvector using the RPC function we created in Phase 3
    const { data: matchedMovies, error } = await supabaseAdmin.rpc('match_movies_from_user_embedding', {
      query_embedding: mockUserEmbedding,
      match_threshold: -1.0, // lowest possible dot product
      match_count: 20
    })

    if (error) {
      logger.error('CineMatch ML Vector Search Error', { error: error.message })
      return []
    }

    if (!matchedMovies || matchedMovies.length === 0) return []

    // 3. Hydrate the raw tmdbIds back into standard Candidate objects
    const candidates: Candidate[] = []

    // We fetch features in parallel to keep latency low
    const hydrationPromises = matchedMovies.map(async (row: { tmdbId: number, similarity: number }) => {
      // In this prototype, we assume the ML model only exported movie vectors
      const mediaType: MediaType = 'movie'
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
          source: 'keyword_discovery', // Re-using an existing enum type for now so we don't break frontend types
          seedTitle: 'AI Vector Match'
        })
      }
    })

    await Promise.allSettled(hydrationPromises)

    return candidates

  } catch (err: any) {
    logger.error('CineMatch ML Vector Source Error', { error: err.message })
    return []
  }
}
