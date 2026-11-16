import { supabaseAdmin } from '../../lib/supabase'
import NodeCache from 'node-cache'
import { UserProfile, RecentItem, MediaType } from '../types'
import { getMovieFeatures } from './movieFeatures'

// Timeout wrapper: resolve with fallback after `ms` regardless of promise state
function withTimeout<T>(promise: Promise<T>, ms: number, fallback: T): Promise<T> {
  const timer = new Promise<T>(resolve => setTimeout(() => resolve(fallback), ms))
  return Promise.race([promise, timer])
}
import { getCategoriesForGenres } from '../categories'

// L1 for user profiles (5min TTL)
const userProfileCache = new NodeCache({ stdTTL: 300, checkperiod: 60 })

const MAX_RECENT_ITEMS = 10  // Seed candidate sources from the N titles the user is most into
// Feature batch: only enrich the top-N titles with TMDB keyword/cast data.
// getMovieFeatures uses append_to_response=keywords,credits (heaviest TMDB endpoint).
const FEATURE_BATCH_SIZE = 18
/** Disliked titles whose features count against their genres, cast and keywords. */
const DISLIKE_FEATURE_BATCH = 4
const PROFILE_FEATURE_TIMEOUT_MS = Number(process.env.CINEMATCH_PROFILE_FEATURE_TIMEOUT_MS || 2500)
// Every play, resume and progress tick is a row, so a few hundred rows can be
// a single binge. A thousand reaches back months for an active viewer.
const MAX_INTERACTIONS_FETCH = 1000
const DECAY_HALF_LIFE_DAYS = 30  // All vectors halve every 30 days
/** How fast a title stops counting as "what you're into now". */
const ENGAGEMENT_HALF_LIFE_DAYS = 45
/** An old favourite keeps this much of its weight however long ago it was. */
const ENGAGEMENT_FLOOR = 0.3

interface InteractionRow {
  tmdbId: number
  mediaType: string
  eventType: string
  weight: number | string
  createdAt: string
  progress?: number | string | null
  rating?: number | null
}

/** How much one user cares about one title, from all their events on it. */
export interface TitleEngagement {
  tmdbId: number
  mediaType: MediaType
  /** Watch events — every play and progress tick, so it tracks time spent. */
  watchEvents: number
  favorited: boolean
  disliked: boolean
  /** Their star rating, if they gave one (1–5). */
  rating?: number
  lastAt: string
  /** The blended score seeds are picked by (higher = more into it). */
  score: number
}

function recency(createdAt: string, now: number): number {
  const ageDays = Math.max(0, (now - new Date(createdAt).getTime()) / 86_400_000)
  return ENGAGEMENT_FLOOR + (1 - ENGAGEMENT_FLOOR) * Math.exp(-ageDays * Math.LN2 / ENGAGEMENT_HALF_LIFE_DAYS)
}

/**
 * Collapse a user's events into one engagement score per title.
 *
 * Seeds used to be the last dozen events: whatever was opened most recently,
 * a two-minute look at a documentary counting as much as forty sessions of
 * Game of Thrones. Here a title's weight grows with how often it was played
 * (log-scaled — the 500th episode adds little), favourites and good ratings
 * add to it, and it fades with time without ever quite vanishing.
 */
