// ============================================================
// CineMatch AI — Feature Store
// X Algorithm equivalent: User Feature Hydration + Movie Feature Store
// Reads user interaction history from Supabase to build a genre
// affinity vector with exponential time-decay.
// ============================================================

import { createClient } from '@supabase/supabase-js'
import NodeCache from 'node-cache'
import { UserProfile, RecentItem, MediaType } from './types'

const supabaseUrl = process.env.SUPABASE_URL || ''
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || ''
const supabase = createClient(supabaseUrl, supabaseKey)

const TMDB_API_KEY = process.env.VITE_TMDB_API_KEY || ''
const TMDB_BASE = 'https://api.themoviedb.org/3'

// L1 in-memory cache for movie features (2hr TTL)
const movieFeatureCache = new NodeCache({ stdTTL: 7200, checkperiod: 300 })
// L1 for user profiles (5min TTL)
const userProfileCache = new NodeCache({ stdTTL: 300, checkperiod: 60 })

const MAX_RECENT_ITEMS = 5  // Seed candidate sources from last N watched
const DECAY_HALF_LIFE_DAYS = 30  // Genre affinity halves every 30 days

// ── Time-decay factor ──────────────────────────────────────
// Equivalent to X's recency weighting in user feature hydration
function timeDecay(createdAt: string): number {
  const ageDays = (Date.now() - new Date(createdAt).getTime()) / 86_400_000
  return Math.exp(-ageDays * Math.LN2 / DECAY_HALF_LIFE_DAYS)
}

// ── Movie Features (TMDB) ──────────────────────────────────
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

    // Extract genres
    const genreIds: number[] = (data.genres || []).map((g: any) => g.id)

    // Extract keyword ids
    const rawKw = data.keywords?.keywords || data.keywords?.results || []
    const keywords: number[] = rawKw.slice(0, 20).map((k: any) => k.id)

    // Extract top cast + director
    const cast = (data.credits?.cast || []).slice(0, 5)
    const castIds: number[] = cast.map((c: any) => c.id)
    const crew = data.credits?.crew || []
    const director = crew.find((c: any) => c.job === 'Director' || c.job === 'Series Director')
    const directorId: number | null = director?.id ?? null

    const features: MovieFeatures = {
      tmdbId,
      mediaType,
      genreIds,
      keywords,
      castIds,
      directorId,
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

// ── User Profile Builder ───────────────────────────────────
// Equivalent to X's Query Hydration stage:
// Reads engagement history and builds a feature vector for ranking
export async function getUserProfile(userId: string): Promise<UserProfile> {
  const cached = userProfileCache.get<UserProfile>(userId)
  if (cached) return cached

  // Fetch all interaction events for this user (last 200 for scoring)
  const { data: interactions, error } = await supabase
    .from('UserInteractions')
    .select('tmdbId, mediaType, eventType, weight, createdAt, progress')
    .eq('userId', userId)
    .order('createdAt', { ascending: false })
    .limit(200)

  if (error || !interactions || interactions.length === 0) {
    return emptyProfile(userId)
  }

  // Build genre affinity vector with time-decay
  const genreVector: Record<number, number> = {}
  const watchedIds = new Set<number>()
  const favoritedIds = new Set<number>()
  const recentWatchMap = new Map<number, { tmdbId: number; mediaType: MediaType; title: string; weight: number }>()

  // We need movie features to map tmdbIds → genres
  // Batch fetch in parallel (limited to top 30 recent interactions)
  const topInteractions = interactions.slice(0, 30)
  const featureBatch = await Promise.allSettled(
    topInteractions.map(i => getMovieFeatures(i.tmdbId, i.mediaType as MediaType))
  )

  for (let idx = 0; idx < interactions.length; idx++) {
    const interaction = interactions[idx]
    const decay = timeDecay(interaction.createdAt)
    const adjustedWeight = interaction.weight * decay

    // Track watched and favorited
    if (interaction.eventType === 'watch') {
      watchedIds.add(interaction.tmdbId)
    }
    if (interaction.eventType === 'favorite') {
      favoritedIds.add(interaction.tmdbId)
    }

    // Get genre features for this interaction (only for top 30 we fetched)
    if (idx < 30) {
      const result = featureBatch[idx]
      if (result.status === 'fulfilled' && result.value) {
        const features = result.value
        // Accumulate genre affinity
        for (const genreId of features.genreIds) {
          genreVector[genreId] = (genreVector[genreId] || 0) + adjustedWeight
        }
        // Track recently watched for candidate seeding
        if (interaction.eventType === 'watch' && !recentWatchMap.has(interaction.tmdbId)) {
          recentWatchMap.set(interaction.tmdbId, {
            tmdbId: interaction.tmdbId,
            mediaType: interaction.mediaType as MediaType,
            title: features.title,
            weight: adjustedWeight,
          })
        }
      }
    }
  }

  // Normalize genre vector to [0, 1]
  const maxGenreWeight = Math.max(...Object.values(genreVector), 1)
  const normalizedGenreVector: Record<number, number> = {}
  for (const [genreId, weight] of Object.entries(genreVector)) {
    normalizedGenreVector[Number(genreId)] = weight / maxGenreWeight
  }

  // Get top N recent items for seeding sources
  const recentlyWatched: RecentItem[] = Array.from(recentWatchMap.values())
    .sort((a, b) => b.weight - a.weight)
    .slice(0, MAX_RECENT_ITEMS)

  const profile: UserProfile = {
    userId,
    genreVector: normalizedGenreVector,
    watchedIds,
    favoritedIds,
    recentlyWatched,
    isNewUser: interactions.length < 3,
  }

  userProfileCache.set(userId, profile)
  return profile
}

// ── Invalidate user profile cache (called after new interaction) ──
export function invalidateUserProfile(userId: string): void {
  userProfileCache.del(userId)
}

// ── Empty profile for new/guest users ──
function emptyProfile(userId: string): UserProfile {
  return {
    userId,
    genreVector: {},
    watchedIds: new Set(),
    favoritedIds: new Set(),
    recentlyWatched: [],
    isNewUser: true,
  }
}
