import { Candidate, UserProfile, MediaType } from '../types'
import { fetchTMDB, mapTMDBItem, toPagedResults } from '../utils/tmdb'

// Fetches TMDB Recommendations for each recently watched item
// Seeds top 4 items and fetches 12 per seed for faster cold pipelines
// Attaches seedTitle so section builder knows which watch generated the recommendation
const SEED_COUNT = 6

export async function tmdbRecommendationsSource(profile: UserProfile): Promise<Candidate[]> {
  if (profile.recentlyWatched.length === 0) {
    // Cold-start / Guest fallback: Return top-rated movies and TV shows
    const [movieData, tvData] = await Promise.allSettled([
      fetchTMDB('/movie/top_rated?page=1'),
      fetchTMDB('/tv/top_rated?page=1'),
    ])

    const movies = movieData.status === 'fulfilled'
      ? toPagedResults(movieData.value)
          .slice(0, 20)
          .map((r) => mapTMDBItem(r, 'movie', 'tmdb_recommendations'))
          .filter(Boolean) as Candidate[]
      : []

    const tv = tvData.status === 'fulfilled'
      ? toPagedResults(tvData.value)
          .slice(0, 20)
          .map((r) => mapTMDBItem(r, 'tv', 'tmdb_recommendations'))
          .filter(Boolean) as Candidate[]
      : []

    return [...movies, ...tv]
  }

  // The six titles the user is most into, a full page each: TMDB's
  // recommendations are its best signal, and a title several seeds agree on
  // gains rank in the fusion step
  const results = await Promise.allSettled(
    profile.recentlyWatched.slice(0, SEED_COUNT).map(async (item) => {
      const data = await fetchTMDB(`/${item.mediaType}/${item.tmdbId}/recommendations`)
      return toPagedResults(data)
        .slice(0, 20)
        .map((r) => {
          const rObj = r as { media_type?: string }
          const mt: MediaType = rObj.media_type === 'tv' ? 'tv' : item.mediaType
          const candidate = mapTMDBItem(r, mt, 'tmdb_recommendations')
          if (!candidate) return null
          // Attach the seed title for section builder attribution
          return { ...candidate, seedTitle: item.title, seedMediaType: item.mediaType } as Candidate
        })
        .filter(Boolean) as Candidate[]
    })
  )

  const perSeed = results
    .filter((r) => r.status === 'fulfilled')
    .map((r) => (r as PromiseFulfilledResult<Candidate[]>).value)
  return interleave(perSeed)
}

/**
 * Round-robin across seeds: each seed's best pick, then each one's second…
 * Concatenated, the fifth and sixth seeds' picks sat at ranks 80–120 of this
 * list, and fusion ranks by position — they fell past the ranking cap and
 * those seeds never got a "Because you watched" row.
 */
export function interleave<T>(lists: T[][]): T[] {
  const out: T[] = []
  const longest = Math.max(0, ...lists.map((l) => l.length))
  for (let i = 0; i < longest; i++) {
    for (const list of lists) if (i < list.length) out.push(list[i])
  }
  return out
}