export function aggregateEngagement(rows: InteractionRow[], now = Date.now()): TitleEngagement[] {
  const byTitle = new Map<string, TitleEngagement>()
  for (const row of rows) {
    const key = `${row.mediaType}:${row.tmdbId}`
    let e = byTitle.get(key)
    if (!e) {
      e = {
        tmdbId: row.tmdbId,
        mediaType: row.mediaType === 'tv' ? 'tv' : 'movie',
        watchEvents: 0,
        favorited: false,
        disliked: false,
        lastAt: row.createdAt,
        score: 0,
      }
      byTitle.set(key, e)
    }
    if (row.createdAt > e.lastAt) e.lastAt = row.createdAt
    if (row.eventType === 'watch') {
      // A brief open (logged at weight 0.1) counts for a fraction of a real session
      e.watchEvents += Number(row.weight) >= 0.4 ? 1 : 0.25
    } else if (row.eventType === 'favorite') {
      e.favorited = true
    } else if (row.eventType === 'dislike') {
      e.disliked = true
    } else if (row.eventType === 'rate' && row.rating != null && e.rating === undefined) {
      // Rows arrive newest first: the first rating seen is the current one
      e.rating = Number(row.rating)
    }
  }

  for (const e of byTitle.values()) {
    let base = Math.log1p(e.watchEvents)
    if (e.favorited) base += 1.2
    if (e.rating !== undefined) base += e.rating >= 4 ? 1 : e.rating <= 2 ? -2 : 0
    e.score = e.disliked ? 0 : Math.max(0, base) * recency(e.lastAt, now)
  }

  return [...byTitle.values()].sort((a, b) => b.score - a.score)
}

