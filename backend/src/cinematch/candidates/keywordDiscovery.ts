import { Candidate, UserProfile } from '../types'
import { fetchTMDB, mapTMDBItem } from '../utils/tmdb'

// ──────────────────────────────────────────────────────────────
// Keyword Discovery — Highly Niche Personalization
// ──────────────────────────────────────────────────────────────
// This source inspects the user's keywordVector (which silently
// accumulates based on everything they watch/favorite).
// It picks the 2 highest-weighted keywords, fetches their human
// names from TMDB, and queries for highly-rated content that matches.
//
// This is how the system dynamically creates rows like:
// "Top Cyberpunk Picks For You" or "Top Anime Picks"
// without hardcoding those categories.
// ──────────────────────────────────────────────────────────────

export async function keywordDiscoverySource(profile: UserProfile): Promise<Candidate[]> {
  if (profile.isNewUser) return []

  // Get top 2 keywords the user actually likes
  const topKeywords = Object.entries(profile.keywordVector)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 2)
    .map(([id, weight]) => ({
      id: Number(id),
      weight,
    }))

  if (topKeywords.length === 0) return []

  const results = await Promise.allSettled(
    topKeywords.flatMap(async (keyword) => {
      try {
        // 1. Fetch human-readable keyword name from TMDB
        const kwData = await fetchTMDB(`/keyword/${keyword.id}`)
        const keywordName = kwData.name
        if (!keywordName) return []

        // Format name for UI: e.g. "anime" -> "Anime", "cyberpunk" -> "Cyberpunk"
        const formattedName = keywordName
          .split(' ')
          .map((w: string) => w.charAt(0).toUpperCase() + w.slice(1))
          .join(' ')

        // 2. Discover movies with this keyword
        const movieData = await fetchTMDB(
          `/discover/movie?sort_by=vote_average.desc&with_keywords=${keyword.id}&vote_count.gte=100&page=1`
        )
        const movieCandidates = ((movieData.results || []) as any[]).slice(0, 10).map((r: any) => {
          const c = mapTMDBItem(r, 'movie', 'keyword_discovery')
          if (!c) return null
          return { ...c, seedTitle: formattedName } as Candidate
        }).filter(Boolean) as Candidate[]

        // 3. Discover TV shows with this keyword
        const tvData = await fetchTMDB(
          `/discover/tv?sort_by=vote_average.desc&with_keywords=${keyword.id}&vote_count.gte=50&page=1`
        )
        const tvCandidates = ((tvData.results || []) as any[]).slice(0, 10).map((r: any) => {
          const c = mapTMDBItem(r, 'tv', 'keyword_discovery')
          if (!c) return null
          return { ...c, seedTitle: formattedName } as Candidate
        }).filter(Boolean) as Candidate[]

        return [...movieCandidates, ...tvCandidates]
      } catch (err) {
        console.error(`[KeywordDiscovery] Failed to fetch keyword ${keyword.id}:`, err)
        return []
      }
    })
  )

  return results
    .filter((r) => r.status === 'fulfilled')
    .flatMap((r) => (r as PromiseFulfilledResult<Candidate[]>).value)
}
