import type { Media, MediaMode } from '@/lib/config'
import type { RecoItem } from '@/lib/api'
import { fetchAnimeRow, fetchPopular, fetchRecentlyAdded, fetchTrending, fetchMediaSummaries } from '@/lib/api'
import { fetchComingSoon } from './extras'
import { AUTHORS_CHOICE_ANIME, AUTHORS_CHOICE_DOCUMENTARIES, AUTHORS_CHOICE_MOVIES, AUTHORS_CHOICE_TV } from '@/data/authorsChoice'

const API_BASE = import.meta.env.VITE_API_URL

/** One page of TMDB discover through the backend proxy (its allowlisted filters only). */
export async function fetchDiscover(type: 'movie' | 'tv', filters: Record<string, string>): Promise<Media[]> {
  const params = new URLSearchParams({ page: '1', sort_by: 'popularity.desc', ...filters })
  const res = await fetch(`${API_BASE}/tmdb/discover/${type}?${params}`)
  if (!res.ok) return []
  const data = (await res.json()) as { results?: Media[] }
  return (data.results ?? []).map((m) => ({ ...m, media_type: type }))
}

export function recoToMedia(item: RecoItem): Media {
  return {
    id: item.tmdbId,
    title: item.mediaType === 'movie' ? item.title : undefined,
    name: item.mediaType === 'tv' ? item.title : undefined,
    poster_path: item.posterPath,
    backdrop_path: item.backdropPath,
    overview: item.overview,
    vote_average: item.voteAverage,
    release_date: item.mediaType === 'movie' ? item.releaseDate : undefined,
    first_air_date: item.mediaType === 'tv' ? item.releaseDate : undefined,
    media_type: item.mediaType,
    genre_ids: item.genreIds,
  }
}

/** A row on a browse screen: what it's called and how to fill it. */
export interface RowSpec {
  key: string
  title: string
  kind?: 'movie' | 'tv'
  /** Big ranked numerals, landscape cards to break up the posters, or release dates on them. */
  style?: 'top10' | 'wide' | 'soon'
  load: () => Promise<Media[]>
}

const picks = (items: { tmdbId: number; mediaType: 'movie' | 'tv' }[]) => () => fetchMediaSummaries(items.slice(0, 16))

const day = (d: Date) => d.toISOString().slice(0, 10)
export const monthsAgo = (n: number) => {
  const d = new Date()
  d.setMonth(d.getMonth() - n)
  return day(d)
}
export const yearsAgo = (n: number) => monthsAgo(n * 12)
export const today = () => day(new Date())

/**
 * Talk shows, news, reality, soaps and kids' TV. TMDB ranks them near the top
 * of every TV list (decades of daily episodes), and they're nobody's idea of
 * "popular shows".
 */
export const NOT_SERIES = '10767,10763,10764,10766,10762'
const NOT_SERIES_OR_ANIMATION = `16,${NOT_SERIES}`
const APPEARANCE_GENRES = new Set([10767, 10763, 10764])

/**
 * TV that's on the air now. TMDB's TV popularity is all-time syndication
 * traffic — Law & Order, House, How I Met Your Mother — so "popular" means:
 * aired an episode recently, and started within the last decade.
 */
const current = (extra: Record<string, string> = {}) =>
  fetchDiscover('tv', { 'air_date.gte': monthsAgo(9), 'air_date.lte': today(), 'first_air_date.gte': yearsAgo(10), without_genres: NOT_SERIES, ...extra })

/** Good TV from the last several years in a genre — rated, not just watched a lot. */
const recentTv = (genres: string, years: number, extra: Record<string, string> = {}) =>
  fetchDiscover('tv', { with_genres: genres, 'first_air_date.gte': yearsAgo(years), without_genres: NOT_SERIES_OR_ANIMATION, 'vote_average.gte': '7', ...extra })

