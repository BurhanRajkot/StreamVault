import { getImageUrl } from './api'
import type { Media, MediaMode } from './config'

/**
 * The display-ready fields the detail views read off a `Media`.
 *
 * TMDB spreads the same fact across different shapes depending on the endpoint
 * and the media type — a certificate lives under `release_dates` for films and
 * `content_ratings` for shows, a title is `title` or `name` — so the views get
 * this flattened view instead of re-deriving it each time.
 */
export interface MediaDisplay {
  title: string
  subtitle: string
  description: string
  rating: number
  /** Vote average as a percentage string, e.g. "82%". */
  match: string
  year: string
  /** US certificate, or "NR" when TMDB has none. */
  contentRating: string
  /** "2h 13m" for a film, "3 Seasons" for a show, "" when unknown. */
  durationStr: string
  genres: string[]
  director: string
  cast: { name: string; role: string; image: string }[]
  heroImage: string
  posterImage: string
  /** Title-treatment logo, or null when TMDB has no usable one. */
  logoImage: string | null
}

/** US certificate for a film, from the per-country release-date records. */
function movieCertificate(media: Media): string | null {
  const usRelease = media.release_dates?.results?.find((r) => r.iso_3166_1 === 'US')
  if (!usRelease || usRelease.release_dates.length === 0) return null
  return usRelease.release_dates.find((d) => d.certification)?.certification || null
}

/** US certificate for a show, which TMDB files separately from films. */
function tvCertificate(media: Media): string | null {
  const usRating = media.content_ratings?.results?.find((r) => r.iso_3166_1 === 'US')
  return usRating?.rating || null
}

function formatDuration(media: Media): string {
  if (media.runtime) {
    const hours = Math.floor(media.runtime / 60)
    const mins = media.runtime % 60
    return hours > 0 ? `${hours}h ${mins}m` : `${mins}m`
  }
  if (media.number_of_seasons) {
    const plural = media.number_of_seasons > 1 ? 's' : ''
    return `${media.number_of_seasons} Season${plural}`
  }
  return ''
}

/**
 * Pick a title logo: English first, then one tagged with no language (usually
 * a wordless treatment that reads in any locale), then whatever exists.
 */
function pickLogo(media: Media): string | null {
  const logos = media.images?.logos || []
  if (logos.length === 0) return null

  const chosen =
    logos.find((l) => l.iso_639_1 === 'en') ||
    logos.find((l) => !l.iso_639_1) ||
    logos[0]

  return getImageUrl(chosen.file_path, 'logo')
}

/** How many cast members the detail views have room for. */
const CAST_LIMIT = 4

export function deriveMediaDisplay(media: Media, mode: MediaMode): MediaDisplay {
  const isMovie = mode === 'movie' || media.media_type === 'movie'
  const rating = media.vote_average || 0

  return {
    title: media.title || media.name || 'Unknown',
    subtitle: media.tagline || '',
    description: media.overview || 'No description available.',
    rating,
    match: `${(rating * 10).toFixed(0)}%`,
    year: (media.release_date || media.first_air_date || '').split('-')[0] || '',
    contentRating: (isMovie ? movieCertificate(media) : tvCertificate(media)) || 'NR',
    durationStr: formatDuration(media),
    genres: media.genres?.map((g) => g.name) || [],
    director: media.credits?.crew?.find((c) => c.job === 'Director')?.name || 'Unknown',
    cast:
      media.credits?.cast?.slice(0, CAST_LIMIT).map((c) => ({
        name: c.name,
        role: c.character,
        image: getImageUrl(c.profile_path, 'thumbnail'),
      })) || [],
    heroImage: getImageUrl(media.backdrop_path, 'backdrop'),
    posterImage: getImageUrl(media.poster_path || media.backdrop_path, 'poster'),
    logoImage: pickLogo(media),
  }
}
