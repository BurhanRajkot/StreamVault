/**
 * StreamVault E2E — Centralized Mock Data Factories
 *
 * All API response shapes live here. Update once, tests stay in sync.
 */

// ─── TMDB Types ────────────────────────────────────────────────────────────

export interface MockMovie {
  id: number
  title: string
  media_type: 'movie' | 'tv'
  poster_path: string
  backdrop_path: string
  vote_average: number
  overview: string
  release_date: string
  genres: { id: number; name: string }[]
  runtime?: number
  tagline?: string
  status?: string
  production_companies?: { id: number; name: string; logo_path: string | null }[]
  videos?: { results: MockVideo[] }
  credits?: { cast: MockCastMember[]; crew: MockCastMember[] }
}

export interface MockVideo {
  id: string
  key: string
  name: string
  type: string
  site: string
}

export interface MockCastMember {
  id: number
  name: string
  character?: string
  job?: string
  profile_path: string | null
}

export interface MockFavorite {
  id: string
  tmdbId: number
  mediaType: string
  addedAt: string
}

export interface MockAdminRequest {
  id: string
  user_id: string
  email: string
  plan_id: string
  amount: number
  currency: string
  transaction_id: string
  status: 'pending' | 'approved' | 'rejected'
  created_at: string
}

// ─── Movie Fixtures ────────────────────────────────────────────────────────

export const MOCK_MOVIES = {
  inception: {
    id: 27205,
    title: 'Inception',
    media_type: 'movie' as const,
    poster_path: '/ljsZTbVsrQSqZgWeep2B1QiDKuh.jpg',
    backdrop_path: '/s2bT29y0ngXxxu2IA8AOzzXTRhd.jpg',
    vote_average: 8.4,
    overview: 'Cobb, a skilled thief who commits corporate espionage by infiltrating the subconscious of his targets, is offered a chance to regain his old life as payment for a task considered to be impossible.',
    release_date: '2010-07-15',
    genres: [{ id: 28, name: 'Action' }, { id: 53, name: 'Thriller' }, { id: 878, name: 'Science Fiction' }],
    runtime: 148,
    tagline: 'Your mind is the scene of the crime.',
    status: 'Released',
    production_companies: [{ id: 923, name: 'Legendary Pictures', logo_path: null }],
    videos: {
      results: [
        { id: 'v1', key: 'YoHD9XEInc0', name: 'Official Trailer', type: 'Trailer', site: 'YouTube' }
      ]
    },
    credits: {
      cast: [
        { id: 6193, name: 'Leonardo DiCaprio', character: 'Dom Cobb', profile_path: '/wo2hJpn04vbtmh0B9utCFdsQhxM.jpg' },
        { id: 27578, name: 'Joseph Gordon-Levitt', character: 'Arthur', profile_path: '/msugySeTCBiD5bMbhfm8tENuERx.jpg' }
      ],
      crew: [
        { id: 525, name: 'Christopher Nolan', job: 'Director', profile_path: '/xuAIuYSmsUzKlUMBFGVZaWsY3DZ.jpg' }
      ]
    }
  } satisfies MockMovie,

  darkKnight: {
    id: 155,
    title: 'The Dark Knight',
    media_type: 'movie' as const,
    poster_path: '/qJ2tW6WMUDux911r6m7haRef0WH.jpg',
    backdrop_path: '/nMKdUUepR0i5zn0y1T4CejMPAva.jpg',
    vote_average: 9.0,
    overview: 'Batman raises the stakes in his war on crime. With the help of Lt. Jim Gordon and District Attorney Harvey Dent, Batman sets out to dismantle the remaining criminal organizations that plague the streets.',
    release_date: '2008-07-18',
    genres: [{ id: 28, name: 'Action' }, { id: 80, name: 'Crime' }, { id: 18, name: 'Drama' }],
    runtime: 152,
    tagline: 'Why So Serious?',
    status: 'Released',
    production_companies: [{ id: 174, name: 'Warner Bros.', logo_path: null }],
    videos: { results: [] },
    credits: { cast: [], crew: [] }
  } satisfies MockMovie,

  breakingBad: {
    id: 1396,
    title: 'Breaking Bad',
    media_type: 'tv' as const,
    poster_path: '/ggFHVNu6YYI5L9pCfOacjizRGt.jpg',
    backdrop_path: '/tsRy63Mu5cu8etL1X7ZLyf7UP1M.jpg',
    vote_average: 9.5,
    overview: 'When Walter White, a New Mexico chemistry teacher, is diagnosed with Stage III cancer and given a prognosis of only two years left to live, he gets into the drug trade to secure his family\'s financial future.',
    release_date: '2008-01-20',
    genres: [{ id: 18, name: 'Drama' }, { id: 80, name: 'Crime' }],
    runtime: 45,
    tagline: 'Change the equation.',
    status: 'Ended',
    production_companies: [],
    videos: { results: [] },
    credits: { cast: [], crew: [] }
  } satisfies MockMovie,
}

// ─── API Response Builders ─────────────────────────────────────────────────

export const buildDiscoverResponse = (movies: MockMovie[] = [MOCK_MOVIES.inception, MOCK_MOVIES.darkKnight]) => ({
  results: movies,
  total_pages: 1,
  total_results: movies.length,
  page: 1,
})

export const buildTrendingResponse = (movies: MockMovie[] = [MOCK_MOVIES.inception, MOCK_MOVIES.darkKnight]) => ({
  results: movies,
  page: 1,
  total_pages: 1,
  total_results: movies.length,
})

export const buildSearchResponse = (movies: MockMovie[] = [MOCK_MOVIES.inception]) => ({
  results: movies,
  total_results: movies.length,
  total_pages: 1,
  page: 1,
})

export const buildEmptySearchResponse = () => ({
  results: [],
  total_results: 0,
  total_pages: 0,
  page: 1,
})

export const buildMovieDetailResponse = (movie: MockMovie = MOCK_MOVIES.inception) => movie

export const buildFavoritesResponse = (favorites: MockFavorite[] = []) => favorites

export const buildAdminRequests = (overrides: Partial<MockAdminRequest>[] = []): MockAdminRequest[] => [
  {
    id: 'req-1',
    user_id: 'user-123',
    email: 'premium-user@example.com',
    plan_id: 'premium',
    amount: 499,
    currency: 'INR',
    transaction_id: 'TXN_987654',
    status: 'pending',
    created_at: new Date().toISOString(),
    ...overrides[0],
  },
  {
    id: 'req-2',
    user_id: 'user-456',
    email: 'basic-user@example.com',
    plan_id: 'basic',
    amount: 199,
    currency: 'INR',
    transaction_id: 'TXN_123456',
    status: 'pending',
    created_at: new Date(Date.now() - 86400000).toISOString(),
    ...overrides[1],
  },
]

// ─── User Fixtures ─────────────────────────────────────────────────────────

export const MOCK_USERS = {
  regular: {
    sub: 'auth0|mock-user-regular-123',
    name: 'Alex Johnson',
    email: 'alex@example.com',
    picture: 'https://via.placeholder.com/40',
    email_verified: true,
  },
  admin: {
    sub: 'auth0|mock-admin-456',
    name: 'Admin User',
    email: 'admin@streamvault.com',
    picture: 'https://via.placeholder.com/40',
    email_verified: true,
  },
}

// ─── Admin Auth ────────────────────────────────────────────────────────────

export const MOCK_ADMIN_TOKEN = 'mock-admin-jwt-token-v2'
export const ADMIN_HMAC_SECRET = '98677'