/** This week's trending titles minus talk shows, news and unreleased or unrated filler. */
async function trending(type: 'movie' | 'tv'): Promise<Media[]> {
  const res = await fetch(`${API_BASE}/tmdb/trending/${type}`)
  if (!res.ok) return []
  const data = (await res.json()) as { results?: Media[] }
  return (data.results ?? [])
    .map((m) => ({ ...m, media_type: type }))
    .filter((m) => m.poster_path && (m.vote_count ?? 0) >= 20 && !(m.genre_ids ?? []).some((g) => APPEARANCE_GENRES.has(g)))
}

/** Films and shows trending this week, alternating, so neither crowds the other out. */
async function trendingBoth(): Promise<Media[]> {
  const [movies, shows] = await Promise.all([trending('movie'), trending('tv')])
  const mixed: Media[] = []
  for (let i = 0; i < Math.max(movies.length, shows.length); i++) {
    if (movies[i]) mixed.push(movies[i])
    if (shows[i]) mixed.push(shows[i])
  }
  return mixed
}

/** What India is watching this week — Netflix's own Top 10, matched to TMDB. */
async function top10India(type: 'movie' | 'tv'): Promise<Media[]> {
  const res = await fetch(`${API_BASE}/tmdb/top10/IN/${type}`)
  if (!res.ok) return []
  const data = (await res.json()) as { results?: Media[] }
  return (data.results ?? []).map((m) => ({ ...m, media_type: type }))
}

/**
 * Every browse screen is a fixed set of rows — Home then goes on with a
 * feed of different ideas as the viewer scrolls (lib/discoveryFeed).
 * Genre rows use TMDB discover with a vote floor so obscure titles with no
 * art don't fill them, and TV rows a recency window (see `current`).
 */
