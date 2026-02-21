import { Candidate, UserProfile } from '../types'
import { fetchTMDB, mapTMDBItem } from '../utils/tmdb'

// Fetches popular content by user's top genres - now both MOVIES and TV
// Previously was movies-only, which ignored half the catalog
export async function popularFallbackSource(profile: UserProfile): Promise<Candidate[]> {
  const topGenres = Object.entries(profile.genreVector)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([id]) => id)

  if (topGenres.length === 0) {
    // Cold-start: return popular movies + tv
    const [movieData, tvData] = await Promise.allSettled([
      fetchTMDB('/discover/movie?sort_by=popularity.desc&vote_count.gte=100'),
      fetchTMDB('/discover/tv?sort_by=popularity.desc&vote_count.gte=100'),
    ])
    const movies = movieData.status === 'fulfilled'
      ? ((movieData.value.results || []) as any[]).slice(0, 15)
          .map((r: any) => mapTMDBItem(r, 'movie', 'popular_fallback')).filter(Boolean) as Candidate[]
      : []
    const tv = tvData.status === 'fulfilled'
      ? ((tvData.value.results || []) as any[]).slice(0, 15)
          .map((r: any) => mapTMDBItem(r, 'tv', 'popular_fallback')).filter(Boolean) as Candidate[]
      : []
    return [...movies, ...tv]
  }

  // For each top genre, fetch popular movies AND TV
  const results = await Promise.allSettled(
    topGenres.flatMap((genreId) => [
      fetchTMDB(`/discover/movie?sort_by=popularity.desc&with_genres=${genreId}&vote_count.gte=50`),
      fetchTMDB(`/discover/tv?sort_by=popularity.desc&with_genres=${genreId}&vote_count.gte=50`)
    ])
  )

  const candidates: Candidate[] = []
  for (let i = 0; i < results.length; i++) {
    const r = results[i]
    if (r.status !== 'fulfilled') continue
    const mediaType = i % 2 === 0 ? 'movie' : 'tv'
    const items = ((r.value.results || []) as any[]).slice(0, 15)
    for (const item of items) {
      const c = mapTMDBItem(item, mediaType, 'popular_fallback')
      if (c) candidates.push(c)
    }
  }
  return candidates
}
