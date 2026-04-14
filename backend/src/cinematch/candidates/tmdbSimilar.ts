import { Candidate, UserProfile } from '../types'
import { fetchTMDB, mapTMDBItem } from '../utils/tmdb'

// Fetches TMDB Similar titles for each recently watched item
// Seeds 8 items (up from 5) and fetches 25 per seed (up from 20)
// Crucially: attaches seedTitle to every candidate for "Because you watched X" grouping
export async function tmdbSimilarSource(profile: UserProfile): Promise<Candidate[]> {
  if (profile.recentlyWatched.length === 0) return []

  const results = await Promise.allSettled(
    profile.recentlyWatched.slice(0, 8).map(async (item) => {
      const data = await fetchTMDB(`/${item.mediaType}/${item.tmdbId}/similar`)
      return ((data.results || []) as any[])
        .slice(0, 25)
        .map((r: any) => {
          const candidate = mapTMDBItem(r, item.mediaType, 'tmdb_similar')
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
