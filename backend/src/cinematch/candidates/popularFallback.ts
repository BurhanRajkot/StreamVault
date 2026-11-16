import { Candidate, UserProfile } from '../types'
import { fetchTMDB, mapTMDBItem, toPagedResults } from '../utils/tmdb'

/** Talk shows, news, reality, soaps and kids' TV. */
const NOT_SERIES = '10767,10763,10764,10766,10762'

function yearsAgo(n: number): string {
  const d = new Date()
  d.setFullYear(d.getFullYear() - n)
  return d.toISOString().slice(0, 10)
}

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
      fetchTMDB(`/discover/tv?sort_by=popularity.desc&vote_count.gte=150&first_air_date.gte=${yearsAgo(10)}&without_genres=${NOT_SERIES}`),
    ])
    const movies = movieData.status === 'fulfilled'
      ? toPagedResults(movieData.value)
          .map((r) => mapTMDBItem(r, 'movie', 'popular_fallback')).filter(Boolean) as Candidate[]
      : []
    const tv = tvData.status === 'fulfilled'
      ? toPagedResults(tvData.value)
          .map((r) => mapTMDBItem(r, 'tv', 'popular_fallback')).filter(Boolean) as Candidate[]
      : []
    return [...movies, ...tv]
  }

  // For each top genre, fetch popular movies AND TV
  const results = await Promise.allSettled(
    topGenres.flatMap((genreId) => [
      fetchTMDB(`/discover/movie?sort_by=popularity.desc&with_genres=${genreId}&vote_count.gte=300&vote_average.gte=6.5`),
      // TV popularity is led by decades-old syndicated shows: ask for ones
      // still airing that started this decade, and no talk/news/reality/soaps
      fetchTMDB(`/discover/tv?sort_by=popularity.desc&with_genres=${genreId}&vote_count.gte=150&vote_average.gte=7&first_air_date.gte=${yearsAgo(10)}&without_genres=${NOT_SERIES}`)
    ])
  )

  const candidates: Candidate[] = []
  for (let i = 0; i < results.length; i++) {
    const r = results[i]
    if (r.status !== 'fulfilled') continue
    const mediaType = i % 2 === 0 ? 'movie' : 'tv'
    for (const item of toPagedResults(r.value)) {
      const c = mapTMDBItem(item, mediaType, 'popular_fallback')
      if (c) candidates.push(c)
    }
  }
  return candidates
}
