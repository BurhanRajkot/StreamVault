export const CONFIG = {
  TMDB_API_KEY: '668a0dd95d2a554867a2c610467fb934',
  TMDB_BASE_URL: 'https://api.themoviedb.org/3',
  IMG_BASE_URL: 'https://image.tmdb.org/t/p',
  IMG_SIZES: {
    poster: '/w500',
    backdrop: '/original',
    thumbnail: '/w342',
  },

  STREAM_PROVIDERS: {
    /* ================= TV ================= */
    vidfast_pro:
      'https://vidfast.pro/tv/{tmdbId}/{season}/{episode}?autoPlay=true',
    vidsrc_icu: 'https://vidsrc.icu/embed/tv/{tmdbId}/{season}/{episode}',
    vidlink_pro:
      'https://vidlink.pro/tv/{tmdbId}/{season}/{episode}?primaryColor=ff4747&autoplay=true',
    vidsrc_cc:
      'https://vidsrc.cc/v2/embed/tv/{tmdbId}/{season}/{episode}?autoPlay=true&poster=true',
    videasy:
      'https://player.videasy.net/tv/{tmdbId}/{season}/{episode}?color=0278fd&overlay=true',

    /* ================= MOVIE ================= */
    vidfast_pro_movie: 'https://vidfast.pro/movie/{tmdbId}?autoPlay=true',
    vidsrc_icu_movie: 'https://vidsrc.icu/embed/movie/{tmdbId}',
    vidlink_pro_movie: 'https://vidlink.pro/movie/{tmdbId}?autoPlay=true',
    vidsrc_cc_movie:
      'https://vidsrc.cc/v2/embed/movie/{tmdbId}?autoPlay=true&poster=true',
    videasy_movie:
      'https://player.videasy.net/movie/{tmdbId}?color=0278fd&overlay=true',
  },

  PROVIDER_NAMES: {
    vidfast_pro: 'VidFast Pro',
    vidsrc_icu: 'VidSrc ICU',
    vidlink_pro: 'VidLink Pro',
    vidsrc_cc: 'VidSrc CC',
    videasy: 'Videasy',
  } as Record<string, string>,
}

/* ✅ ONLY REQUIRED MODES */
export type MediaMode = 'movie' | 'tv' | 'downloads'

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
}
