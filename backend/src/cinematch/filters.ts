// ============================================================
// CineMatch AI — Pre-Ranking Filters
// X Algorithm equivalent: Pre-Scoring Filters stage in Home Mixer
//
// Filters run sequentially in a pipeline. Each filter is a pure
// function: (candidates[], profile) → candidates[]
// ============================================================

import { Candidate, UserProfile } from './types'

// ── FILTER 1: Deduplication ───────────────────────────────────
// Same as X's DropDuplicatesFilter — remove duplicate tmdbIds
// Keeps the first occurrence (highest-priority source wins)
export function deduplicateFilter(candidates: Candidate[]): Candidate[] {
  const seen = new Set<string>()
  return candidates.filter(c => {
    const key = `${c.mediaType}:${c.tmdbId}`
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
}

// ── FILTER 2: Already Watched ─────────────────────────────────
// X analog: PreviouslySeenPostsFilter
// Remove content the user has significantly watched (>50% progress)
export function alreadyWatchedFilter(
  candidates: Candidate[],
  profile: UserProfile,
): Candidate[] {
  return candidates.filter(c => !profile.watchedIds.has(c.tmdbId))
}

// ── FILTER 3: Already Favorited ───────────────────────────────
// Don't recommend what's already in the user's favorites
export function alreadyFavoritedFilter(
  candidates: Candidate[],
  profile: UserProfile,
): Candidate[] {
  return candidates.filter(c => !profile.favoritedIds.has(c.tmdbId))
}

// ── FILTER 4: Quality Gate ────────────────────────────────────
// X analog: CoreDataHydrationFilter — remove broken/incomplete candidates
// Drop items with insufficient vote data or very low ratings
export function lowQualityFilter(candidates: Candidate[]): Candidate[] {
  return candidates.filter(c =>
    c.voteCount >= 20 &&
    c.voteAverage >= 3.5 &&
    c.title.length > 0
  )
}

// ── FILTER 5: Coming Soon / No Release Date ───────────────────
// Drop items with no release date (unreleased / in production)
export function releasedFilter(candidates: Candidate[]): Candidate[] {
  const now = new Date()
  return candidates.filter(c => {
    if (!c.releaseDate) return false
    return new Date(c.releaseDate) <= now
  })
}

// ── Master Filter Pipeline ────────────────────────────────────
// Runs all filters in sequence — same as X's chained filter stages
export function applyFilters(
  candidates: Candidate[],
  profile: UserProfile,
): Candidate[] {
  let filtered = deduplicateFilter(candidates)
  filtered = alreadyWatchedFilter(filtered, profile)
  filtered = alreadyFavoritedFilter(filtered, profile)
  filtered = lowQualityFilter(filtered)
  filtered = releasedFilter(filtered)
  return filtered
}
