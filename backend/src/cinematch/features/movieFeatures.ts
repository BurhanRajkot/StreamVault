import NodeCache from 'node-cache'
import { MediaType } from '../types'

const TMDB_API_KEY = process.env.VITE_TMDB_API_KEY || ''
const TMDB_BASE = 'https://api.themoviedb.org/3'

// L1 in-memory cache for movie features (2hr TTL)
const movieFeatureCache = new NodeCache({ stdTTL: 7200, checkperiod: 300 })

export interface MovieFeatures {
  tmdbId: number
  mediaType: MediaType
  genreIds: number[]
  keywords: number[]         // TMDB keyword ids
  castIds: number[]          // Top-5 cast member ids
  directorId: number | null
  popularity: number
  voteAverage: number
  voteCount: number
  releaseDate: string
  title: string
  posterPath: string | null
  backdropPath: string | null
  overview: string
}

export async function getMovieFeatures(
  tmdbId: number,
  mediaType: MediaType
): Promise<MovieFeatures | null> {
  const cacheKey = `${mediaType}:${tmdbId}`
  const cached = movieFeatureCache.get<MovieFeatures>(cacheKey)
  if (cached) return cached

  try {
    const url = `${TMDB_BASE}/${mediaType}/${tmdbId}?append_to_response=keywords,credits&api_key=${TMDB_API_KEY}`
    const res = await fetch(url)
    if (!res.ok) return null
    const data = await res.json()

    const genreIds: number[] = (data.genres || []).map((g: any) => g.id)
    const rawKw = data.keywords?.keywords || data.keywords?.results || []
    const keywords: number[] = rawKw.slice(0, 20).map((k: any) => k.id)
    const cast = (data.credits?.cast || []).slice(0, 5)
    const castIds: number[] = cast.map((c: any) => c.id)
    const crew = data.credits?.crew || []
    const director = crew.find((c: any) => c.job === 'Director' || c.job === 'Series Director')
    const directorId: number | null = director?.id ?? null

    const features: MovieFeatures = {
      tmdbId, mediaType, genreIds, keywords, castIds, directorId,
      popularity: data.popularity || 0,
      voteAverage: data.vote_average || 0,
      voteCount: data.vote_count || 0,
      releaseDate: data.release_date || data.first_air_date || '',
      title: data.title || data.name || '',
      posterPath: data.poster_path || null,
      backdropPath: data.backdrop_path || null,
      overview: data.overview || '',
    }

    movieFeatureCache.set(cacheKey, features)
    return features
  } catch {
    return null
  }
}
