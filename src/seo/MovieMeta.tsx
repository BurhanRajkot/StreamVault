/**
 * MovieMeta — Dynamic SEO head component for the Watch page.
 *
 * Generates per-movie title, OG image (poster), description, and
 * canonical URL so that shared links show rich previews, and Google
 * can correctly categorise the page as a video/movie entity.
 *
 * Usage (in Watch.tsx):
 *   <MovieMeta media={media} mediaType="movie" />
 */

import { Helmet } from 'react-helmet-async'
import { SEO } from './constants'
import type { Media } from '@/lib/config'
import { slugify } from '@/lib/utils'

interface MovieMetaProps {
  media: Media
  mediaType: 'movie' | 'tv'
}

export function MovieMeta({ media, mediaType }: MovieMetaProps) {
  const title = media.title || media.name || 'Unknown Title'
  const year = (media.release_date || media.first_air_date || '').split('-')[0]
  const description =
    media.overview ||
    `Watch ${title} on StreamVault — stream instantly for free.`

  // Page title: "Predator: Badlands (2025) • StreamVault"
  const fullTitle = year
    ? `${title} (${year})${SEO.TITLE_SEPARATOR}${SEO.SITE_NAME}`
    : `${title}${SEO.TITLE_SEPARATOR}${SEO.SITE_NAME}`

  // OG image — prefer backdrop (wide format), fall back to poster, then default
  const ogImage = media.backdrop_path
    ? `${SEO.TMDB_BACKDROP_BASE}${media.backdrop_path}`
    : media.poster_path
    ? `${SEO.TMDB_POSTER_BASE}${media.poster_path}`
    : SEO.DEFAULT_OG_IMAGE

  // Canonical URL for this specific watch page
  const canonical = `${SEO.SITE_URL}/watch/${mediaType}/${media.id}-${slugify(title)}`

  // og:type differs for movies vs TV episodes
  const ogType = mediaType === 'movie' ? 'video.movie' : 'video.episode'

  return (
    <Helmet>
      <title>{fullTitle}</title>
      <meta name="description" content={description} />
      <meta name="robots" content="index, follow" />

      {/* Canonical */}
      <link rel="canonical" href={canonical} />

      {/* Open Graph */}
      <meta property="og:site_name" content={SEO.SITE_NAME} />
      <meta property="og:title" content={fullTitle} />
      <meta property="og:description" content={description} />
      <meta property="og:image" content={ogImage} />
      <meta property="og:image:width" content="1280" />
      <meta property="og:image:height" content="720" />
      <meta property="og:url" content={canonical} />
      <meta property="og:type" content={ogType} />

      {/* Twitter Card */}
      <meta name="twitter:card" content="summary_large_image" />
      <meta name="twitter:site" content={`@${SEO.TWITTER_HANDLE}`} />
      <meta name="twitter:title" content={fullTitle} />
      <meta name="twitter:description" content={description} />
      <meta name="twitter:image" content={ogImage} />
    </Helmet>
  )
}
