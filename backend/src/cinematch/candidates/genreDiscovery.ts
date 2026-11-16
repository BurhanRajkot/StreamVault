import { Candidate, UserProfile } from '../types'
import { fetchTMDB, mapTMDBItem, toPagedResults } from '../utils/tmdb'
import { TMDB_GENRES } from '../types'

// ──────────────────────────────────────────────────────────────
// Genre Discovery — New 6th Candidate Source
// ──────────────────────────────────────────────────────────────
// For each of user's top 3 genres, this source discovers popular
// content from TMDB (both movies and TV) and labels it with the
// genre name so sectionBuilder can create "More Epic Fantasy" rows.
//
// This is the mechanism that gives GOT-watchers a "More Fantasy"
// section filled with Vikings, HoD, Merlin, Witcher etc.
// Ranked by how many people rated it highly (vote_count among titles
// rated 7.4+), not by raw average — sorting by average put 8.8-rated
// romance dramas with a few hundred devoted voters at the top.
// ──────────────────────────────────────────────────────────────

export async function genreDiscoverySource(profile: UserProfile): Promise<Candidate[]> {
  // Get top 3 genres the user actually likes
  const topGenres = Object.entries(profile.genreVector)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([id, weight]) => ({
      id: Number(id),
      weight,
      name: TMDB_GENRES[Number(id)] || `Genre ${id}`,
    }))

  if (topGenres.length === 0) return []

  const results = await Promise.allSettled(
    topGenres.flatMap((genre) => [
      // Movies in this genre
      fetchTMDB(
        `/discover/movie?sort_by=vote_count.desc&with_genres=${genre.id}&vote_average.gte=7.4&page=1`
      ).then((data) =>
        toPagedResults(data).map((r) => {
          const c = mapTMDBItem(r, 'movie', 'genre_discovery')
          if (!c) return null
          return { ...c, seedTitle: genre.name } as Candidate
        }).filter(Boolean) as Candidate[]
      ),
      // TV in this genre
      fetchTMDB(
        `/discover/tv?sort_by=vote_count.desc&with_genres=${genre.id}&vote_average.gte=7.6&without_genres=10767,10763,10764,10766&page=1`
      ).then((data) =>
        toPagedResults(data).map((r) => {
          const c = mapTMDBItem(r, 'tv', 'genre_discovery')
          if (!c) return null
          return { ...c, seedTitle: genre.name } as Candidate
        }).filter(Boolean) as Candidate[]
      ),
    ])
  )

  return results
    .filter((r) => r.status === 'fulfilled')
    .flatMap((r) => (r as PromiseFulfilledResult<Candidate[]>).value)
}