export function rowsFor(mode: MediaMode): RowSpec[] {
  switch (mode) {
    case 'movie':
      return [
        { key: 'top', title: 'Top 10 Movies Today', kind: 'movie', style: 'top10', load: () => trending('movie') },
        { key: 'india', title: 'Top 10 Movies in India', kind: 'movie', style: 'top10', load: () => top10India('movie') },
        { key: 'popular', title: 'Popular Movies', kind: 'movie', load: async () => (await fetchPopular('movie', 1)).results },
        { key: 'new', title: 'New Releases', kind: 'movie', style: 'wide', load: () => fetchRecentlyAdded('movie') },
        { key: 'soon', title: 'Coming Soon', kind: 'movie', style: 'soon', load: fetchComingSoon },
        { key: 'picks', title: "Editor's Picks", kind: 'movie', load: picks(AUTHORS_CHOICE_MOVIES) },
        { key: 'hindi', title: 'Hindi Hits', kind: 'movie', load: () => fetchDiscover('movie', { with_original_language: 'hi', 'vote_count.gte': '40', 'primary_release_date.gte': yearsAgo(3), 'primary_release_date.lte': today() }) },
        { key: 'action', title: 'Action', kind: 'movie', load: () => fetchDiscover('movie', { with_genres: '28', 'vote_count.gte': '300', 'vote_average.gte': '6.5' }) },
        { key: 'comedy', title: 'Comedy', kind: 'movie', load: () => fetchDiscover('movie', { with_genres: '35', 'vote_count.gte': '300', 'vote_average.gte': '6.5', 'primary_release_date.gte': yearsAgo(15) }) },
        { key: 'thriller', title: 'Thrillers', kind: 'movie', load: () => fetchDiscover('movie', { with_genres: '53', 'vote_count.gte': '300', 'vote_average.gte': '6.5' }) },
        { key: 'scifi', title: 'Sci-Fi', kind: 'movie', load: () => fetchDiscover('movie', { with_genres: '878', 'vote_count.gte': '300', 'vote_average.gte': '6.5' }) },
        { key: 'south', title: 'South Indian Blockbusters', kind: 'movie', style: 'wide', load: southIndian },
        { key: 'horror', title: 'Horror', kind: 'movie', load: () => fetchDiscover('movie', { with_genres: '27', 'vote_count.gte': '300', 'vote_average.gte': '6', 'primary_release_date.gte': yearsAgo(15) }) },
        { key: 'romance', title: 'Romance', kind: 'movie', load: () => fetchDiscover('movie', { with_genres: '10749', 'vote_count.gte': '300', 'vote_average.gte': '6.5', 'primary_release_date.gte': yearsAgo(15) }) },
        { key: 'acclaimed', title: 'All-Time Greats', kind: 'movie', style: 'wide', load: () => fetchDiscover('movie', { sort_by: 'vote_average.desc', 'vote_count.gte': '5000' }) },
      ]
    case 'tv':
      return [
        { key: 'top', title: 'Top 10 Shows Today', kind: 'tv', style: 'top10', load: () => trending('tv') },
        { key: 'india', title: 'Top 10 Shows in India', kind: 'tv', style: 'top10', load: () => top10India('tv') },
        { key: 'popular', title: 'Popular Right Now', kind: 'tv', load: () => current({ 'vote_count.gte': '200' }) },
        { key: 'new', title: 'New Seasons & Series', kind: 'tv', style: 'wide', load: () => fetchRecentlyAdded('tv') },
        { key: 'picks', title: "Editor's Picks", kind: 'tv', load: picks(AUTHORS_CHOICE_TV) },
        { key: 'hindi', title: 'Best Indian Series', kind: 'tv', load: () => fetchDiscover('tv', { sort_by: 'vote_count.desc', with_origin_country: 'IN', without_genres: NOT_SERIES, 'vote_average.gte': '7' }) },
        { key: 'drama', title: 'Binge-Worthy Dramas', kind: 'tv', load: () => recentTv('18', 8, { 'vote_average.gte': '7.5', 'vote_count.gte': '300' }) },
        { key: 'crime', title: 'Crime', kind: 'tv', style: 'wide', load: () => recentTv('80', 10, { 'vote_count.gte': '200' }) },
        { key: 'kdrama', title: 'K-Dramas', kind: 'tv', load: () => fetchDiscover('tv', { with_original_language: 'ko', with_genres: '18', 'first_air_date.gte': yearsAgo(5), 'vote_count.gte': '40', without_genres: NOT_SERIES }) },
        { key: 'comedy', title: 'Comedy', kind: 'tv', load: () => recentTv('35', 10, { 'vote_count.gte': '150' }) },
        { key: 'limited', title: 'Limited Series', kind: 'tv', style: 'wide', load: () => fetchDiscover('tv', { with_type: '2', 'first_air_date.gte': yearsAgo(6), 'vote_average.gte': '7', 'vote_count.gte': '100', without_genres: NOT_SERIES }) },
        { key: 'scifi', title: 'Sci-Fi & Fantasy', kind: 'tv', load: () => recentTv('10765', 10, { 'vote_count.gte': '200' }) },
        { key: 'mystery', title: 'Mystery', kind: 'tv', load: () => recentTv('9648', 10, { 'vote_count.gte': '150' }) },
        { key: 'acclaimed', title: 'All-Time Greats', kind: 'tv', load: () => fetchDiscover('tv', { sort_by: 'vote_average.desc', 'vote_count.gte': '2000', without_genres: NOT_SERIES }) },
      ]
    case 'anime':
      return [
        { key: 'top', title: 'Top 10 Anime', style: 'top10', load: () => fetchTrending('anime') },
        { key: 'series', title: 'Popular Series', kind: 'tv', load: () => fetchAnimeRow('series') },
        { key: 'movies', title: 'Anime Movies', kind: 'movie', style: 'wide', load: () => fetchAnimeRow('movies') },
        { key: 'picks', title: "Editor's Picks", load: picks(AUTHORS_CHOICE_ANIME) },
        { key: 'new', title: 'New Episodes & Releases', load: () => fetchAnimeRow('new') },
        { key: 'rated', title: 'Top Rated', load: () => fetchAnimeRow('top-rated') },
      ]
    case 'documentary':
      return [
        { key: 'top', title: 'Top 10 Documentaries This Week', style: 'top10', load: trendingDocumentaries },
        { key: 'series', title: 'Docuseries Everyone’s Watching', kind: 'tv', style: 'wide', load: currentDocuseries },
        { key: 'films', title: 'Popular Documentary Films', kind: 'movie', load: recentDocumentaryFilms },
        { key: 'new', title: 'New Releases', load: () => fetchRecentlyAdded('documentary') },
        { key: 'truecrime', title: 'True Crime', load: trueCrime },
        { key: 'sport', title: 'Sports Stories', load: sportsDocumentaries },
        { key: 'picks', title: "Editor's Picks", load: picks(AUTHORS_CHOICE_DOCUMENTARIES) },
        { key: 'acclaimed', title: 'Acclaimed Films', kind: 'movie', load: () => fetchDiscover('movie', { with_genres: '99', sort_by: 'vote_average.desc', 'vote_count.gte': '400' }) },
      ]
    default:
      return [
        { key: 'top', title: 'Top 10 Today', style: 'top10', load: trendingBoth },
        { key: 'india', title: 'Top 10 Shows in India', kind: 'tv', style: 'top10', load: () => top10India('tv') },
        { key: 'movies', title: 'Trending Movies', kind: 'movie', load: () => trending('movie') },
        { key: 'shows', title: 'Popular Shows Right Now', kind: 'tv', style: 'wide', load: () => current({ 'vote_count.gte': '200' }) },
        { key: 'new', title: 'New Releases', load: () => fetchRecentlyAdded('home') },
        { key: 'soon', title: 'Coming Soon', kind: 'movie', style: 'soon', load: fetchComingSoon },
        { key: 'picks', title: "Editor's Picks", kind: 'movie', load: picks(AUTHORS_CHOICE_MOVIES) },
        { key: 'indian', title: 'Best Indian Series', kind: 'tv', load: () => fetchDiscover('tv', { sort_by: 'vote_count.desc', with_origin_country: 'IN', without_genres: NOT_SERIES, 'vote_average.gte': '7' }) },
        { key: 'anime', title: 'Anime', kind: 'tv', load: () => fetchAnimeRow('series') },
        { key: 'hindi', title: 'Hindi Hits', kind: 'movie', load: () => fetchDiscover('movie', { with_original_language: 'hi', 'vote_count.gte': '40', 'primary_release_date.gte': yearsAgo(1.5), 'primary_release_date.lte': today() }) },
        { key: 'kdrama', title: 'K-Dramas', kind: 'tv', style: 'wide', load: () => fetchDiscover('tv', { with_original_language: 'ko', with_genres: '18', 'first_air_date.gte': yearsAgo(5), 'vote_count.gte': '40', without_genres: NOT_SERIES }) },
        { key: 'docs', title: 'Documentaries', load: trendingDocumentaries },
      ]
  }
}

