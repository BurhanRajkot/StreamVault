export const CONFIG = {
  // SECURITY: TMDB_API_KEY removed from frontend - all TMDB calls now go through backend proxy
  // The API key is stored securely in backend environment variables only
  TMDB_BASE_URL: 'https://api.themoviedb.org/3',
  IMG_BASE_URL: 'https://image.tmdb.org/t/p',
  IMG_SIZES: {
    poster: '/w500',
    backdrop: '/original',
    thumbnail: '/w342',
  },

    STREAM_PROVIDERS: {
      /* ================= TV ================= */
      vidsrc_pro:
        'https://vidsrc.to/embed/tv/{tmdbId}/{season}/{episode}',
      vidfast_pro:
        'https://vidfast.pro/tv/{tmdbId}/{season}/{episode}?autoPlay=true&preload=auto&ds_lang=en',
      vidsrc_icu: 'https://vidsrc.icu/embed/tv/{tmdbId}/{season}/{episode}?autoplay=1&preload=auto&ds_lang=en',
      vidlink_pro:
        'https://vidlink.pro/tv/{tmdbId}/{season}/{episode}?primaryColor=ff4747&autoplay=true&preload=auto&ds_lang=en',
      vidsrc_cc:
        'https://vidsrc.cc/v2/embed/tv/{tmdbId}/{season}/{episode}?autoPlay=true&poster=false&preload=auto&ds_lang=en',
      videasy:
        'https://player.videasy.net/tv/{tmdbId}/{season}/{episode}?color=0278fd&overlay=false&autoplay=1&preload=auto&ds_lang=en',
      vidsrc_net:
        'https://vidsrc.net/embed/tv/{tmdbId}/{season}/{episode}',

      /* ================= MOVIE ================= */
      vidsrc_pro_movie: 'https://vidsrc.to/embed/movie/{tmdbId}',
      vidfast_pro_movie: 'https://vidfast.pro/movie/{tmdbId}?autoPlay=true&preload=auto&ds_lang=en',
      vidsrc_icu_movie: 'https://vidsrc.icu/embed/movie/{tmdbId}?autoplay=1&preload=auto&ds_lang=en',
      vidlink_pro_movie: 'https://vidlink.pro/movie/{tmdbId}?autoPlay=true&preload=auto&ds_lang=en',
      vidsrc_cc_movie:
        'https://vidsrc.cc/v2/embed/movie/{tmdbId}?autoPlay=true&poster=false&preload=auto&ds_lang=en',
      videasy_movie:
        'https://player.videasy.net/movie/{tmdbId}?color=0278fd&overlay=false&autoplay=1&preload=auto&ds_lang=en',
      vidsrc_net_movie: 'https://vidsrc.net/embed/movie/{tmdbId}',
    },

  PROVIDER_NAMES: {
    vidsrc_pro: 'VidSrc Pro',
    vidfast_pro: 'VidFast Pro',
    vidsrc_icu: 'VidSrc ICU (DOWN)',
    vidlink_pro: 'VidLink Pro',
    vidsrc_cc: 'VidSrc CC',
    videasy: 'Videasy',
    vidsrc_net: 'VidSrc Net',
  } as Record<string, string>,

  PROVIDER_METADATA: {
    vidsrc_pro: { quality: '🌟 Latest/Best', seekSupport: 'excellent', description: 'Latest quality streams' },
    vidfast_pro: { quality: '⚡ Fast', seekSupport: 'excellent', description: 'Best for seeking' },
    vidsrc_icu: { quality: '❌ Offline', seekSupport: 'poor', description: 'Currently down' },
    vidlink_pro: { quality: '⚡ Fast', seekSupport: 'excellent', description: 'Fast buffering' },
    vidsrc_cc: { quality: '✓ Good', seekSupport: 'good', description: 'Stable playback' },
    videasy: { quality: '✓ Good', seekSupport: 'medium', description: 'Standard quality' },
    vidsrc_net: { quality: '🌟 Reliable', seekSupport: 'good', description: 'Alternative VidSrc' },
  } as Record<string, { quality: string; seekSupport: string; description: string }>,

  STREAMING_DOMAINS: [
    'vidsrc.to',
    'vidfast.pro',
    'vidsrc.icu',
    'vidlink.pro',
    'vidsrc.cc',
    'player.videasy.net',
    'vidsrc.net',
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

export interface Media {
  id: number
  title?: string
  name?: string
  poster_path: string | null
  backdrop_path: string | null
  overview: string
  vote_average: number
  release_date?: string
  first_air_date?: string
  media_type?: string
  runtime?: number
  episode_run_time?: number[]
  genres?: Genre[]
  credits?: {
    cast: Cast[]
  }
}
