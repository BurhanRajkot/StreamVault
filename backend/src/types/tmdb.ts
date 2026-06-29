// ============================================================
// Shared TMDB API Response Types
// ============================================================
// These interfaces describe the raw JSON shapes returned by TMDB's
// REST API. All candidate sources and route handlers import from
// here instead of using `any`.

/** Raw item returned by /discover/*, /trending/*, /search/*, etc. */
export interface TMDBRawResult {
  id: number
  /** Present on movies */
  title?: string
  /** Present on TV shows and persons */
  name?: string
  overview?: string
  poster_path?: string | null
  backdrop_path?: string | null
  vote_average?: number
  vote_count?: number
  popularity?: number
  /** Movies */
  release_date?: string
  /** TV shows */
  first_air_date?: string
  /** Flat genre ID list (from discover / trending endpoints) */
  genre_ids?: number[]
  /** Full genre objects (from detail endpoint) */
  genres?: TMDBGenre[]
  /** Injected by discover fetcher so items have a known media_type */
  media_type?: 'movie' | 'tv' | 'person'
  /** Season number for TV seasons */
  season_number?: number
}

/** TMDB genre object */
export interface TMDBGenre {
  id: number
  name: string
}

/** TMDB keyword object */
export interface TMDBKeyword {
  id: number
  name: string
}

/** A single person in a cast or crew list */
export interface TMDBCredit {
  id: number
  name?: string
  /** Director / Writer / etc. */
  job?: string
  /** Cast character name */
  character?: string
  media_type?: 'movie' | 'tv'
  title?: string
  overview?: string
  poster_path?: string | null
  vote_average?: number
  vote_count?: number
  popularity?: number
  release_date?: string
  first_air_date?: string
  genre_ids?: number[]
}

/** /person/:id/combined_credits response */
export interface TMDBCombinedCredits {
  cast: TMDBCredit[]
  crew: TMDBCredit[]
}

/** Full movie / TV details from /movie/:id or /tv/:id */
export interface TMDBMediaDetail extends TMDBRawResult {
  tagline?: string
  status?: string
  runtime?: number
  number_of_seasons?: number
  keywords?: {
    /** Movie keywords key */
    keywords?: TMDBKeyword[]
    /** TV keywords key */
    results?: TMDBKeyword[]
  }
  credits?: {
    cast: TMDBCredit[]
    crew: TMDBCredit[]
  }
  seasons?: TMDBRawResult[]
}

/** Paginated TMDB list response */
export interface TMDBPagedResponse {
  page: number
  total_pages: number
  total_results: number
  results: TMDBRawResult[]
}

/** /person/:id response */
export interface TMDBPerson {
  id: number
  name: string
  profile_path?: string | null
  known_for_department?: string
}

/** Safely extracts an error message from an unknown catch value */
export function toErrorMessage(err: unknown): string {
  if (err instanceof Error) return err.message
  if (typeof err === 'string') return err
  return String(err)
}
