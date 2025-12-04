import { CONFIG, Media, MediaMode } from './config';

export async function fetchPopular(mode: MediaMode, page = 1): Promise<{ results: Media[]; total_pages: number }> {
  if (mode === 'anime') {
    return { results: [], total_pages: 0 };
  }

  const url = `${CONFIG.TMDB_BASE_URL}/discover/${mode}?sort_by=popularity.desc&api_key=${CONFIG.TMDB_API_KEY}&page=${page}`;

  try {
    const res = await fetch(url);
    const data = await res.json();
    return {
      results: data.results || [],
      total_pages: data.total_pages || 0,
    };
  } catch (error) {
    console.error('Error fetching popular:', error);
    return { results: [], total_pages: 0 };
  }
}

export async function fetchTrending(mode: MediaMode): Promise<Media[]> {
  if (mode === 'anime') return [];

  const url = `${CONFIG.TMDB_BASE_URL}/trending/${mode}/week?api_key=${CONFIG.TMDB_API_KEY}`;

  try {
    const res = await fetch(url);
    const data = await res.json();
    return data.results || [];
  } catch (error) {
    console.error('Error fetching trending:', error);
    return [];
  }
}

export async function searchMedia(mode: MediaMode, query: string, page = 1): Promise<{ results: Media[]; total_pages: number }> {
  if (mode === 'anime') {
    return { results: [], total_pages: 0 };
  }

  const url = `${CONFIG.TMDB_BASE_URL}/search/${mode}?api_key=${CONFIG.TMDB_API_KEY}&query=${encodeURIComponent(query)}&page=${page}`;

  try {
    const res = await fetch(url);
    const data = await res.json();
    return {
      results: data.results || [],
      total_pages: data.total_pages || 0,
    };
  } catch (error) {
    console.error('Error searching:', error);
    return { results: [], total_pages: 0 };
  }
}

export async function fetchMediaDetails(mode: MediaMode, id: number): Promise<Media | null> {
  if (mode === 'anime') return null;

  const url = `${CONFIG.TMDB_BASE_URL}/${mode}/${id}?api_key=${CONFIG.TMDB_API_KEY}`;

  try {
    const res = await fetch(url);
    return await res.json();
  } catch (error) {
    console.error('Error fetching details:', error);
    return null;
  }
}

export async function fetchTVSeasons(tvId: number): Promise<{ season_number: number; episode_count: number; name: string }[]> {
  const url = `${CONFIG.TMDB_BASE_URL}/tv/${tvId}?api_key=${CONFIG.TMDB_API_KEY}`;

  try {
    const res = await fetch(url);
    const data = await res.json();
    return data.seasons?.filter((s: any) => s.season_number > 0) || [];
  } catch (error) {
    console.error('Error fetching TV seasons:', error);
    return [];
  }
}

export function getImageUrl(path: string | null, size: 'poster' | 'backdrop' | 'thumbnail' = 'poster'): string {
  if (!path) return '/placeholder.svg';
  return `${CONFIG.IMG_BASE_URL}${CONFIG.IMG_SIZES[size]}${path}`;
}

/**
 * Build embed URL based on mode, provider, and media ID.
 * Matches the exact logic from the working JavaScript version.
 */
export function buildEmbedUrl(
  mode: MediaMode,
  provider: string,
  mediaId: number,
  options: { season?: number; episode?: number; malId?: string; subOrDub?: string }
): string {
  const { season = 1, episode = 1, malId = '', subOrDub = 'sub' } = options;

  let template = '';

  // Handle TV mode
  if (mode === 'tv') {
    template = CONFIG.STREAM_PROVIDERS[provider];
    if (!template) return '';

    return template
      .replace(/\{tmdbId\}/g, String(mediaId))
      .replace(/\{season\}/g, String(season))
      .replace(/\{episode\}/g, String(episode));
  }

  // Handle Movie mode
  if (mode === 'movie') {
    const movieProvider = `${provider}_movie`;
    template = CONFIG.STREAM_PROVIDERS[movieProvider];
    if (!template) return '';

    return template.replace(/\{tmdbId\}/g, String(mediaId));
  }

  // Handle Anime mode
  if (mode === 'anime') {
    const animeProvider = `${provider}_anime`;
    template = CONFIG.STREAM_PROVIDERS[animeProvider];
    if (!template) return '';

    return template
      .replace(/\{MALid\}/g, malId)
      .replace(/\{tmdbId\}/g, String(mediaId))
      .replace(/\{number\}/g, String(episode))
      .replace(/\{subOrDub\}/g, subOrDub);
  }

  return '';
}
