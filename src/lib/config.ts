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
    vidfast_pro: 'https://vidfast.pro/tv/{tmdbId}/{season}/{episode}?autoPlay=true',
    vidpop_xyz: 'https://www.vidpop.xyz/embed/?id={tmdbId}&season={season}&episode={episode}',
    vidsrc_icu: 'https://vidsrc.icu/embed/tv/{tmdbId}/{season}/{episode}',
    vidlink_pro: 'https://vidlink.pro/tv/{tmdbId}/{season}/{episode}?primaryColor=00d4aa&autoplay=true',
    vidsrc_cc: 'https://vidsrc.cc/v2/embed/tv/{tmdbId}/{season}/{episode}?autoPlay=true&poster=true',
    autoembed: 'https://player.autoembed.cc/embed/tv/{tmdbId}/{season}/{episode}',

    vidfast_pro_movie: 'https://vidfast.pro/movie/{tmdbId}?autoPlay=true',
    vidpop_xyz_movie: 'https://www.vidpop.xyz/embed/?id={tmdbId}',
    vidsrc_icu_movie: 'https://vidsrc.icu/embed/movie/{tmdbId}',
    vidlink_pro_movie: 'https://vidlink.pro/movie/{tmdbId}?autoPlay=true',
    vidsrc_cc_movie: 'https://vidsrc.cc/v2/embed/movie/{tmdbId}?autoPlay=true&poster=true',
    autoembed_movie: 'https://player.autoembed.cc/embed/movie/{tmdbId}',

    vidfast_pro_anime: 'https://vidlink.pro/anime/{MALid}/{number}/{subOrDub}?fallback=true',
    vidpop_xyz_anime: 'https://vidlink.pro/anime/{MALid}/{number}/{subOrDub}?fallback=true',
    vidsrc_icu_anime: 'https://vidsrc.icu/embed/anime/{MALid}/{number}/{subOrDub}',
    vidlink_pro_anime: 'https://vidlink.pro/anime/{MALid}/{number}/{subOrDub}?fallback=true',
    vidsrc_cc_anime: 'https://vidsrc.cc/v2/embed/anime/{MALid}/{number}/{subOrDub}?autoPlay=true',
    autoembed_anime: 'https://vidlink.pro/anime/{MALid}/{number}/{subOrDub}?fallback=true',
  },

  PROVIDER_NAMES: {
    vidfast_pro: 'VidFast',
    vidpop_xyz: 'VidPop',
    vidsrc_icu: 'VidSrc ICU',
    vidlink_pro: 'VidLink Pro',
    vidsrc_cc: 'VidSrc CC',
    autoembed: 'AutoEmbed',
  } as Record<string, string>,
};

export type MediaMode = 'movie' | 'tv' | 'anime';

export interface Media {
  id: number;
  title?: string;
  name?: string;
  poster_path: string | null;
  backdrop_path: string | null;
  overview: string;
  vote_average: number;
  release_date?: string;
  first_air_date?: string;
  genre_ids?: number[];
}