/** Tamil, Telugu, Malayalam and Kannada hits of the last few years, most popular first. */
async function southIndian(): Promise<Media[]> {
  const langs = ['ta', 'te', 'ml', 'kn']
  const lists = await Promise.all(
    langs.map((lang) =>
      fetchDiscover('movie', { with_original_language: lang, 'vote_count.gte': '30', 'vote_average.gte': '6.5', 'primary_release_date.gte': yearsAgo(4), 'primary_release_date.lte': today() })
    )
  )
  return lists
    .flat()
    .sort((a, b) => (b.vote_count ?? 0) * Math.log1p(b.popularity ?? 0) - (a.vote_count ?? 0) * Math.log1p(a.popularity ?? 0))
    .slice(0, 20)
}

// ---------------------------------------------------------------------------
// Documentaries
//
// TMDB's popularity for documentaries is all-time traffic, like TV's: sorted
// by it, the rows were NOVA (1974), Mayday, Ancient Aliens and MythBusters.
// What people are watching now is this week's trending list (read in the
// documentary genre, see GET /tmdb/trending/:type?genre=), then titles that
// came out or aired recently, by popularity.
// ---------------------------------------------------------------------------

const DOCUMENTARY = '99'

/** Docuseries with an episode out in the last year, started within the last few. */
const currentDocuseries = () =>
  fetchDiscover('tv', { with_genres: DOCUMENTARY, 'air_date.gte': monthsAgo(12), 'air_date.lte': today(), 'first_air_date.gte': yearsAgo(4), 'vote_count.gte': '5', without_genres: NOT_SERIES })

