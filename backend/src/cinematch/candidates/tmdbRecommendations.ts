import { Candidate, UserProfile, MediaType } from '../types'
import { fetchTMDB, mapTMDBItem } from '../utils/tmdb'

// Fetches TMDB Recommendations for each recently watched item
// Seeds top 4 items and fetches 12 per seed for faster cold pipelines
// Attaches seedTitle so section builder knows which watch generated the recommendation
export async function tmdbRecommendationsSource(profile: UserProfile): Promise<Candidate[]> {
  if (profile.recentlyWatched.length === 0) {
    // Cold-start / Guest fallback: Return top-rated movies and TV shows
    const [movieData, tvData] = await Promise.allSettled([
      fetchTMDB('/movie/top_rated?page=1'),
      fetchTMDB('/tv/top_rated?page=1'),
    ])

    const movies = movieData.status === 'fulfilled'
      ? ((movieData.value.results || []) as any[])
          .slice(0, 20)
          .map((r: any) => mapTMDBItem(r, 'movie', 'tmdb_recommendations'))
          .filter(Boolean) as Candidate[]
      : []

    const tv = tvData.status === 'fulfilled'
      ? ((tvData.value.results || []) as any[])
          .slice(0, 20)
          .map((r: any) => mapTMDBItem(r, 'tv', 'tmdb_recommendations'))
          .filter(Boolean) as Candidate[]
      : []

    return [...movies, ...tv]
  }

  const results = await Promise.allSettled(
    profile.recentlyWatched.slice(0, 4).map(async (item) => {
      const data = await fetchTMDB(`/${item.mediaType}/${item.tmdbId}/recommendations`)
      return ((data.results || []) as any[])
        .slice(0, 12)
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
