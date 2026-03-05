/**
 * JsonLd — Schema.org JSON-LD structured data components.
 *
 * Three named exports, each injecting a <script type="application/ld+json">
 * into the document <head> via react-helmet-async.
 *
 * ─ MovieJsonLd      → Schema.org Movie type (name, image, director, rating)
 * ─ VideoObjectJsonLd → Schema.org VideoObject (enables Google Video features)
 * ─ WatchActionJsonLd → potentialAction: WatchAction (tells Google this is a play page)
 *
 * Usage (typically in Watch.tsx, all three together):
 *   <MovieJsonLd media={media} mediaType="movie" />
 *   <VideoObjectJsonLd media={media} mediaType="movie" />
 *   <WatchActionJsonLd media={media} mediaType="movie" />
 */

import { Helmet } from 'react-helmet-async'
import { SEO } from './constants'
import type { Media } from '@/lib/config'
import { slugify } from '@/lib/utils'

interface JsonLdProps {
  media: Media
  mediaType: 'movie' | 'tv'
}

// ─── 1. Movie / TVSeries ──────────────────────────────────────────────────────

export function MovieJsonLd({ media, mediaType }: JsonLdProps) {
  const title = media.title || media.name || 'Unknown Title'
  const year = (media.release_date || media.first_air_date || '').split('-')[0]
  const posterUrl = media.poster_path
    ? `${SEO.TMDB_POSTER_BASE}${media.poster_path}`
    : SEO.DEFAULT_OG_IMAGE
  const director = media.credits?.crew?.find((c: any) => c.job === 'Director')?.name

  const schema: Record<string, unknown> = {
    '@context': 'https://schema.org',
    '@type': mediaType === 'movie' ? 'Movie' : 'TVSeries',
    name: title,
    image: posterUrl,
    description: media.overview || '',
    url: `${SEO.SITE_URL}/watch/${mediaType}/${media.id}-${slugify(title)}`,
    ...(year && { dateCreated: year }),
    ...(director && {
      director: {
        '@type': 'Person',
        name: director,
      },
    }),
    ...(media.vote_average && {
      aggregateRating: {
        '@type': 'AggregateRating',
        ratingValue: media.vote_average.toFixed(1),
        bestRating: '10',
        worstRating: '0',
        ratingCount: (media as any).vote_count ?? 1,
      },
    }),
    ...(media.genres && {
      genre: media.genres.map((g: any) => g.name),
    }),
  }

  return (
    <Helmet>
      <script type="application/ld+json">{JSON.stringify(schema)}</script>
    </Helmet>
  )
}

// ─── 2. VideoObject ───────────────────────────────────────────────────────────

export function VideoObjectJsonLd({ media, mediaType }: JsonLdProps) {
  const title = media.title || media.name || 'Unknown Title'
  const thumbnailUrl = media.backdrop_path
    ? `${SEO.TMDB_BACKDROP_BASE}${media.backdrop_path}`
    : media.poster_path
    ? `${SEO.TMDB_POSTER_BASE}${media.poster_path}`
    : SEO.DEFAULT_OG_IMAGE

  const uploadDate =
    media.release_date || media.first_air_date || new Date().toISOString().split('T')[0]

  const embedUrl = `${SEO.SITE_URL}/watch/${mediaType}/${media.id}-${slugify(title)}`

  const schema = {
    '@context': 'https://schema.org',
    '@type': 'VideoObject',
    name: title,
    description: media.overview || `Watch ${title} on StreamVault.`,
    thumbnailUrl,
    uploadDate,
    embedUrl,
  }

  return (
    <Helmet>
      <script type="application/ld+json">{JSON.stringify(schema)}</script>
    </Helmet>
  )
}

// ─── 3. WatchAction ──────────────────────────────────────────────────────────
// Tells Google "this page has a play button" — enables Watch rich results.

export function WatchActionJsonLd({ media, mediaType }: JsonLdProps) {
  const title = media.title || media.name || 'Unknown Title'
  const watchUrl = `${SEO.SITE_URL}/watch/${mediaType}/${media.id}-${slugify(title)}`

  const schema = {
    '@context': 'https://schema.org',
    '@type': mediaType === 'movie' ? 'Movie' : 'TVSeries',
    name: title,
    url: watchUrl,
    potentialAction: {
      '@type': 'WatchAction',
      target: [
        {
          '@type': 'EntryPoint',
          urlTemplate: watchUrl,
          inLanguage: 'en',
          actionPlatform: [
            'http://schema.org/DesktopWebPlatform',
            'http://schema.org/MobileWebPlatform',
          ],
        },
      ],
      actionAccessibilityRequirement: {
        '@type': 'ActionAccessSpecification',
        category: 'free',
        availabilityStarts: '2024-01-01T00:00:00Z',
        availabilityEnds: '2030-01-01T00:00:00Z',
        eligibleRegion: {
          '@type': 'Country',
          name: 'IN',
        },
      },
    },
  }

  return (
    <Helmet>
      <script type="application/ld+json">{JSON.stringify(schema)}</script>
    </Helmet>
  )
}
