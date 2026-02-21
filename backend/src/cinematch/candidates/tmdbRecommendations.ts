import { Candidate, UserProfile, MediaType } from '../types'
import { fetchTMDB, mapTMDBItem } from '../utils/tmdb'

// Fetches TMDB Recommendations for each recently watched item
// Seeds 5 items (up from 3) and fetches 20 per seed (up from 10)
// Attaches seedTitle so section builder knows which watch generated the recommendation
export async function tmdbRecommendationsSource(profile: UserProfile): Promise<Candidate[]> {
  if (profile.recentlyWatched.length === 0) return []

  const results = await Promise.allSettled(
    profile.recentlyWatched.slice(0, 5).map(async (item) => {
      const data = await fetchTMDB(`/${item.mediaType}/${item.tmdbId}/recommendations`)
      return ((data.results || []) as any[])
        .slice(0, 20)
        .map((r: any) => {
          const mt: MediaType = r.media_type === 'tv' ? 'tv' : item.mediaType
          const candidate = mapTMDBItem(r, mt, 'tmdb_recommendations')
          if (!candidate) return null
          // Attach the seed title for section builder attribution
          return { ...candidate, seedTitle: item.title, seedMediaType: item.mediaType } as Candidate
        })
        .filter(Boolean) as Candidate[]
    })
  )

  return results
    .filter((r) => r.status === 'fulfilled')
    .flatMap((r) => (r as PromiseFulfilledResult<Candidate[]>).value)
}
