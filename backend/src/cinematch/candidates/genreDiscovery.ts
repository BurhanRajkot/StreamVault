import { Candidate, UserProfile } from '../types'
import { fetchTMDB, mapTMDBItem } from '../utils/tmdb'
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
        `/discover/movie?sort_by=vote_average.desc&with_genres=${genre.id}&vote_count.gte=200&page=1`
      ).then((data) =>
        ((data.results || []) as any[]).map((r: any) => {
          const c = mapTMDBItem(r, 'movie', 'genre_discovery')
          if (!c) return null
          return { ...c, seedTitle: genre.name } as Candidate
        }).filter(Boolean) as Candidate[]
      ),
      // TV in this genre
      fetchTMDB(
        `/discover/tv?sort_by=vote_average.desc&with_genres=${genre.id}&vote_count.gte=100&page=1`
      ).then((data) =>
        ((data.results || []) as any[]).map((r: any) => {
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
