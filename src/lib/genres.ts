/**
 * TMDB genre ids → names, movie and TV combined. List endpoints (trending,
 * discover, search) return bare `genre_ids`; this names them without another
 * request. Ids are stable on TMDB's side.
 */
const GENRE_NAMES: Record<number, string> = {
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
  878: 'Sci-Fi',
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

/** Up to `limit` genre names for a list of ids, unknown ids skipped. */
export function genreNames(ids: readonly number[] | undefined, limit = 2): string[] {
  if (!ids) return []
  return ids
    .map((id) => GENRE_NAMES[id])
    .filter((name): name is string => !!name)
    .slice(0, limit)
}
