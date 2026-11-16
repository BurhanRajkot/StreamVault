import type { Media, MediaMode } from '@/lib/config'
import type { RecoItem } from '@/lib/api'
import { fetchAnimeRow, fetchPopular, fetchRecentlyAdded, fetchTrending, fetchMediaSummaries } from '@/lib/api'
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
  /** Big ranked numerals, or landscape cards to break up the posters. */
  style?: 'top10' | 'wide'
  load: () => Promise<Media[]>
}

const picks = (items: { tmdbId: number; mediaType: 'movie' | 'tv' }[]) => () => fetchMediaSummaries(items.slice(0, 16))
const recentWindow = () => {
  const from = new Date()
  from.setMonth(from.getMonth() - 18)
  return from.toISOString().slice(0, 10)
}
const today = () => new Date().toISOString().slice(0, 10)

/**
 * Every browse screen is a fixed set of rows — finite, no endless feed.
 * Genre rows use TMDB discover with a vote floor so obscure titles with no
 * art don't fill them.
 */
export function rowsFor(mode: MediaMode): RowSpec[] {
  switch (mode) {
    case 'movie':
      return [
        { key: 'top', title: 'Top 10 Movies Today', kind: 'movie', style: 'top10', load: () => fetchTrending('movie') },
        { key: 'popular', title: 'Popular Movies', kind: 'movie', load: async () => (await fetchPopular('movie', 1)).results },
        { key: 'new', title: 'New Releases', kind: 'movie', style: 'wide', load: () => fetchRecentlyAdded('movie') },
        { key: 'picks', title: "Editor's Picks", kind: 'movie', load: picks(AUTHORS_CHOICE_MOVIES) },
        { key: 'hindi', title: 'Hindi Hits', kind: 'movie', load: () => fetchDiscover('movie', { with_original_language: 'hi', 'vote_count.gte': '150' }) },
        { key: 'action', title: 'Action', kind: 'movie', load: () => fetchDiscover('movie', { with_genres: '28', 'vote_count.gte': '300' }) },
        { key: 'comedy', title: 'Comedy', kind: 'movie', load: () => fetchDiscover('movie', { with_genres: '35', 'vote_count.gte': '300' }) },
        { key: 'thriller', title: 'Thrillers', kind: 'movie', load: () => fetchDiscover('movie', { with_genres: '53', 'vote_count.gte': '300' }) },
        { key: 'scifi', title: 'Sci-Fi', kind: 'movie', load: () => fetchDiscover('movie', { with_genres: '878', 'vote_count.gte': '300' }) },
        { key: 'horror', title: 'Horror', kind: 'movie', load: () => fetchDiscover('movie', { with_genres: '27', 'vote_count.gte': '300' }) },
        { key: 'romance', title: 'Romance', kind: 'movie', load: () => fetchDiscover('movie', { with_genres: '10749', 'vote_count.gte': '300' }) },
        { key: 'acclaimed', title: 'Critically Acclaimed', kind: 'movie', style: 'wide', load: () => fetchDiscover('movie', { sort_by: 'vote_average.desc', 'vote_count.gte': '5000' }) },
      ]
    case 'tv':
      return [
        { key: 'top', title: 'Top 10 Shows Today', kind: 'tv', style: 'top10', load: () => fetchTrending('tv') },
        { key: 'popular', title: 'Popular Shows', kind: 'tv', load: async () => (await fetchPopular('tv', 1)).results },
        { key: 'new', title: 'New Seasons & Series', kind: 'tv', style: 'wide', load: () => fetchRecentlyAdded('tv') },
        { key: 'picks', title: "Editor's Picks", kind: 'tv', load: picks(AUTHORS_CHOICE_TV) },
        { key: 'hindi', title: 'Indian Series', kind: 'tv', load: () => fetchDiscover('tv', { with_original_language: 'hi', 'vote_count.gte': '20' }) },
        { key: 'drama', title: 'Drama', kind: 'tv', load: () => fetchDiscover('tv', { with_genres: '18', 'vote_count.gte': '300' }) },
        { key: 'crime', title: 'Crime', kind: 'tv', style: 'wide', load: () => fetchDiscover('tv', { with_genres: '80', 'vote_count.gte': '200' }) },
        { key: 'comedy', title: 'Comedy', kind: 'tv', load: () => fetchDiscover('tv', { with_genres: '35', 'vote_count.gte': '200' }) },
        { key: 'scifi', title: 'Sci-Fi & Fantasy', kind: 'tv', load: () => fetchDiscover('tv', { with_genres: '10765', 'vote_count.gte': '200' }) },
        { key: 'mystery', title: 'Mystery', kind: 'tv', load: () => fetchDiscover('tv', { with_genres: '9648', 'vote_count.gte': '200' }) },
        { key: 'acclaimed', title: 'Critically Acclaimed', kind: 'tv', load: () => fetchDiscover('tv', { sort_by: 'vote_average.desc', 'vote_count.gte': '2000' }) },
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
        { key: 'popular', title: 'Popular Documentaries', load: async () => (await fetchPopular('documentary', 1)).results },
        { key: 'new', title: 'New Releases', load: () => fetchRecentlyAdded('documentary') },
        { key: 'picks', title: "Editor's Picks", load: picks(AUTHORS_CHOICE_DOCUMENTARIES) },
        { key: 'series', title: 'Docuseries', kind: 'tv', style: 'wide', load: () => fetchDiscover('tv', { with_genres: '99', 'vote_count.gte': '50' }) },
        { key: 'acclaimed', title: 'Acclaimed Films', kind: 'movie', load: () => fetchDiscover('movie', { with_genres: '99', sort_by: 'vote_average.desc', 'vote_count.gte': '400' }) },
      ]
    default:
      return [
        { key: 'top', title: 'Top 10 Today', style: 'top10', load: () => fetchTrending('home') },
        { key: 'movies', title: 'Trending Movies', kind: 'movie', load: () => fetchTrending('movie') },
        { key: 'new', title: 'New Releases', load: () => fetchRecentlyAdded('home') },
        { key: 'picks', title: "Editor's Picks", kind: 'movie', load: picks(AUTHORS_CHOICE_MOVIES) },
        { key: 'shows', title: 'Trending Shows', kind: 'tv', style: 'wide', load: () => fetchTrending('tv') },
        { key: 'anime', title: 'Anime', kind: 'tv', load: () => fetchAnimeRow('series') },
        { key: 'hindi', title: 'Hindi Hits', kind: 'movie', load: () => fetchDiscover('movie', { with_original_language: 'hi', 'vote_count.gte': '40', 'primary_release_date.gte': recentWindow(), 'primary_release_date.lte': today() }) },
        { key: 'docs', title: 'Documentaries', load: async () => (await fetchPopular('documentary', 1)).results },
      ]
  }
}
