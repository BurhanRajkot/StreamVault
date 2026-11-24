import type { Media } from '@/lib/config'
import { NOT_SERIES, fetchDiscover, today } from './catalog'

/*
 * What the title pages, the people and the browsing screens show beyond a
 * title's own details: its trailer, the people in it, the film series it's
 * part of, genres to browse, and what's coming soon.
 */

const API_BASE = import.meta.env.VITE_API_URL

async function getJson<T>(path: string): Promise<T | null> {
  const res = await fetch(`${API_BASE}${path}`)
  return res.ok ? ((await res.json()) as T) : null
}

// ---------------------------------------------------------------------------
// Trailers
// ---------------------------------------------------------------------------

interface TmdbVideo {
  key: string
  site: string
  type: string
  official?: boolean
  name: string
  iso_639_1?: string
  published_at?: string
}

export interface Trailer {
  /** YouTube video id. */
  key: string
  name: string
}

const VIDEO_TYPES = ['Trailer', 'Teaser']

/** The title's trailer on YouTube: an official trailer first, then any trailer, then a teaser. Null when there's none. */
export async function fetchTrailer(kind: 'movie' | 'tv', id: number): Promise<Trailer | null> {
  const data = await getJson<{ results?: TmdbVideo[] }>(`/tmdb/${kind}/${id}/videos`)
  const videos = (data?.results ?? []).filter((v) => v.site === 'YouTube' && VIDEO_TYPES.includes(v.type))
  const score = (v: TmdbVideo) => VIDEO_TYPES.indexOf(v.type) * 4 + (v.official ? 0 : 2) + (v.iso_639_1 === 'en' ? 0 : 1)
  const best = [...videos].sort((a, b) => score(a) - score(b) || (b.published_at ?? '').localeCompare(a.published_at ?? ''))[0]
  return best ? { key: best.key, name: best.name } : null
}

// ---------------------------------------------------------------------------
// People
// ---------------------------------------------------------------------------

export interface PersonCredit extends Media {
  character?: string
  job?: string
  department?: string
  episode_count?: number
}

export interface Person {
  id: number
  name: string
  biography: string
  birthday: string | null
  deathday: string | null
  place_of_birth: string | null
  profile_path: string | null
  known_for_department: string
  combined_credits?: { cast: PersonCredit[]; crew: PersonCredit[] }
}

export const fetchPerson = (id: number) => getJson<Person>(`/tmdb/person/${id}`)

/** Talk shows, news, reality: appearances, not roles. */
const APPEARANCES = new Set([10767, 10763, 10764])

/** How well-known a title is, for ordering a filmography: votes, with a little popularity. */
const fame = (m: Media) => (m.vote_count ?? 0) + (m.popularity ?? 0) * 10

/** Jobs that make a title someone's work, by what they're known for (a director's films are the ones they directed or wrote). */
const WORK_DEPARTMENTS: Record<string, string[]> = {
  Directing: ['Directing', 'Writing'],
  Writing: ['Writing', 'Directing'],
  Production: ['Production'],
  Sound: ['Sound'],
  Camera: ['Camera'],
  Editing: ['Editing'],
  Creator: ['Writing', 'Creator'],
}

/** Ratings a title needs to be listed in a filmography. */
const MIN_FILMOGRAPHY_VOTES = 20

/** "Himself", "Self - Host": an appearance, not a role. */
const SELF_RE = /\b(Himself|Herself|Themselves|Self)\b/i

/**
 * A person's films and shows, each once: the roles they played (for an
 * actor) or the work they did in their own line (a director's directing and
 * writing), without talk-show appearances, playing themselves, "thanks"
 * credits or unreleased titles.
 */
