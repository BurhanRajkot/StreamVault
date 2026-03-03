// ============================================================
// CineMatch AI — Section Builder (v3)
// ============================================================
// Uses candidate.sources[] (all RRF source memberships) and
// candidate.seedTitles{} (per-source seed labels) so each candidate
// can contribute to multiple sections simultaneously.
//
// A candidate that appears in BOTH tmdb_similar (seeded by "Inception")
// AND genre_discovery (seeded by "Sci-Fi") will appear in:
//   • "Because you watched Inception"
//   • "Top Sci-Fi Picks For You"
//
// Sections produced (in order):
//   1. "Because you watched {X}"        — tmdb_similar + tmdb_recommendations
//   2. "Top {Genre} Picks For You"      — genre_discovery
//   3. "{Keyword} Picks For You"        — keyword_discovery
//   4. "Starring {Actor}"               — cast_discovery
//   5. "Fans with Your Taste Also Loved"— collaborative
//   6. "Trending This Week"             — trending
//   7. "Personalized For You" / "Popular Right Now" — remaining
// ============================================================

import { ScoredCandidate, UserProfile, RecommendationSection, CandidateSource } from '../types'

const MIN_SECTION_SIZE = 5   // Don't display a section with fewer than this many items
const MAX_SECTION_SIZE = 40  // Cap each section at this for frontend

/** Helper: check if a candidate belongs to a given source */
function hasSource(c: ScoredCandidate, source: CandidateSource): boolean {
  return c.sources ? c.sources.includes(source) : c.source === source
}

/** Helper: get the seedTitle for a specific source context */
function seedFor(c: ScoredCandidate, source: CandidateSource): string | undefined {
  return c.seedTitles?.[source] ?? (c.source === source ? c.seedTitle : undefined)
}

export function buildSections(
  ranked: ScoredCandidate[],
  profile: UserProfile,
): RecommendationSection[] {
  const sections: RecommendationSection[] = []

  // ── 1. "Because you watched {X}" ──────────────────────────
  // Each seed title gets its own section; candidates can own items
  // across multiple such sections.
  const seedSimilarMap = new Map<string, ScoredCandidate[]>()

  for (const c of ranked) {
    if (!hasSource(c, 'tmdb_similar') && !hasSource(c, 'tmdb_recommendations')) continue

    // Gather every seed title this candidate was surfaced by
    const titlesForThisCandidate = new Set<string>()
    if (seedFor(c, 'tmdb_similar'))         titlesForThisCandidate.add(seedFor(c, 'tmdb_similar')!)
    if (seedFor(c, 'tmdb_recommendations')) titlesForThisCandidate.add(seedFor(c, 'tmdb_recommendations')!)

    for (const seedTitle of titlesForThisCandidate) {
      if (!seedSimilarMap.has(seedTitle)) seedSimilarMap.set(seedTitle, [])
      const section = seedSimilarMap.get(seedTitle)!
      if (section.length < MAX_SECTION_SIZE) section.push(c)
    }
  }

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

  // ── 2. "Top {Genre} Picks For You" ────────────────────────
  const genreMap = new Map<string, ScoredCandidate[]>()

  for (const c of ranked) {
    if (!hasSource(c, 'genre_discovery')) continue
    const label = seedFor(c, 'genre_discovery')
    if (!label) continue
    if (!genreMap.has(label)) genreMap.set(label, [])
    const section = genreMap.get(label)!
    if (section.length < MAX_SECTION_SIZE) section.push(c)
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

  // ── 3. Keyword Discovery ───────────────────────────────────
  const keywordMap = new Map<string, ScoredCandidate[]>()

  for (const c of ranked) {
    if (!hasSource(c, 'keyword_discovery')) continue
    const label = seedFor(c, 'keyword_discovery')
    if (!label) continue
    if (!keywordMap.has(label)) keywordMap.set(label, [])
    const section = keywordMap.get(label)!
    if (section.length < MAX_SECTION_SIZE) section.push(c)
  }

  for (const [keywordName, items] of keywordMap.entries()) {
    if (items.length >= MIN_SECTION_SIZE) {
      sections.push({
        title: `${keywordName} Picks For You`,
        items: items.sort((a, b) => b.score - a.score),
        source: 'keyword_discovery',
      })
    }
  }

  // ── 4. Cast Discovery — "Starring {Actor}" ────────────────
  const castMap = new Map<string, ScoredCandidate[]>()

  for (const c of ranked) {
    if (!hasSource(c, 'cast_discovery')) continue
    const label = seedFor(c, 'cast_discovery')
    if (!label) continue
    if (!castMap.has(label)) castMap.set(label, [])
    const section = castMap.get(label)!
    if (section.length < MAX_SECTION_SIZE) section.push(c)
  }

  for (const [castLabel, items] of castMap.entries()) {
    if (items.length >= MIN_SECTION_SIZE) {
      sections.push({
        title: castLabel, // e.g. "Starring Christopher Nolan"
        items: items.sort((a, b) => b.score - a.score),
        source: 'cast_discovery',
      })
    }
  }

  // ── 5. Collaborative — "Fans with your taste" ─────────────
  const collabItems = ranked
    .filter((c) => hasSource(c, 'collaborative'))
    .slice(0, MAX_SECTION_SIZE)

  if (collabItems.length >= MIN_SECTION_SIZE) {
    sections.push({
      title: 'Fans with Your Taste Also Loved',
      items: collabItems,
      source: 'collaborative',
    })
  }

  // ── 6. Trending ───────────────────────────────────────────
  const trendingItems = ranked
    .filter((c) => hasSource(c, 'trending'))
    .slice(0, MAX_SECTION_SIZE)

  if (trendingItems.length >= MIN_SECTION_SIZE) {
    sections.push({
      title: 'Trending This Week',
      items: trendingItems,
      source: 'trending',
    })
  }

  // ── 7. Personalized Picks — all high-scorers not yet shown ─
  // Build a set of tmdbIds already in "Because you watched" sections
  // so we don't duplicate those in the personalized row.
  // Genre/cast/collab items CAN be duplicated here — it's fine for the last row.
  const watchedSectionIds = new Set<number>()
  for (const [, items] of seedSimilarMap.entries()) {
    for (const c of items) watchedSectionIds.add(c.tmdbId)
  }

  const personalizedItems = ranked
    .filter((c) => !watchedSectionIds.has(c.tmdbId))
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

