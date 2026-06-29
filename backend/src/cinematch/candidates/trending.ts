import { Candidate, MediaType } from '../types'
import { fetchTMDB, mapTMDBItem, toPagedResults } from '../utils/tmdb'

export async function trendingSource(primaryMediaType: MediaType = 'movie'): Promise<Candidate[]> {
  const [movieData, tvData] = await Promise.allSettled([
    fetchTMDB('/trending/movie/week'),
    fetchTMDB('/trending/tv/week'),
  ])

  const movies = movieData.status === 'fulfilled'
    ? toPagedResults(movieData.value)
        .map((r) => mapTMDBItem(r, 'movie', 'trending')).filter(Boolean)
    : []

  const tv = tvData.status === 'fulfilled'
    ? toPagedResults(tvData.value)
        .map((r) => mapTMDBItem(r, 'tv', 'trending')).filter(Boolean)
    : []

  return primaryMediaType === 'tv' ? [...tv, ...movies] as Candidate[] : [...movies, ...tv] as Candidate[]
}
