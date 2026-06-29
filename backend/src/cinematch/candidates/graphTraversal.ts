// ============================================================
// CineMatch — Graph Traversal Source (KGAT-lite / Phase 3)
//
// Simulates multi-hop knowledge graph traversal using TMDB's API:
//
//   User → liked film → director → other films by that director
//   User → liked film → lead actor → other high-rated films by that actor
//
// In a full KGAT system this would traverse a pre-built kg-graph stored
// in a graph database. Here we approximate it by walking TMDB's relational
// data: movie → credits → person → filmography.
//
// Why this matters:
//   A user who loved "There Will Be Blood" (2007) probably wants other
//   Paul Thomas Anderson films. Standard recommenders surface this via CF but
//   miss it for new users with sparse profiles. Graph traversal catches it
//   immediately because the signal is structural (director link) not statistical.
// ============================================================

import { Candidate, UserProfile } from '../types'
import { fetchTMDB, mapTMDBItem } from '../utils/tmdb'
import { logger } from '../../lib/logger'

/** Shape of a single item in TMDB's combined_credits cast/crew arrays */
interface TMDBCredit {
  id: number
  vote_count?: number
  vote_average?: number
  popularity?: number
  media_type?: string
  job?: string
  title?: string
  name?: string
  overview?: string
  poster_path?: string | null
  backdrop_path?: string | null
  release_date?: string
  first_air_date?: string
  genre_ids?: number[]
}

/** Shape of /person/:id/combined_credits response */
interface TMDBPersonCredits {
  name?: string
  cast?: TMDBCredit[]
  crew?: TMDBCredit[]
}

const MAX_DIRECTORS = 3   // Walk filmography for top-3 directors
const MAX_ACTORS = 3      // Walk filmography for top-3 lead actors
const MIN_VOTE_COUNT = 50 // Filter out little-known works
const MIN_VOTE_AVERAGE = 6.0 // Quality gate

// ── Resolve top N directors from director affinity vector ─

function getTopDirectorIds(profile: UserProfile, limit: number): number[] {
  return Object.entries(profile.directorVector)
    .filter(([, w]) => w > 0)
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([id]) => Number(id))
}

// ── Resolve top N cast members from cast affinity vector ──

function getTopActorIds(profile: UserProfile, limit: number): number[] {
  return Object.entries(profile.castVector)
    .filter(([, w]) => w > 0)
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([id]) => Number(id))
}


// ── Main Export ───────────────────────────────────────────

export async function graphTraversalSource(profile: UserProfile): Promise<Candidate[]> {
  // Skip for new users with no profile signal
  if (profile.isNewUser) return []
  if (
    Object.keys(profile.directorVector).length === 0 &&
    Object.keys(profile.castVector).length === 0
  ) return []

  const topDirectorIds = getTopDirectorIds(profile, MAX_DIRECTORS)
  const topActorIds = getTopActorIds(profile, MAX_ACTORS)

  if (topDirectorIds.length === 0 && topActorIds.length === 0) return []

  // Fetch director filmographies in parallel (combined_credits includes name, so single API call per person)
  const directorPromises = topDirectorIds.map(async personId => {
    try {
      const raw = await fetchTMDB(`/person/${personId}/combined_credits`)
      const data = raw as TMDBPersonCredits
      const name = data.name || `Director ${personId}`
      const credits = (data.crew || []).filter((c) => c.job === 'Director')
      const candidates: Candidate[] = credits
        .filter((item) =>
          (item.vote_count ?? 0) >= MIN_VOTE_COUNT &&
          (item.vote_average ?? 0) >= MIN_VOTE_AVERAGE &&
          !profile.watchedIds.has(item.id) &&
          !profile.dislikedIds.has(item.id) &&
          (item.media_type === 'movie' || item.media_type === 'tv')
        )
        .sort((a, b) => (b.vote_average ?? 0) - (a.vote_average ?? 0))
        .slice(0, 8)
        .map((item) => {
          const mediaType = item.media_type as 'movie' | 'tv'
          const candidate = mapTMDBItem(
            { ...item, genre_ids: item.genre_ids || [] },
            mediaType,
            'tmdb_recommendations',
          )
          if (!candidate) return null
          return { ...candidate, seedTitle: name } as Candidate
        })
        .filter(Boolean) as Candidate[]
      return candidates
    } catch {
      return [] as Candidate[]
    }
  })

  // Fetch actor filmographies in parallel (same single-call approach)
  const actorPromises = topActorIds.map(async personId => {
    try {
      const raw = await fetchTMDB(`/person/${personId}/combined_credits`)
      const data = raw as TMDBPersonCredits
      const name = data.name || `Actor ${personId}`
      const credits = data.cast || []
      const candidates: Candidate[] = credits
        .filter((item) =>
          (item.vote_count ?? 0) >= MIN_VOTE_COUNT &&
          (item.vote_average ?? 0) >= MIN_VOTE_AVERAGE &&
          !profile.watchedIds.has(item.id) &&
          !profile.dislikedIds.has(item.id) &&
          (item.media_type === 'movie' || item.media_type === 'tv')
        )
        .sort((a, b) => (b.vote_average ?? 0) - (a.vote_average ?? 0))
        .slice(0, 8)
        .map((item) => {
          const mediaType = item.media_type as 'movie' | 'tv'
          const candidate = mapTMDBItem(
            { ...item, genre_ids: item.genre_ids || [] },
            mediaType,
            'tmdb_similar',
          )
          if (!candidate) return null
          return { ...candidate, seedTitle: name } as Candidate
        })
        .filter(Boolean) as Candidate[]
      return candidates
    } catch {
      return [] as Candidate[]
    }
  })

  const allResults = await Promise.allSettled([...directorPromises, ...actorPromises])

  const candidates = allResults
    .filter(r => r.status === 'fulfilled')
    .flatMap(r => (r as PromiseFulfilledResult<Candidate[]>).value)

  logger.info('[GraphTraversal] Produced candidates', {
    directors: topDirectorIds.length,
    actors: topActorIds.length,
    total: candidates.length,
  })

  return candidates
}
