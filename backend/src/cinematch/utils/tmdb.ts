import { Candidate, MediaType } from '../types'

const TMDB_API_KEY = process.env.VITE_TMDB_API_KEY || ''
const TMDB_BASE = 'https://api.themoviedb.org/3'

export async function fetchTMDB(path: string): Promise<any> {
  const sep = path.includes('?') ? '&' : '?'
  const url = `${TMDB_BASE}${path}${sep}api_key=${TMDB_API_KEY}`
  const res = await fetch(url)
  if (!res.ok) return { results: [] }
  return res.json()
}

export function mapTMDBItem(
  item: any,
  mediaType: MediaType,
  source: Candidate['source'],
): Candidate | null {
  const tmdbId = item.id
  if (!tmdbId) return null

  return {
    tmdbId,
    mediaType,
    title: item.title || item.name || '',
    posterPath: item.poster_path || null,
    backdropPath: item.backdrop_path || null,
    overview: item.overview || '',
    releaseDate: item.release_date || item.first_air_date || '',
    voteAverage: item.vote_average || 0,
    voteCount: item.vote_count || 0,
    popularity: item.popularity || 0,
    genreIds: item.genre_ids || [],
    source,
  }
}
