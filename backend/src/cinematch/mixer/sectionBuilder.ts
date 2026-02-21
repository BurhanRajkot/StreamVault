// ============================================================
// CineMatch AI — Section Builder (v2)
// ============================================================
// Completely rewritten to use the seedTitle field set by candidate
// sources. Previously used string-searching which always failed.
//
// Algorithm:
// 1. "Because you watched {X}" — one section per seed title
//    Groups tmdb_similar + tmdb_recommendations by candidate.seedTitle
// 2. "More {GenreName}" — one section per top genre
//    Groups genre_discovery by candidate.seedTitle (= genre name)
// 3. "Fans with your taste also loved" — collaborative picks
// 4. "Trending this week" — trending rows
// 5. "Personalized For You" — remaining high-scoring picks
// ============================================================

import { ScoredCandidate, UserProfile, RecommendationSection } from '../types'

const MIN_SECTION_SIZE = 5   // Don't display a section with fewer than this many items
const MAX_SECTION_SIZE = 20  // Cap each section at this for frontend

export function buildSections(
  ranked: ScoredCandidate[],
  profile: UserProfile,
): RecommendationSection[] {
  const sections: RecommendationSection[] = []
  const usedIds = new Set<number>()

  // ── 1. "Because you watched {X}" ──────────────────────────
  // Group candidates by seedTitle from tmdb_similar + tmdb_recommendations
  const seedSimilarMap = new Map<string, ScoredCandidate[]>()

  for (const c of ranked) {
    if (
      c.seedTitle &&
      (c.source === 'tmdb_similar' || c.source === 'tmdb_recommendations')
    ) {
      if (!seedSimilarMap.has(c.seedTitle)) {
        seedSimilarMap.set(c.seedTitle, [])
      }
      const section = seedSimilarMap.get(c.seedTitle)!
      if (!usedIds.has(c.tmdbId) && section.length < MAX_SECTION_SIZE) {
        section.push(c)
        usedIds.add(c.tmdbId)
      }
    }
  }

  // Emit one section per seed title that has enough items
  // Sort seeds by the highest-scoring candidate in each group (most relevant first)
  const seedEntries = Array.from(seedSimilarMap.entries())
    .filter(([, items]) => items.length >= MIN_SECTION_SIZE)
    .sort((a, b) => (b[1][0]?.score ?? 0) - (a[1][0]?.score ?? 0))

  for (const [seedTitle, items] of seedEntries) {
    sections.push({
      title: `Because you watched ${seedTitle}`,
      items: items.sort((a, b) => b.score - a.score),
      source: 'tmdb_similar',
    })
  }

  // ── 2. "More {Genre}" ─────────────────────────────────────
  // Group genre_discovery candidates by their seedTitle (= genre name)
  const genreMap = new Map<string, ScoredCandidate[]>()

  for (const c of ranked) {
    if (c.source === 'genre_discovery' && c.seedTitle) {
      if (!genreMap.has(c.seedTitle)) {
        genreMap.set(c.seedTitle, [])
      }
      const section = genreMap.get(c.seedTitle)!
      if (!usedIds.has(c.tmdbId) && section.length < MAX_SECTION_SIZE) {
        section.push(c)
        usedIds.add(c.tmdbId)
      }
    }
  }

  for (const [genreName, items] of genreMap.entries()) {
    if (items.length >= MIN_SECTION_SIZE) {
      sections.push({
        title: `Top ${genreName} Picks For You`,
        items: items.sort((a, b) => b.score - a.score),
        source: 'genre_discovery',
      })
    }
  }

  // ── 3. Collaborative — "Fans with your taste" ─────────────
  const collabItems = ranked
    .filter((c) => c.source === 'collaborative' && !usedIds.has(c.tmdbId))
    .slice(0, MAX_SECTION_SIZE)

  if (collabItems.length >= MIN_SECTION_SIZE) {
    for (const c of collabItems) usedIds.add(c.tmdbId)
    sections.push({
      title: 'Fans with Your Taste Also Loved',
      items: collabItems,
      source: 'collaborative',
    })
  }

  // ── 4. Trending ───────────────────────────────────────────
  const trendingItems = ranked
    .filter((c) => c.source === 'trending' && !usedIds.has(c.tmdbId))
    .slice(0, MAX_SECTION_SIZE)

  if (trendingItems.length >= MIN_SECTION_SIZE) {
    for (const c of trendingItems) usedIds.add(c.tmdbId)
    sections.push({
      title: 'Trending This Week',
      items: trendingItems,
      source: 'trending',
    })
  }

  // ── 5. Personalized Picks — remaining high-scorers ────────
  const personalizedItems = ranked
    .filter((c) => !usedIds.has(c.tmdbId))
    .sort((a, b) => b.score - a.score)
    .slice(0, MAX_SECTION_SIZE)

  if (personalizedItems.length >= MIN_SECTION_SIZE) {
    sections.push({
      title: profile.isNewUser ? 'Popular Right Now' : 'Personalized For You',
      items: personalizedItems,
      source: 'popular_fallback',
    })
  }

  return sections
}