/** Documentary films released in the last year and a half. */
const recentDocumentaryFilms = () =>
  fetchDiscover('movie', { with_genres: DOCUMENTARY, 'primary_release_date.gte': monthsAgo(18), 'primary_release_date.lte': today(), 'vote_count.gte': '10' })

async function trendingInGenre(type: 'movie' | 'tv', genre: string): Promise<Media[]> {
  const res = await fetch(`${API_BASE}/tmdb/trending/${type}?genre=${genre}`)
  if (!res.ok) return []
  const data = (await res.json()) as { results?: Media[] }
  // Filtered here too: a backend from before `?genre=` returns the whole list
  return (data.results ?? [])
    .map((m) => ({ ...m, media_type: type }))
    .filter((m) => m.poster_path && (m.genre_ids ?? []).includes(Number(genre)))
}

/** Interleave lists, dropping repeats — so films and series share a row. */
function interleave(lists: Media[][], limit = 20): Media[] {
  const seen = new Set<string>()
  const out: Media[] = []
  for (let i = 0; out.length < limit && lists.some((l) => i < l.length); i++) {
    for (const list of lists) {
      const m = list[i]
      if (!m) continue
      const key = `${m.media_type}:${m.id}`
      if (seen.has(key)) continue
      seen.add(key)
      out.push(m)
    }
  }
  return out.slice(0, limit)
}

/** This week's trending documentaries, topped up with this year's most popular ones. */
async function trendingDocumentaries(): Promise<Media[]> {
  const [films, series, recentSeries, recentFilms] = await Promise.all([
    trendingInGenre('movie', DOCUMENTARY),
    trendingInGenre('tv', DOCUMENTARY),
    currentDocuseries(),
    recentDocumentaryFilms(),
  ])
  return interleave([interleave([series, films]), interleave([recentSeries, recentFilms])])
}

/** Sports documentaries and docuseries of the last few years (TMDB keyword 6075, "sport"). */
async function sportsDocumentaries(): Promise<Media[]> {
  const [films, series] = await Promise.all([
    fetchDiscover('movie', { with_keywords: '6075', with_genres: DOCUMENTARY, 'primary_release_date.gte': yearsAgo(4), 'vote_count.gte': '10' }),
    fetchDiscover('tv', { with_keywords: '6075', with_genres: DOCUMENTARY, 'first_air_date.gte': yearsAgo(5), 'vote_count.gte': '5' }),
  ])
  return interleave([series, films])
}

/** True-crime documentaries and docuseries (TMDB keyword 33722) of the last few years, most popular first. */
async function trueCrime(): Promise<Media[]> {
  const [films, series] = await Promise.all([
    fetchDiscover('movie', { with_keywords: '33722', with_genres: DOCUMENTARY, 'primary_release_date.gte': yearsAgo(5), 'vote_count.gte': '20' }),
    fetchDiscover('tv', { with_keywords: '33722', with_genres: DOCUMENTARY, 'first_air_date.gte': yearsAgo(5), 'vote_count.gte': '10' }),
  ])
  return [...series, ...films].sort((a, b) => (b.popularity ?? 0) - (a.popularity ?? 0)).slice(0, 20)
}
