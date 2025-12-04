export const CONFIG = {
  TMDB_API_KEY: '668a0dd95d2a554867a2c610467fb934',
  TMDB_BASE_URL: 'https://api.themoviedb.org/3',
  IMG_BASE_URL: 'https://image.tmdb.org/t/p',
  IMG_SIZES: {
    poster: '/w500',
    backdrop: '/original',
    thumbnail: '/w342',
  },

  // Updated working stream providers
  STREAM_PROVIDERS: {
    // TV Show providers
    vidsrc_pro: 'https://vidsrc.pro/embed/tv/{tmdbId}/{season}/{episode}',
    vidsrc_xyz: 'https://vidsrc.xyz/embed/tv/{tmdbId}/{season}/{episode}',
    embedsu: 'https://embed.su/embed/tv/{tmdbId}/{season}/{episode}',
    multiembed: 'https://multiembed.mov/directstream.php?video_id={tmdbId}&tmdb=1&s={season}&e={episode}',
    smashystream: 'https://player.smashy.stream/tv/{tmdbId}?s={season}&e={episode}',
    twoembed: 'https://www.2embed.cc/embedtv/{tmdbId}&s={season}&e={episode}',

    // Movie providers
    vidsrc_pro_movie: 'https://vidsrc.pro/embed/movie/{tmdbId}',
    vidsrc_xyz_movie: 'https://vidsrc.xyz/embed/movie/{tmdbId}',
    embedsu_movie: 'https://embed.su/embed/movie/{tmdbId}',
    multiembed_movie: 'https://multiembed.mov/directstream.php?video_id={tmdbId}&tmdb=1',
    smashystream_movie: 'https://player.smashy.stream/movie/{tmdbId}',
    twoembed_movie: 'https://www.2embed.cc/embed/{tmdbId}',

    // Anime providers (using MAL ID)
    vidsrc_pro_anime: 'https://vidsrc.pro/embed/tv/{tmdbId}',
    vidsrc_xyz_anime: 'https://vidsrc.xyz/embed/tv/{tmdbId}',
    embedsu_anime: 'https://embed.su/embed/tv/{tmdbId}',
    multiembed_anime: 'https://multiembed.mov/directstream.php?video_id={MALid}&mal=1&e={number}',
    smashystream_anime: 'https://player.smashy.stream/anime/{MALid}/{number}/{subOrDub}',
    twoembed_anime: 'https://www.2embed.cc/embedanime/{MALid}&ep={number}',
  },

  PROVIDER_NAMES: {
    vidsrc_pro: 'VidSrc Pro',
    vidsrc_xyz: 'VidSrc XYZ',
    embedsu: 'EmbedSU',
    multiembed: 'MultiEmbed',
    smashystream: 'SmashyStream',
    twoembed: '2Embed',
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
  number_of_seasons?: number;
  number_of_episodes?: number;
}
