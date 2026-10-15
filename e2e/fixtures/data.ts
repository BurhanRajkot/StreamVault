/**
 * Test data — the catalogue the mock backend serves, and factories for the
 * shapes the app reads. Shapes mirror the backend's TMDB proxy and debrid
 * routes; keep them in step with `src/lib/config.ts` (Media) and
 * `src/lib/debridApi.ts` (DebridRelease, DebridReadyPlayback).
 */

export interface MediaFixture {
  id: number
  media_type: 'movie' | 'tv'
  title?: string
  name?: string
  release_date?: string
  first_air_date?: string
  overview: string
  poster_path: string
  backdrop_path: string
  vote_average: number
  vote_count: number
  popularity: number
  genre_ids: number[]
  genres: { id: number; name: string }[]
  runtime?: number
  imdb_id?: string
  external_ids?: { imdb_id: string }
  number_of_seasons?: number
  credits: { cast: { id: number; name: string; character: string; profile_path: string | null }[]; crew: [] }
}

const GENRES = {
  action: { id: 28, name: 'Action' },
  scifi: { id: 878, name: 'Science Fiction' },
  crime: { id: 80, name: 'Crime' },
  drama: { id: 18, name: 'Drama' },
}

export const MOVIE: MediaFixture = {
  id: 27205,
  media_type: 'movie',
  title: 'Inception',
  release_date: '2010-07-15',
  overview:
    'Cobb, a skilled thief who steals secrets from deep within the subconscious during the dream state, is offered a chance at redemption.',
  poster_path: '/inception-poster.jpg',
  backdrop_path: '/inception-backdrop.jpg',
  vote_average: 8.4,
  vote_count: 36000,
  popularity: 120,
  genre_ids: [GENRES.action.id, GENRES.scifi.id],
  genres: [GENRES.action, GENRES.scifi],
  runtime: 148,
  imdb_id: 'tt1375666',
  credits: {
    cast: [{ id: 6193, name: 'Leonardo DiCaprio', character: 'Cobb', profile_path: null }],
    crew: [],
  },
}

export const SECOND_MOVIE: MediaFixture = {
  ...MOVIE,
  id: 155,
  title: 'The Dark Knight',
  release_date: '2008-07-16',
  overview: 'Batman raises the stakes in his war on crime, and meets a criminal mastermind known as the Joker.',
  poster_path: '/dark-knight-poster.jpg',
  backdrop_path: '/dark-knight-backdrop.jpg',
  vote_average: 8.5,
  genre_ids: [GENRES.action.id, GENRES.crime.id],
  genres: [GENRES.action, GENRES.crime],
  imdb_id: 'tt0468569',
}

export const SHOW: MediaFixture = {
  id: 1396,
  media_type: 'tv',
  name: 'Breaking Bad',
  first_air_date: '2008-01-20',
  overview: 'A chemistry teacher diagnosed with cancer turns to manufacturing methamphetamine to secure his family’s future.',
  poster_path: '/breaking-bad-poster.jpg',
  backdrop_path: '/breaking-bad-backdrop.jpg',
  vote_average: 8.9,
  vote_count: 15000,
  popularity: 300,
  genre_ids: [GENRES.drama.id, GENRES.crime.id],
  genres: [GENRES.drama, GENRES.crime],
  external_ids: { imdb_id: 'tt0903747' },
  number_of_seasons: 2,
  credits: { cast: [], crew: [] },
}

export const SHOW_SEASONS = [
  { season_number: 1, episode_count: 7, name: 'Season 1' },
  { season_number: 2, episode_count: 13, name: 'Season 2' },
]

export const CATALOGUE: MediaFixture[] = [MOVIE, SECOND_MOVIE, SHOW]

export function titleOf(media: MediaFixture): string {
  return media.title ?? media.name ?? ''
}

/** Any TMDB id the app asks about — curated rows fetch ids we don't list. */
export function mediaById(type: 'movie' | 'tv', id: number): MediaFixture {
  const known = CATALOGUE.find((m) => m.media_type === type && m.id === id)
  if (known) return known
  const template = type === 'tv' ? SHOW : MOVIE
  return { ...template, id, ...(type === 'tv' ? { name: `Show ${id}` } : { title: `Movie ${id}` }) }
}

export function page<T>(results: T[]) {
  return { page: 1, results, total_pages: 1, total_results: results.length }
}

/** `/watch/movie/27205-inception` */
export function watchPath(media: MediaFixture): string {
  const slug = titleOf(media)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '')
  return `/watch/${media.media_type}/${media.id}-${slug}`
}

// ---------------------------------------------------------------------------
// Premium (Real-Debrid)
// ---------------------------------------------------------------------------

/** Served by the mock network layer; plays in Playwright's bundled Chromium (VP9 + Opus). */
export const SAMPLE_VIDEO_URL = 'https://media.e2e.test/sample.webm'

export interface ReleaseFixture {
  id: string
  name: string
  info_hash: string
  seeders: string
  leechers: string
  size: string
  num_files: string
  username: string
  added: string
  category: string
  cached: boolean
  file_name?: string
  file_idx?: number
}

let releaseSeq = 0

export function release(overrides: Partial<ReleaseFixture> = {}): ReleaseFixture {
  releaseSeq += 1
  const hash = releaseSeq.toString(16).toUpperCase().padStart(40, 'A')
  return {
    id: `release-${releaseSeq}`,
    name: 'Inception.2010.1080p.BluRay.x264.AAC-GROUP',
    info_hash: hash,
    seeders: '250',
    leechers: '10',
    size: String(2_400_000_000),
    num_files: '1',
    username: 'torrentio',
    added: '1700000000',
    category: '207',
    cached: true,
    file_name: 'Inception.2010.1080p.BluRay.x264.AAC-GROUP.mkv',
    file_idx: 0,
    ...overrides,
  }
}

export function readyPlayback(overrides: Record<string, unknown> = {}) {
  return {
    status: 'ready',
    torrentId: 'ABCDEFGH12345',
    fileId: 1,
    fileName: 'Inception.2010.1080p.BluRay.x264.AAC-GROUP.webm',
    fileSize: 97_332,
    mimeType: 'video/webm',
    directUrl: SAMPLE_VIDEO_URL,
    hls: null,
    media: null,
    ...overrides,
  }
}