// ── Time-decay factor ──────────────────────────────────────
function timeDecay(createdAt: string): number {
  const ageDays = (Date.now() - new Date(createdAt).getTime()) / 86_400_000
  return Math.exp(-ageDays * Math.LN2 / DECAY_HALF_LIFE_DAYS)
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


// ── Seed all taste vectors from persisted DB profile (cold-start) ──
// Reads the onboarding-written genreMap (which contains numeric genre IDs +
// a `_meta` object with keyword/cast/director/decade maps).
async function seedFromPersistedProfile(
  userId: string,
  genreVector: Record<number, number>,
  keywordVector?: Record<number, number>,
  castVector?: Record<number, number>,
  directorVector?: Record<number, number>,
  decadeVector?: Record<number, number>,
): Promise<boolean> {
  try {
    const { data } = await supabaseAdmin
      .from('UserGenreProfile')
      .select('genreMap')
      .eq('userId', userId)
      .single()

    if (!data?.genreMap || typeof data.genreMap !== 'object') return false

    interface PersistedGenreMap {
      [genreId: string]: number | MetaBlock | undefined
      _meta?: MetaBlock
    }
    interface MetaBlock {
      keywordMap?: Record<string, number>
      castMap?: Record<string, number>
      directorMap?: Record<string, number>
      decadeMap?: Record<string, number>
    }

    const raw = data.genreMap as PersistedGenreMap
    const meta = raw._meta as MetaBlock | undefined

    // Seed each vector at 50% weight so live interactions can override over time.
    const seedMap = (
      src: Record<string, number> | null | undefined,
      dst: Record<number, number> | undefined
    ) => {
      if (!src || !dst) return
      for (const [id, weight] of Object.entries(src)) {
        if (id === '_meta') continue // skip meta key
        dst[Number(id)] = (dst[Number(id)] || 0) + (weight as number) * 0.5
      }
    }

    // Seed genre vector from the flat numeric keys
    seedMap(raw as Record<string, number>, genreVector)

    // Seed extended vectors from the nested _meta object
    seedMap(meta?.keywordMap,  keywordVector)
    seedMap(meta?.castMap,     castVector)
    seedMap(meta?.directorMap, directorVector)
    seedMap(meta?.decadeMap,   decadeVector)

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
    directorVector: {},
    decadeVector: {},
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

  // Fetch recent interaction events in one query to avoid a second round trip.
  // Excludes 'click'/'search' — those are weak curiosity/intent signals (browsing,
  // not taste) that would otherwise crowd real watch/favorite/rate/dislike signal
  // out of the FEATURE_BATCH_SIZE window below, since clicks happen far more often
  // than completed watches. See [[feedback-cinematch-signal-noise]].
  const { data: interactions, error } = await supabaseAdmin
    .from('UserInteractions')
    .select('tmdbId, mediaType, eventType, weight, createdAt, progress, rating')
    .eq('userId', userId)
    .in('eventType', ['watch', 'favorite', 'rate', 'dislike'])
    .order('createdAt', { ascending: false })
    .limit(MAX_INTERACTIONS_FETCH)

  if (error || !interactions || interactions.length === 0) {
    // Before giving up with an empty profile, try to seed from the onboarding
    // batch that the POST /onboarding handler wrote synchronously.
    // This handles the race condition where UserInteractions are still being
    // written async while the homepage makes its first GET /recommendations.
    const warmed: Record<number, number> = {}
    const warmedKw: Record<number, number> = {}
    const warmedCast: Record<number, number> = {}
    const warmedDir: Record<number, number> = {}
    const warmedDec: Record<number, number> = {}
    const seeded = await seedFromPersistedProfile(userId, warmed, warmedKw, warmedCast, warmedDir, warmedDec)
    if (seeded && Object.keys(warmed).length > 0) {
      const warmProfile: UserProfile = {
        userId,
        genreVector: warmed,
        keywordVector: warmedKw,
        castVector: warmedCast,
        directorVector: warmedDir,
        decadeVector: warmedDec,
        watchedIds: new Set(),
        favoritedIds: new Set(),
        dislikedIds: new Set(),
        categoryDislikeCounts: {},
        recentlyWatched: [],
        isNewUser: false, // ← has onboarding data → treat as personalized
      }
      userProfileCache.set(userId, warmProfile)
      return warmProfile
    }
    return emptyProfile(userId)
  }

  const genreVector: Record<number, number> = {}
  const keywordVector: Record<number, number> = {}
  const castVector: Record<number, number> = {}
  const directorVector: Record<number, number> = {}
  const decadeVector: Record<number, number> = {}
  const watchedIds = new Set<number>()
  const favoritedIds = new Set<number>()
  const dislikedIds = new Set<number>()
  const categoryDislikeCounts: Record<string, number> = {}

  // For cold-start: seed from persisted genre profile first.
  // Always seed — even with ≥5 interactions the persisted map gives fast warmup.
  await seedFromPersistedProfile(userId, genreVector, keywordVector, castVector, directorVector, decadeVector)

  for (const interaction of interactions) {
    if (interaction.eventType === 'dislike') dislikedIds.add(interaction.tmdbId)
    else if (interaction.eventType === 'watch') watchedIds.add(interaction.tmdbId)
    else if (interaction.eventType === 'favorite') favoritedIds.add(interaction.tmdbId)
  }

  // What the user is actually into, strongest first — this, not the last few
  // events, decides the taste vectors and the "Because you watched" seeds
  const engagement = aggregateEngagement(interactions as InteractionRow[])
  const liked = engagement.filter((e) => e.score > 0).slice(0, FEATURE_BATCH_SIZE)
  const disliked = engagement
    .filter((e) => e.disliked)
    .sort((a, b) => b.lastAt.localeCompare(a.lastAt))
    .slice(0, DISLIKE_FEATURE_BATCH)
  const topScore = liked[0]?.score || 1

  // Batch-fetch features in parallel, under a deadline so a slow TMDB
  // response never blocks the recommendation pipeline.
  const toEnrich = [...liked, ...disliked]
  const featureBatch = await withTimeout(
    Promise.allSettled(toEnrich.map((e) => getMovieFeatures(e.tmdbId, e.mediaType))),
    PROFILE_FEATURE_TIMEOUT_MS,
    toEnrich.map(() => ({ status: 'rejected' as const, reason: 'timeout' }))
  )

  const seeds: RecentItem[] = []
  const languageWeight: Record<string, number> = {}
  for (let idx = 0; idx < toEnrich.length; idx++) {
    const title = toEnrich[idx]
    const result = featureBatch[idx]
    if (!result || result.status !== 'fulfilled' || !result.value) continue
    const features = result.value
    const isDislike = idx >= liked.length

    // Liked titles weigh in proportion to engagement (the top title = 1);
    // dislikes push their traits down by a fixed amount
    const adjustedWeight = isDislike ? -0.9 * timeDecay(title.lastAt) : title.score / topScore

    if (isDislike) {
      // Track per-category dislike count for category-level suppression
      for (const cat of getCategoriesForGenres(features.genreIds)) {
        categoryDislikeCounts[cat] = (categoryDislikeCounts[cat] || 0) + 1
      }
    }

    let decade = 0
    if (features.releaseDate) {
      const year = parseInt(features.releaseDate.split('-')[0] || '0', 10)
      if (year > 1900) decade = Math.floor(year / 10) * 10
    }

    for (const genreId of features.genreIds) {
      genreVector[genreId] = (genreVector[genreId] || 0) + adjustedWeight
    }
    for (const kwId of features.keywords) {
      keywordVector[kwId] = (keywordVector[kwId] || 0) + adjustedWeight
    }
    for (const castId of features.castIds) {
      castVector[castId] = (castVector[castId] || 0) + adjustedWeight
    }
    // Director gets 2x weight as it's a strong trait
    if (features.directorId) {
      directorVector[features.directorId] = (directorVector[features.directorId] || 0) + adjustedWeight * 2
    }
    if (decade > 0) {
      decadeVector[decade] = (decadeVector[decade] || 0) + adjustedWeight
    }

    if (!isDislike && features.originalLanguage) {
      languageWeight[features.originalLanguage] = (languageWeight[features.originalLanguage] || 0) + adjustedWeight
    }

    if (!isDislike) {
      seeds.push({
        tmdbId: title.tmdbId,
        mediaType: title.mediaType,
        title: features.title,
        weight: title.score,
        genreIds: features.genreIds,
        castIds: features.castIds.slice(0, 5),
        keywords: features.keywords,
      })
    }
  }

  // Normalize positive vectors to [0, 1].
  // Genre vector may contain negative values (from dislikes) — normalize
  // preserving sign so ranking can penalize disliked genres.
  const profile: UserProfile = {
    userId,
    genreVector: normalizeGenreVector(genreVector),
    keywordVector: normalizeGenreVector(keywordVector),
    castVector: normalizeGenreVector(castVector),
    directorVector: normalizeGenreVector(directorVector),
    decadeVector: normalizeGenreVector(decadeVector),
    watchedIds,
    favoritedIds,
    dislikedIds,
    categoryDislikeCounts,
    recentlyWatched: onePerFranchise(seeds.sort((a, b) => b.weight - a.weight)).slice(0, MAX_RECENT_ITEMS),
    languageVector: shares(languageWeight),
    // User is new only if they have zero interactions — onboarding seeds ≥5
    isNewUser: interactions.length === 0,
  }

  userProfileCache.set(userId, profile)
  return profile
}

/**
 * "Kung Fu Panda", "Kung Fu Panda 2" and "Kung Fu Panda 4" are one taste,
 * not three: same-franchise titles otherwise take three of the "Because you
 * watched" rows with near-identical picks. Keyed on the title before any
 * subtitle, sequel number or "Part".
 */
export function franchiseKey(title: string): string {
  return title
    .toLowerCase()
    .split(/[:–—-]/)[0]
    .replace(/\b(part|chapter|vol(ume)?|season)\b.*$/, '')
    .replace(/\b([0-9]+|i{1,3}|iv|v|vi{0,3})\s*$/, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
}

function onePerFranchise<T extends { title: string }>(items: T[]): T[] {
  const seen = new Set<string>()
  return items.filter((item) => {
    const key = franchiseKey(item.title)
    if (!key) return true
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
}

/** Weights → shares of the total (sums to 1); empty when there's nothing to share. */
function shares(weights: Record<string, number>): Record<string, number> {
  const total = Object.values(weights).reduce((a, b) => a + Math.max(0, b), 0)
  if (total <= 0) return {}
  const out: Record<string, number> = {}
  for (const [k, v] of Object.entries(weights)) if (v > 0) out[k] = v / total
  return out
}

// ── Invalidate user profile cache ──────────────────────────
export function invalidateUserProfile(userId: string): void {
  userProfileCache.del(userId)
}
