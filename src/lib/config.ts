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
    peachify:
      'https://peachify.top/embed/tv/{tmdbId}/{season}/{episode}',
    vidup:
      'https://vidup.to/embed/tv/{tmdbId}/{season}/{episode}',
    vidfast_pro:
      'https://vidfast.pro/tv/{tmdbId}/{season}/{episode}?autoPlay=true&preload=auto&ds_lang=en',
    vidsrc_icu: 'https://2embed.cc/embed/tv/{tmdbId}/{season}/{episode}',
    vidlink_pro:
      'https://vidlink.pro/tv/{tmdbId}/{season}/{episode}?primaryColor=ff4747&autoplay=true&preload=auto&ds_lang=en',
    vidsrc_cc:
      'https://vidsrc.cc/v2/embed/tv/{tmdbId}/{season}/{episode}?autoPlay=true&poster=false',
    videasy:
      'https://player.videasy.to/tv/{tmdbId}/{season}/{episode}?color=0278fd&overlay=false&autoplay=1&preload=auto&ds_lang=en',
    obsidian:
      'https://vidrock.ru/tv/{tmdbId}/{season}/{episode}',
    vidzee:
      'https://player.vidzee.wtf/embed/tv/{tmdbId}/{season}/{episode}',

    /* ================= MOVIE ================= */
    peachify_movie: 'https://peachify.top/embed/movie/{tmdbId}',
    vidup_movie: 'https://vidup.to/embed/movie/{tmdbId}',
    vidfast_pro_movie: 'https://vidfast.pro/movie/{tmdbId}?autoPlay=true&preload=auto&ds_lang=en',
    vidsrc_icu_movie: 'https://2embed.cc/embed/movie/{tmdbId}',
    vidlink_pro_movie: 'https://vidlink.pro/movie/{tmdbId}?autoPlay=true&preload=auto&ds_lang=en',
    vidsrc_cc_movie:
      'https://vidsrc.cc/v2/embed/movie/{tmdbId}?autoPlay=true&poster=false',
    videasy_movie:
      'https://player.videasy.to/movie/{tmdbId}?color=0278fd&overlay=false&autoplay=1&preload=auto&ds_lang=en',
    obsidian_movie: 'https://vidrock.ru/movie/{tmdbId}',
    vidzee_movie: 'https://player.vidzee.wtf/embed/movie/{tmdbId}',
  },

  PROVIDER_NAMES: {
    vidlink_pro: 'Prism HD',
    vidfast_pro: 'Lumina Pro',
    vidsrc_icu: 'Nova Stream',
    peachify: 'Solaris HD',
    vidup: 'Vortex Player',
    vidsrc_cc: 'Pulse Player',
    videasy: 'Horizon Select',
    obsidian: 'Obsidian Stream',
    vidzee: 'VidZee',
  } as Record<string, string>,

  PROVIDER_METADATA: {
    peachify: { quality: '🌟 Elite Quality', seekSupport: 'excellent', description: 'Solaris Fast Stream' },
    vidup: { quality: '✓ Smooth', seekSupport: 'good', description: 'Vortex Fast Stream' },
    vidfast_pro: { quality: '⚡ Ultra Fast', seekSupport: 'excellent', description: 'Lumina High-Speed' },
    vidsrc_icu: { quality: '✓ Crystal', seekSupport: 'good', description: '2Embed Reliable' },
    vidlink_pro: { quality: '⚡ Instant', seekSupport: 'excellent', description: 'Prism HD Stream' },
    vidsrc_cc: { quality: '✓ Vibrant', seekSupport: 'good', description: 'Pulse Stable Player' },
    videasy: { quality: '✓ Smooth', seekSupport: 'medium', description: 'Horizon Versatile' },
    obsidian: { quality: '⚡ Elite Quality', seekSupport: 'excellent', description: 'Obsidian Premium Stream' },
    vidzee: { quality: '⚡ Ultra Fast', seekSupport: 'excellent', description: 'VidZee Lightning Stream' },
  } as Record<string, { quality: string; seekSupport: string; description: string }>,

  STREAMING_DOMAINS: [
    'peachify.top',
    'vidup.to',
    'vidfast.pro',
    '2embed.cc',
    'vidlink.pro',
    'vidsrc.cc',
    'player.videasy.to',
    'vidrock.ru',
    'player.vidzee.wtf',
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
