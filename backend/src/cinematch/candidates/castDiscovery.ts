import { Candidate, UserProfile } from '../types'
import { fetchTMDB, mapTMDBItem } from '../utils/tmdb'

// ──────────────────────────────────────────────────────────────
// Cast Discovery — Actor/Director Personalization
// ──────────────────────────────────────────────────────────────
// Looks at the user's castVector to find their absolute favorite
// actor or director and creates a row entirely dedicated
// to their best work.
// "Starring Leonardo DiCaprio" or "Starring Cillian Murphy"
// ──────────────────────────────────────────────────────────────

export async function castDiscoverySource(profile: UserProfile): Promise<Candidate[]> {
  if (profile.isNewUser) return []

  // Get Top 1 most-watched cast member
  // (We only pick 1 to avoid cluttering the home page with too many cast rows)
  const topCast = Object.entries(profile.castVector)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 1)
    .map(([id, weight]) => ({
      id: Number(id),
      weight,
    }))

  if (topCast.length === 0) return []

  const results = await Promise.allSettled(
    topCast.map(async (castMem) => {
      try {
        // 1. Fetch human-readable person name from TMDB
        const personData = await fetchTMDB(`/person/${castMem.id}`)
        const personName = personData.name
        if (!personName) return []

        // 2. Discover highly-rated movies with this actor
        const movieData = await fetchTMDB(
          `/discover/movie?sort_by=vote_average.desc&with_cast=${castMem.id}&vote_count.gte=200&page=1`
        )
        const movieCandidates = ((movieData.results || []) as any[]).map((r: any) => {
          const c = mapTMDBItem(r, 'movie', 'cast_discovery')
          if (!c) return null
          return { ...c, seedTitle: `Starring ${personName}` } as Candidate
        }).filter(Boolean) as Candidate[]

        return movieCandidates
      } catch (err) {
        console.error(`[CastDiscovery] Failed to fetch cast ${castMem.id}:`, err)
        return []
      }
    })
  )

  return results
    .filter((r) => r.status === 'fulfilled')
    .flatMap((r) => (r as PromiseFulfilledResult<Candidate[]>).value)
}
