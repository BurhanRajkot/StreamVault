/**
 * JsonLd — Schema.org JSON-LD structured data components.
 *
 * Three named exports, each injecting a <script type="application/ld+json">
 * into the document <head> via useDocumentHead.
 *
 * ─ MovieJsonLd      → Schema.org Movie type (name, image, director, rating)
 * ─ BreadcrumbJsonLd → Home › section › title trail for search results
 * ─ VideoObjectJsonLd → Schema.org VideoObject (enables Google Video features)
 * ─ WatchActionJsonLd → potentialAction: WatchAction (tells Google this is a play page)
 *
 * Usage (typically in Watch.tsx, all three together):
 *   <MovieJsonLd media={media} mediaType="movie" />
 *   <VideoObjectJsonLd media={media} mediaType="movie" />
 *   <WatchActionJsonLd media={media} mediaType="movie" />
 */

import { useDocumentHead } from './useDocumentHead'
import { SEO } from './constants'
import type { Media } from '@/lib/config'
import { slugify } from '@/lib/utils'

interface JsonLdProps {
  media: Media
  mediaType: 'movie' | 'tv'
}

// ─── 1. Movie / TVSeries ──────────────────────────────────────────────────────

function watchPageUrl(media: Media, mediaType: 'movie' | 'tv'): string {
  const slug = slugify(media.title || media.name || '')
  return `${SEO.SITE_URL}/watch/${mediaType}/${media.id}${slug ? `-${slug}` : ''}`
}

export function MovieJsonLd({ media, mediaType }: JsonLdProps) {
  const title = media.title || media.name || 'Unknown Title'
  const date = media.release_date || media.first_air_date || ''
  const posterUrl = media.poster_path
    ? `${SEO.TMDB_POSTER_BASE}${media.poster_path}`
    : `${SEO.SITE_URL}${SEO.DEFAULT_OG_IMAGE}`
  const directors = (media.credits?.crew ?? []).filter((c) => c.job === 'Director').slice(0, 3)
  const actors = (media.credits?.cast ?? []).slice(0, 8)
  const genres = (media.genres ?? []).map((g) => g.name).filter(Boolean)

  const schema: Record<string, unknown> = {
    '@context': 'https://schema.org',
    '@type': mediaType === 'movie' ? 'Movie' : 'TVSeries',
    '@id': `${watchPageUrl(media, mediaType)}#title`,
    name: title,
    image: posterUrl,
    description: media.overview || '',
    url: watchPageUrl(media, mediaType),
    ...(date && (mediaType === 'movie' ? { datePublished: date } : { startDate: date })),
    ...(directors.length > 0 && {
      director: directors.map((d) => ({ '@type': 'Person', name: d.name })),
    }),
    ...(actors.length > 0 && {
      actor: actors.map((c) => ({ '@type': 'Person', name: c.name })),
    }),
    ...(mediaType === 'tv' && media.number_of_seasons && { numberOfSeasons: media.number_of_seasons }),
    // Only with real votes behind it — a 0-vote rating is invalid markup
    ...(media.vote_average && media.vote_count && media.vote_count > 0
      ? {
          aggregateRating: {
            '@type': 'AggregateRating',
            ratingValue: media.vote_average.toFixed(1),
            bestRating: '10',
            worstRating: '0',
            ratingCount: media.vote_count,
          },
        }
      : {}),
    ...(genres.length > 0 && { genre: genres }),
    ...(media.imdb_id || media.external_ids?.imdb_id
      ? { sameAs: [`https://www.imdb.com/title/${media.imdb_id || media.external_ids?.imdb_id}/`] }
      : {}),
  }

  useDocumentHead({ jsonLd: [{ id: 'title', data: schema }] })
  return null
}

// ─── 1b. Breadcrumbs ──────────────────────────────────────────────────────────
// Home › Movies (or TV Shows) › Title — shown in place of the bare URL in results.

export function BreadcrumbJsonLd({ media, mediaType }: JsonLdProps) {
  const title = media.title || media.name || 'Unknown Title'
  const section = mediaType === 'movie' ? { name: 'Movies', path: '/movies' } : { name: 'TV Shows', path: '/tv' }
  const schema = {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: [
      { '@type': 'ListItem', position: 1, name: 'Home', item: `${SEO.SITE_URL}/` },
      { '@type': 'ListItem', position: 2, name: section.name, item: `${SEO.SITE_URL}${section.path}` },
      { '@type': 'ListItem', position: 3, name: title, item: watchPageUrl(media, mediaType) },
    ],
  }

  useDocumentHead({ jsonLd: [{ id: 'breadcrumbs', data: schema }] })
  return null
}

// ─── 2. VideoObject ───────────────────────────────────────────────────────────

export function VideoObjectJsonLd({ media, mediaType }: JsonLdProps) {
  const title = media.title || media.name || 'Unknown Title'
  const thumbnailUrl = media.backdrop_path
    ? `${SEO.TMDB_BACKDROP_BASE}${media.backdrop_path}`
    : media.poster_path
    ? `${SEO.TMDB_POSTER_BASE}${media.poster_path}`
    : SEO.DEFAULT_OG_IMAGE

  const releaseDate = media.release_date || media.first_air_date
  const uploadDate = releaseDate ? `${releaseDate}T00:00:00Z` : new Date().toISOString()

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

  useDocumentHead({ jsonLd: [{ id: 'video', data: schema }] })
  return null
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

  useDocumentHead({ jsonLd: [{ id: 'watch-action', data: schema }] })
  return null
}
