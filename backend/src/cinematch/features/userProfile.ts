import { supabaseAdmin } from '../../lib/supabase'
import NodeCache from 'node-cache'
import { UserProfile, RecentItem, MediaType } from '../types'
import { getMovieFeatures } from './movieFeatures'
import { getCategoriesForGenres } from '../categories'

// L1 for user profiles (5min TTL)
const userProfileCache = new NodeCache({ stdTTL: 300, checkperiod: 60 })

const MAX_RECENT_ITEMS = 8  // Seed candidate sources from last N watched (up from 5)
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

// ── Normalize genre vector preserving sign ─────────────────
// Dislikes produce negative weights — dividing by absMax keeps
// values in [-1, 1] so the ranker can penalize disliked genres.
function normalizeGenreVector(vec: Record<number, number>): Record<number, number> {
  const absMax = Math.max(...Object.values(vec).map(Math.abs), 1)
  const normalized: Record<number, number> = {}
  for (const [k, v] of Object.entries(vec)) {
    normalized[Number(k)] = v / absMax
  }
  return normalized
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
    categoryDislikeCounts: {},
    recentlyWatched: [],
    isNewUser: true,
  }
}

// ── User Profile Builder ───────────────────────────────────
// Builds genre + keyword + cast affinity vectors from interaction history.
// For cold-start (<5 interactions), seeds from persisted DB profile.
export async function getUserProfile(userId: string): Promise<UserProfile> {
  const cached = userProfileCache.get<UserProfile>(userId)
  if (cached) return cached

  // Fetch all interaction events (last 500 for richer vectors)
  const { data: interactions, error } = await supabaseAdmin
    .from('UserInteractions')
    .select('tmdbId, mediaType, eventType, weight, createdAt, progress')
    .eq('userId', userId)
    .order('createdAt', { ascending: false })
    .limit(500)

  if (error || !interactions || interactions.length === 0) {
    return emptyProfile(userId)
  }

  const genreVector: Record<number, number> = {}
  const keywordVector: Record<number, number> = {}
  const castVector: Record<number, number> = {}
  const watchedIds = new Set<number>()
  const favoritedIds = new Set<number>()
  const dislikedIds = new Set<number>()
  const categoryDislikeCounts: Record<string, number> = {}
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

    const isDislike = interaction.eventType === 'dislike'

    if (isDislike) {
      // Always record the disliked item so it's filtered out entirely
      dislikedIds.add(interaction.tmdbId)
    } else if (interaction.eventType === 'watch') {
      watchedIds.add(interaction.tmdbId)
    } else if (interaction.eventType === 'favorite') {
      favoritedIds.add(interaction.tmdbId)
    }

    // Dislikes get a 1.5× negative penalty so a few dislikes of the same genre
    // are enough to measurably shift the affinity vectors.
    const adjustedWeight = isDislike
      ? -0.6 * decay * 1.5
      : interaction.weight * decay

    // Accumulate genre + keyword + cast vectors for top-30 interactions
    // (includes dislikes so their genres get subtracted)
    if (idx < 30) {
      const result = featureBatch[idx]
      if (result.status === 'fulfilled' && result.value) {
        const features = result.value

        // Track per-category dislike count for category-level suppression
        if (isDislike) {
          const cats = getCategoriesForGenres(features.genreIds)
          for (const cat of cats) {
            categoryDislikeCounts[cat] = (categoryDislikeCounts[cat] || 0) + 1
          }
        }

        // Genre vector — positive for liked/watched, negative for disliked
        for (const genreId of features.genreIds) {
          genreVector[genreId] = (genreVector[genreId] || 0) + adjustedWeight
        }

        // Keyword and cast affinity only for positive signals
        if (!isDislike) {
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
  }

  // Normalize positive vectors to [0, 1].
  // Genre vector may contain negative values (from dislikes) — normalize
  // preserving sign so ranking can penalize disliked genres.
  const profile: UserProfile = {
    userId,
    genreVector: normalizeGenreVector(genreVector),
    keywordVector: normalizeVector(keywordVector),
    castVector: normalizeVector(castVector),
    watchedIds,
    favoritedIds,
    dislikedIds,
    categoryDislikeCounts,
    recentlyWatched: Array.from(recentWatchMap.values())
      .sort((a, b) => b.weight - a.weight)
      .slice(0, MAX_RECENT_ITEMS),
    isNewUser: interactions.length < 3,
  }

  userProfileCache.set(userId, profile)
  return profile
}

// ── Invalidate user profile cache ──────────────────────────
export function invalidateUserProfile(userId: string): void {
  userProfileCache.del(userId)
}