export function filmography(person: Person): { movies: PersonCredit[]; shows: PersonCredit[]; knownFor: PersonCredit[] } {
  const credits = person.combined_credits
  const departments = WORK_DEPARTMENTS[person.known_for_department]
  const pool =
    person.known_for_department === 'Acting' || !departments
      ? (credits?.cast ?? []).filter((c) => !SELF_RE.test(c.character ?? ''))
      : (credits?.crew ?? []).filter((c) => departments.includes(c.department ?? ''))
  const seen = new Set<string>()
  const titles: PersonCredit[] = []
  for (const c of pool) {
    const key = `${c.media_type}:${c.id}`
    if (seen.has(key) || !c.poster_path) continue
    if ((c.genre_ids ?? []).some((g) => APPEARANCES.has(g))) continue
    // Shorts, festival compilations and lost early work nobody has rated
    if ((c.vote_count ?? 0) < MIN_FILMOGRAPHY_VOTES) continue
    const date = c.release_date || c.first_air_date || ''
    if (!date || date > today()) continue
    seen.add(key)
    titles.push(c)
  }
  const byFame = [...titles].sort((a, b) => fame(b) - fame(a))
  const byDate = (a: Media, b: Media) => (b.release_date || b.first_air_date || '').localeCompare(a.release_date || a.first_air_date || '')
  return {
    knownFor: byFame.slice(0, 12),
    movies: titles.filter((t) => t.media_type === 'movie').sort(byDate),
    shows: titles.filter((t) => t.media_type === 'tv').sort(byDate),
  }
}

// ---------------------------------------------------------------------------
// Film series
// ---------------------------------------------------------------------------

export interface Collection {
  id: number
  name: string
  overview: string
  poster_path: string | null
  backdrop_path: string | null
  parts: Media[]
}

/** A film series, its released parts in order. */
export async function fetchCollection(id: number): Promise<Collection | null> {
  const data = await getJson<Collection>(`/tmdb/collection/${id}`)
  if (!data) return null
  const parts = (data.parts ?? [])
    .filter((m) => m.poster_path)
    .map((m) => ({ ...m, media_type: 'movie' }))
    .sort((a, b) => (a.release_date || '9999').localeCompare(b.release_date || '9999'))
  return { ...data, parts }
}

// ---------------------------------------------------------------------------
// Genres to browse
// ---------------------------------------------------------------------------

export type BrowseSort = 'popular' | 'top' | 'new'

export interface BrowseGenre {
  slug: string
  name: string
  /** Discover filters per kind; a genre without one of them has no such titles (TV has no horror). */
  movie?: Record<string, string>
  tv?: Record<string, string>
  /** One of the app's own tabs instead of a genre page. */
  to?: string
}

export const BROWSE_GENRES: BrowseGenre[] = [
  { slug: 'action', name: 'Action', movie: { with_genres: '28' }, tv: { with_genres: '10759' } },
  { slug: 'comedy', name: 'Comedy', movie: { with_genres: '35' }, tv: { with_genres: '35' } },
  { slug: 'thriller', name: 'Thriller', movie: { with_genres: '53' }, tv: { with_genres: '80|9648' } },
  { slug: 'crime', name: 'Crime', movie: { with_genres: '80' }, tv: { with_genres: '80' } },
  { slug: 'sci-fi', name: 'Sci-Fi', movie: { with_genres: '878' }, tv: { with_genres: '10765' } },
  { slug: 'horror', name: 'Horror', movie: { with_genres: '27' } },
  { slug: 'drama', name: 'Drama', movie: { with_genres: '18' }, tv: { with_genres: '18' } },
  { slug: 'romance', name: 'Romance', movie: { with_genres: '10749' } },
  { slug: 'mystery', name: 'Mystery', movie: { with_genres: '9648' }, tv: { with_genres: '9648' } },
  { slug: 'fantasy', name: 'Fantasy', movie: { with_genres: '14' }, tv: { with_genres: '10765' } },
  { slug: 'bollywood', name: 'Bollywood', movie: { with_original_language: 'hi' }, tv: { with_original_language: 'hi' } },
  { slug: 'south-indian', name: 'South Indian', movie: { with_original_language: 'te' } },
  { slug: 'k-drama', name: 'K-Drama', tv: { with_original_language: 'ko', with_genres: '18' }, movie: { with_original_language: 'ko' } },
  { slug: 'family', name: 'Family', movie: { with_genres: '10751' }, tv: { with_genres: '10751' } },
  { slug: 'animation', name: 'Animation', movie: { with_genres: '16' }, tv: { with_genres: '16' } },
  { slug: 'war', name: 'War & History', movie: { with_genres: '10752|36' }, tv: { with_genres: '10768' } },
  { slug: 'anime', name: 'Anime', to: '/anime' },
  { slug: 'documentaries', name: 'Documentaries', to: '/documentaries' },
]

