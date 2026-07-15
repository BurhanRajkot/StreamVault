export const CONFIG = {
  // SECURITY: TMDB_API_KEY removed from frontend - all TMDB calls now go through backend proxy
  // The API key is stored securely in backend environment variables only
  TMDB_BASE_URL: 'https://api.themoviedb.org/3',
  IMG_BASE_URL: 'https://image.tmdb.org/t/p',
  IMG_SIZES: {
    // Responsive TMDB sizes to avoid multi-megabyte original assets on landing page
    poster: '/w342',
    hero: '/w1280',
    // Smaller sizes for cards/thumbnails
    backdrop: '/w780',
    thumbnail: '/w185',
    logo: '/w300',
  },

  /**
   * Multi-width srcSet breakpoints for each image category.
   * Keys are TMDB size paths; values are the display width in px.
   * Used by getImageSrcSet() in api.ts to build responsive srcSet attributes.
   */
  IMG_SRCSET_SIZES: {
    poster: [
      { tmdbSize: '/w185', displayW: 185 },
      { tmdbSize: '/w342', displayW: 342 },
      { tmdbSize: '/w500', displayW: 500 },
    ],
    backdrop: [
      { tmdbSize: '/w300', displayW: 300 },
      { tmdbSize: '/w780', displayW: 780 },
      { tmdbSize: '/w1280', displayW: 1280 },
    ],
    hero: [
      { tmdbSize: '/w780', displayW: 780 },
      { tmdbSize: '/w1280', displayW: 1280 },
    ],
    thumbnail: [
      { tmdbSize: '/w185', displayW: 185 },
    ],
    logo: [
      { tmdbSize: '/w185', displayW: 185 },
      { tmdbSize: '/w300', displayW: 300 },
    ],
  },

  STREAM_PROVIDERS: {
    /* ================= TV ================= */
    // Kept Providers (Verified Working)
    vidsrc_me: 'https://vidsrc.me/embed/tv?tmdb={tmdbId}&season={season}&episode={episode}',
    vidlink_pro: 'https://vidlink.pro/tv/{tmdbId}/{season}/{episode}?primaryColor=ff4747&autoplay=true',
    vidfast_pro: 'https://vidfast.pro/tv/{tmdbId}/{season}/{episode}?autoPlay=true',
    vidzee: 'https://player.vidzee.wtf/embed/tv/{tmdbId}/{season}/{episode}',
    videasy: 'https://player.videasy.to/tv/{tmdbId}/{season}/{episode}',
    obsidian: 'https://vidrock.ru/tv/{tmdbId}/{season}/{episode}',

    // New "Extra" Providers
    extra_2: 'https://vidsrc.pm/embed/tv?tmdb={tmdbId}&season={season}&episode={episode}',
    extra_4: 'https://flicky.host/embed/tv/?id={tmdbId}/{season}/{episode}',

    /* ================= MOVIE ================= */
    // Kept Providers (Verified Working)
    vidsrc_me_movie: 'https://vidsrc.me/embed/movie?tmdb={tmdbId}',
    vidlink_pro_movie: 'https://vidlink.pro/movie/{tmdbId}?primaryColor=ff4747&autoplay=true',
    vidfast_pro_movie: 'https://vidfast.pro/movie/{tmdbId}?autoPlay=true',
    vidzee_movie: 'https://player.vidzee.wtf/embed/movie/{tmdbId}',
    videasy_movie: 'https://player.videasy.to/movie/{tmdbId}',
    obsidian_movie: 'https://vidrock.ru/movie/{tmdbId}',

    // New "Extra" Providers
    extra_2_movie: 'https://vidsrc.pm/embed/movie?tmdb={tmdbId}',
    extra_4_movie: 'https://flicky.host/embed/movie/?id={tmdbId}',
  },

  PROVIDER_NAMES: {
    // Verified Working
    vidsrc_me: 'Source 1 (vidsrc_me)',
    vidlink_pro: 'Source 13 (vidlink_pro)',
    vidfast_pro: 'Source 14 (vidfast_pro)',
    vidzee: 'Source 15 (vidzee)',
    videasy: 'Source 19 (videasy)',
    obsidian: 'Source 20 (obsidian)',

    // Extras
    extra_2: 'Extra 2 (vidsrc.pm)',
    extra_4: 'Extra 4 (flicky)',
  } as Record<string, string>,

  PROVIDER_METADATA: {
    // Verified Working
    vidsrc_me: { quality: '👑 Industry Standard', seekSupport: 'excellent', description: 'Massive library, highly reliable' },
    vidlink_pro: { quality: '⚡ Instant', seekSupport: 'excellent', description: 'Prism HD Stream' },
    vidfast_pro: { quality: '⚡ Ultra Fast', seekSupport: 'excellent', description: 'Lumina High-Speed' },
    vidzee: { quality: '⚡ Ultra Fast', seekSupport: 'excellent', description: 'Lightning fast initial load' },
    videasy: { quality: '✓ Smooth', seekSupport: 'medium', description: 'Horizon Versatile' },
    obsidian: { quality: '⚡ Elite Quality', seekSupport: 'excellent', description: 'Obsidian Premium Stream' },

    // Extras
    extra_2: { quality: '✓ Stable', seekSupport: 'good', description: 'VidSrc PM failover' },
    extra_4: { quality: '⚡ Fast', seekSupport: 'excellent', description: 'Flicky host stream' },
  } as Record<string, { quality: string; seekSupport: string; description: string }>,

  STREAMING_DOMAINS: [
    'vidsrc.me',
    'vidlink.pro',
    'vidfast.pro',
    'player.vidzee.wtf',
    'player.videasy.to',
    'vidrock.ru',
    'vidsrc.pm',
    'flicky.host'
  ],
}

/* ONLY REQUIRED MODES */
export type MediaMode = 'home' | 'movie' | 'tv' | 'downloads' | 'documentary'

export interface Genre {
  id: number
  name: string
}

export interface Cast {
  id: number
  name: string
  character: string
  profile_path: string | null
}

export interface Crew {
  id: number
  name: string
  job: string
  department: string
  profile_path: string | null
}

export interface Media {
  id: number
  title?: string
  name?: string
  poster_path: string | null
  backdrop_path: string | null
  overview: string
  vote_average: number
  popularity?: number
  release_date?: string
  first_air_date?: string
  media_type?: string
  runtime?: number
  tagline?: string
  number_of_seasons?: number
  episode_run_time?: number[]
  genres?: Genre[]
  credits?: {
    cast: Cast[]
    crew: Crew[]
  }
  images?: {
    logos: { file_path: string; iso_639_1: string | null }[]
    backdrops: { file_path: string }[]
  }
  release_dates?: {
    results: {
      iso_3166_1: string
      release_dates: { certification: string }[]
    }[]
  }
  content_ratings?: {
    results: {
      iso_3166_1: string
      rating: string
    }[]
  }
}
