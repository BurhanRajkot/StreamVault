import { Candidate, UserProfile } from '../types'
import { fetchTMDB, mapTMDBItem } from '../utils/tmdb'

// Fetches TMDB Similar titles for each recently watched item
// Seeds top 4 items and fetches 12 per seed for faster cold pipelines
// Crucially: attaches seedTitle to every candidate for "Because you watched X" grouping
export async function tmdbSimilarSource(profile: UserProfile): Promise<Candidate[]> {
  if (profile.recentlyWatched.length === 0) return []

  const results = await Promise.allSettled(
    profile.recentlyWatched.slice(0, 4).map(async (item) => {
      const data = await fetchTMDB(`/${item.mediaType}/${item.tmdbId}/similar`)
      return ((data.results || []) as any[])
        .slice(0, 12)
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
