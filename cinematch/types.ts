// ============================================================
// CineMatch AI — Shared Types
// Inspired by X's candidate-pipeline trait definitions
// ============================================================

export type MediaType = 'movie' | 'tv'
export type EventType = 'watch' | 'favorite' | 'click' | 'search' | 'rate'

// A raw candidate retrieved from any source (pre-ranking)
export interface Candidate {
  tmdbId: number
  mediaType: MediaType
  title: string
  posterPath: string | null
  backdropPath: string | null
  overview: string
  releaseDate: string
  voteAverage: number
  voteCount: number
  popularity: number
  genreIds: number[]
  source: CandidateSource  // which pipeline stage produced this
}

// A candidate after feature hydration + scoring
export interface ScoredCandidate extends Candidate {
  score: number
  genreAffinityScore: number
  popularityScore: number
  freshnessScore: number
  qualityScore: number
  sourceReason: string  // Human-readable "Because you watched X"
}

// What source produced the candidate
export type CandidateSource =
  | 'tmdb_similar'
  | 'tmdb_recommendations'
  | 'trending'
  | 'popular_fallback'
  | 'collaborative'

// Interaction event to be logged
export interface InteractionEvent {
  userId: string
  tmdbId: number
  mediaType: MediaType
  eventType: EventType
  weight: number
  progress?: number
  rating?: number
}

// User profile built from interaction history
export interface UserProfile {
  userId: string
  genreVector: Record<number, number>     // genreId → affinity weight [0..1]
  watchedIds: Set<number>                 // tmdbIds already seen
  favoritedIds: Set<number>              // tmdbIds in Favorites
  recentlyWatched: RecentItem[]          // last N items for seeding similarity sources
  isNewUser: boolean                     // cold-start flag
}

export interface RecentItem {
  tmdbId: number
  mediaType: MediaType
  title: string
  weight: number  // recency-decayed weight
}

// What the API returns to the frontend
export interface RecommendationResult {
  userId: string | null  // null for guest
  items: ScoredCandidate[]
  sections: RecommendationSection[]  // For "Because you watched X" grouping
  computedAt: string
  isPersonalized: boolean
}

// UI section like "Because you watched Game of Thrones"
export interface RecommendationSection {
  title: string
  items: ScoredCandidate[]
  source: CandidateSource
}

// TMDB Genre definitions (subset of common genres)
export const TMDB_GENRES: Record<number, string> = {
  28: 'Action',
  12: 'Adventure',
  16: 'Animation',
  35: 'Comedy',
  80: 'Crime',
  99: 'Documentary',
  18: 'Drama',
  10751: 'Family',
  14: 'Fantasy',
  36: 'History',
  27: 'Horror',
  10402: 'Music',
  9648: 'Mystery',
  10749: 'Romance',
  878: 'Science Fiction',
  10770: 'TV Movie',
  53: 'Thriller',
  10752: 'War',
  37: 'Western',
  10759: 'Action & Adventure',
  10762: 'Kids',
  10763: 'News',
  10764: 'Reality',
  10765: 'Sci-Fi & Fantasy',
  10766: 'Soap',
  10767: 'Talk',
  10768: 'War & Politics',
}
