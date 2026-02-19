// ============================================================
// CineMatch AI — Feature Store
// X Algorithm equivalent: User Feature Hydration + Movie Feature Store
//
// Reads user interaction history from Supabase to build:
//   - genre affinity vector   (with exponential time-decay)
//   - keyword affinity vector (with exponential time-decay)
//   - cast/director affinity vector (with exponential time-decay)
// ============================================================

import { supabaseAdmin } from '../lib/supabase'
import NodeCache from 'node-cache'
import { UserProfile, RecentItem, MediaType } from './types'

const TMDB_API_KEY = process.env.VITE_TMDB_API_KEY || ''
const TMDB_BASE = 'https://api.themoviedb.org/3'

// L1 in-memory cache for movie features (2hr TTL)
const movieFeatureCache = new NodeCache({ stdTTL: 7200, checkperiod: 300 })
// L1 for user profiles (5min TTL)
const userProfileCache = new NodeCache({ stdTTL: 300, checkperiod: 60 })

const MAX_RECENT_ITEMS = 5  // Seed candidate sources from last N watched
const DECAY_HALF_LIFE_DAYS = 30  // All vectors halve every 30 days

// ── Time-decay factor ──────────────────────────────────────
function timeDecay(createdAt: string): number {
  const ageDays = (Date.now() - new Date(createdAt).getTime()) / 86_400_000
  return Math.exp(-ageDays * Math.LN2 / DECAY_HALF_LIFE_DAYS)
}

// ── Normalize a vector to [0, 1] ───────────────────────────
function normalizeVector(vec: Record<number, number>): Record<number, number> {
  const max = Math.max(...Object.values(vec), 1)
  const normalized: Record<number, number> = {}
  for (const [k, v] of Object.entries(vec)) {
    normalized[Number(k)] = v / max
  }
  return normalized
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

// ── User Profile Builder ───────────────────────────────────
// Builds genre + keyword + cast affinity vectors from interaction history.
// For cold-start (<5 interactions), seeds from persisted DB profile.
export async function getUserProfile(userId: string): Promise<UserProfile> {
  const cached = userProfileCache.get<UserProfile>(userId)
  if (cached) return cached

  // Fetch all interaction events (last 200)
  const { data: interactions, error } = await supabaseAdmin
    .from('UserInteractions')
    .select('tmdbId, mediaType, eventType, weight, createdAt, progress')
    .eq('userId', userId)
    .order('createdAt', { ascending: false })
    .limit(200)

  if (error || !interactions || interactions.length === 0) {
    return emptyProfile(userId)
  }

  const genreVector: Record<number, number> = {}
  const keywordVector: Record<number, number> = {}
  const castVector: Record<number, number> = {}
  const watchedIds = new Set<number>()
  const favoritedIds = new Set<number>()
  const dislikedIds = new Set<number>()
  const recentWatchMap = new Map<number, RecentItem>()

  // For cold-start: seed from persisted genre profile first
  if (interactions.length < 5) {
    const seeded = await seedFromPersistedProfile(userId, genreVector)
    if (seeded) {
      // If we seeded from DB, the interaction count is still real
      // We just gave the vector a head start
    }
  }

  // Batch-fetch features for top 30 recent interactions in parallel
  const topInteractions = interactions.slice(0, 30)
  const featureBatch = await Promise.allSettled(
    topInteractions.map(i => getMovieFeatures(i.tmdbId, i.mediaType as MediaType))
  )

  for (let idx = 0; idx < interactions.length; idx++) {
    const interaction = interactions[idx]
    const decay = timeDecay(interaction.createdAt)

    // Skip disliked items from positive-signal accumulation
    if (interaction.eventType === 'dislike') {
      dislikedIds.add(interaction.tmdbId)
      continue
    }

    const adjustedWeight = interaction.weight * decay

    if (interaction.eventType === 'watch') watchedIds.add(interaction.tmdbId)
    if (interaction.eventType === 'favorite') favoritedIds.add(interaction.tmdbId)

    // Accumulate genre + keyword + cast vectors for top-30 interactions
    if (idx < 30) {
      const result = featureBatch[idx]
      if (result.status === 'fulfilled' && result.value) {
        const features = result.value

        // Genre vector
        for (const genreId of features.genreIds) {
          genreVector[genreId] = (genreVector[genreId] || 0) + adjustedWeight
        }

        // Keyword affinity vector (top keywords from watched movies)
        if (interaction.eventType === 'watch' || interaction.eventType === 'favorite') {
          for (const kwId of features.keywords) {
            keywordVector[kwId] = (keywordVector[kwId] || 0) + adjustedWeight
          }
        }

        // Cast affinity vector
        if (interaction.eventType === 'watch' || interaction.eventType === 'favorite') {
          for (const castId of features.castIds) {
            castVector[castId] = (castVector[castId] || 0) + adjustedWeight
          }
          // Director gets double weight (strong creative signal)
          if (features.directorId) {
            castVector[features.directorId] = (castVector[features.directorId] || 0) + adjustedWeight * 2
          }
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

  // Normalize all vectors to [0, 1]
  const profile: UserProfile = {
    userId,
    genreVector: normalizeVector(genreVector),
    keywordVector: normalizeVector(keywordVector),
    castVector: normalizeVector(castVector),
    watchedIds,
    favoritedIds,
    dislikedIds,
    recentlyWatched: Array.from(recentWatchMap.values())
      .sort((a, b) => b.weight - a.weight)
      .slice(0, MAX_RECENT_ITEMS),
    isNewUser: interactions.length < 3,
  }

  userProfileCache.set(userId, profile)
  return profile
}

// ── Seed genre vector from persisted DB profile (cold-start) ──
// Prevents a totally empty vector on first request after login
async function seedFromPersistedProfile(
  userId: string,
  genreVector: Record<number, number>
): Promise<boolean> {
  try {
    const { data } = await supabaseAdmin
      .from('UserGenreProfile')
      .select('genreMap')
      .eq('userId', userId)
      .single()

    if (!data?.genreMap || typeof data.genreMap !== 'object') return false

    // Seed with 50% weight (will be overridden as interactions accumulate)
    for (const [genreId, weight] of Object.entries(data.genreMap as Record<string, number>)) {
      genreVector[Number(genreId)] = (genreVector[Number(genreId)] || 0) + weight * 0.5
    }
    return true
  } catch {
    return false
  }
}

// ── Invalidate user profile cache ──────────────────────────
export function invalidateUserProfile(userId: string): void {
  userProfileCache.del(userId)
}

// ── Empty profile (guest / new user) ──────────────────────
function emptyProfile(userId: string): UserProfile {
  return {
    userId,
    genreVector: {},
    keywordVector: {},
    castVector: {},
    watchedIds: new Set(),
    favoritedIds: new Set(),
    dislikedIds: new Set(),
    recentlyWatched: [],
    isNewUser: true,
  }
}
