import { Candidate, MediaType } from '../types'
import { fetchTMDB, mapTMDBItem, toPagedResults } from '../utils/tmdb'

/** Talk shows, news and reality — trending every week, recommended to nobody. */
const APPEARANCE_GENRES = new Set([10767, 10763, 10764])

/** Rated by enough people to be a real title, and not a talk show. */
function isWorthRecommending(c: Candidate | null): c is Candidate {
  return !!c && !!c.posterPath && c.voteCount >= 30 && !c.genreIds.some((g) => APPEARANCE_GENRES.has(g))
}

export async function trendingSource(primaryMediaType: MediaType = 'movie'): Promise<Candidate[]> {
  const [movieData, tvData] = await Promise.allSettled([
    fetchTMDB('/trending/movie/week'),
    fetchTMDB('/trending/tv/week'),
  ])

  const movies = movieData.status === 'fulfilled'
    ? toPagedResults(movieData.value)
        .map((r) => mapTMDBItem(r, 'movie', 'trending')).filter(isWorthRecommending)
    : []

  const tv = tvData.status === 'fulfilled'
    ? toPagedResults(tvData.value)
        .map((r) => mapTMDBItem(r, 'tv', 'trending')).filter(isWorthRecommending)
    : []

  return primaryMediaType === 'tv' ? [...tv, ...movies] as Candidate[] : [...movies, ...tv] as Candidate[]
}