/** Votes a title needs to show up, by kind and order — keeps out art-less, unrated filler. */
const VOTE_FLOOR: Record<'movie' | 'tv', Record<BrowseSort, string>> = {
  movie: { popular: '100', top: '800', new: '20' },
  tv: { popular: '50', top: '300', new: '10' },
}

/** One page of a genre, in the order asked for. */
export function fetchGenrePage(genre: BrowseGenre, kind: 'movie' | 'tv', sort: BrowseSort, page: number): Promise<Media[]> {
  const base = genre[kind]
  if (!base) return Promise.resolve([])
  const date = kind === 'movie' ? 'primary_release_date' : 'first_air_date'
  const filters: Record<string, string> = {
    ...base,
    page: String(page),
    sort_by: sort === 'top' ? 'vote_average.desc' : sort === 'new' ? `${date}.desc` : 'popularity.desc',
    'vote_count.gte': VOTE_FLOOR[kind][sort],
  }
  if (sort === 'new') filters[`${date}.lte`] = today()
  if (kind === 'tv') filters.without_genres = genre.slug === 'animation' ? NOT_SERIES : `16,${NOT_SERIES}`
  return fetchDiscover(kind, filters)
}

/**
 * The art on each genre's tile: a well-known title of it, a different one
 * on every tile (the best-rated lists overlap — The Godfather is crime,
 * drama and thriller at once).
 */
export async function fetchGenreArt(): Promise<Record<string, string>> {
  const lists = await Promise.all(
    BROWSE_GENRES.map((genre) => {
      const kind = genre.movie ? 'movie' : 'tv'
      return genre.to ? Promise.resolve([]) : fetchGenrePage(genre, kind, 'popular', 1).catch(() => [] as Media[])
    })
  )
  const used = new Set<number>()
  const art: Record<string, string> = {}
  BROWSE_GENRES.forEach((genre, i) => {
    const pick = lists[i].find((m) => m.backdrop_path && !used.has(m.id))
    if (!pick?.backdrop_path) return
    used.add(pick.id)
    art[genre.slug] = pick.backdrop_path
  })
  return art
}

// ---------------------------------------------------------------------------
// Coming soon
// ---------------------------------------------------------------------------

/** A date `n` days from today, as the viewer's own calendar has it (not UTC's — India is ahead of it most of the day). */
const daysFromNow = (n: number) => {
  const d = new Date()
  d.setDate(d.getDate() + n)
  const pad = (x: number) => String(x).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

/** Films out in the next three months that people are already looking at, soonest first. */
export async function fetchComingSoon(): Promise<Media[]> {
  const titles = await fetchDiscover('movie', {
    'primary_release_date.gte': daysFromNow(1),
    'primary_release_date.lte': daysFromNow(90),
    sort_by: 'popularity.desc',
  })
  const tomorrow = daysFromNow(1)
  return titles
    .filter((m) => m.backdrop_path && m.release_date && m.release_date >= tomorrow)
    .slice(0, 16)
    .sort((a, b) => (a.release_date ?? '').localeCompare(b.release_date ?? ''))
}
