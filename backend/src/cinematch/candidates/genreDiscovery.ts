import { Candidate, UserProfile, MediaType } from '../types'
import { fetchTMDB, mapTMDBItem, toPagedResults } from '../utils/tmdb'
import { TMDB_GENRES } from '../types'

// ============================================================
// Genre Discovery
//
// Discover lists built from the user's own genre mix. One genre sorted by
// vote count is the same list for everyone who likes drama (Sex Education,
// WandaVision, Interstellar — seen in every account's "Top Drama Picks"), so
// the user's top genres are paired: Crime + Drama is a different list from
// Comedy + Drama, and from Romance + Drama. The strongest pair is read
// all-time (by votes), the others from the last few years (by popularity),
// so the rows mix proven favourites with what's current.
//
// TMDB numbers some genres differently for TV (no Action, Sci-Fi, Thriller
// ids there), so each pair is translated per media type.
// ============================================================

/** Movie genre → its TV counterpart, and back. Genres missing here are the same id on both. */
const MOVIE_TO_TV: Record<number, number | null> = {
  28: 10759, // Action → Action & Adventure
  12: 10759, // Adventure → Action & Adventure
  878: 10765, // Science Fiction → Sci-Fi & Fantasy
  14: 10765, // Fantasy → Sci-Fi & Fantasy
  10752: 10768, // War → War & Politics
  53: null, // Thriller: no TV genre (Crime/Mystery are separate genres of their own)
  27: null, // Horror: no TV genre
  10749: null, // Romance: no TV genre
  36: null, // History
  10402: null, // Music
  10770: null, // TV Movie
}
const TV_TO_MOVIE: Record<number, number | null> = {
  10759: 28,
  10765: 878,
  10768: 10752,
  10762: null, // Kids
  10763: null, // News
  10764: null, // Reality
  10766: null, // Soap
  10767: null, // Talk
}

/** `genre` as `type` numbers it — null when that type has no such genre. */
export function genreFor(type: MediaType, genre: number): number | null {
  const map = type === 'tv' ? MOVIE_TO_TV : TV_TO_MOVIE
  return genre in map ? map[genre] : genre
}

/** The genres of a pair as `type` numbers them, deduplicated — null when any has no counterpart. */
export function genresFor(type: MediaType, genres: number[]): number[] | null {
  const out: number[] = []
  for (const g of genres) {
    const mapped = genreFor(type, g)
    if (mapped === null) return null
    if (!out.includes(mapped)) out.push(mapped)
  }
  return out
}

/** A genre's name for a row title ("Sci-Fi & Fantasy" and "Science Fiction" both read "Sci-Fi"). */
function shortName(id: number): string {
  const name = TMDB_GENRES[id] || `Genre ${id}`
  return name.replace('Science Fiction', 'Sci-Fi').replace(' & Fantasy', '').replace(' & Adventure', '')
}

export interface GenreQuery {
  genres: number[]
  label: string
  recent: boolean
}

/** The lists to read for a profile's top genres, strongest first. */
export function genreQueries(genreVector: Record<number, number>): GenreQuery[] {
  const top = Object.entries(genreVector)
    .filter(([id]) => ![10762, 10763, 10764, 10766, 10767].includes(Number(id)))
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([id]) => Number(id))
  if (top.length === 0) return []
  if (top.length === 1) return [{ genres: top, label: shortName(top[0]), recent: false }, { genres: top, label: shortName(top[0]), recent: true }]
  const pairs: number[][] = top.length === 2 ? [top, [top[0]]] : [[top[0], top[1]], [top[0], top[2]], [top[1], top[2]]]
  return pairs.map((genres, i) => ({
    genres,
    label: genres.map(shortName).filter((n, j, all) => all.indexOf(n) === j).join(' & '),
    recent: i > 0,
  }))
}

const yearsAgo = (n: number) => {
  const d = new Date()
  d.setFullYear(d.getFullYear() - n)
  return d.toISOString().slice(0, 10)
}

function discoverPath(type: MediaType, genres: number[], recent: boolean): string {
  const params = new URLSearchParams({ with_genres: genres.join(','), page: '1' })
  if (type === 'tv') params.set('without_genres', '10767,10763,10764,10766')
  if (recent) {
    params.set('sort_by', 'popularity.desc')
    params.set(type === 'movie' ? 'primary_release_date.gte' : 'first_air_date.gte', yearsAgo(type === 'movie' ? 4 : 5))
    params.set('vote_count.gte', type === 'movie' ? '150' : '60')
    params.set('vote_average.gte', '6.8')
  } else {
    params.set('sort_by', 'vote_count.desc')
    params.set('vote_average.gte', type === 'movie' ? '7.2' : '7.5')
  }
  return `/discover/${type}?${params.toString()}`
}

export async function genreDiscoverySource(profile: UserProfile): Promise<Candidate[]> {
  const queries = genreQueries(profile.genreVector)
  if (queries.length === 0) return []

  const tasks: Promise<Candidate[]>[] = []
  for (const query of queries) {
    for (const type of ['movie', 'tv'] as const) {
      const genres = genresFor(type, query.genres)
      if (!genres) continue
      tasks.push(
        fetchTMDB(discoverPath(type, genres, query.recent)).then((data) =>
          toPagedResults(data)
            .map((r) => {
              const c = mapTMDBItem(r, type, 'genre_discovery')
              return c ? ({ ...c, seedTitle: query.label } as Candidate) : null
            })
            .filter((c): c is Candidate => c !== null)
        )
      )
    }
  }

  const results = await Promise.allSettled(tasks)
  return results.flatMap((r) => (r.status === 'fulfilled' ? r.value : []))
}
