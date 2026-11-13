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

import { SEO } from './constants'
import type { Media } from '@/lib/config'
import { slugify } from '@/lib/utils'
import { clampDescription } from './text'
import { useDocumentHead } from './useDocumentHead'

interface MovieMetaProps {
  media: Media
  mediaType: 'movie' | 'tv'
}

export function MovieMeta({ media, mediaType }: MovieMetaProps) {
  const title = media.title || media.name || 'Unknown Title'
  const year = (media.release_date || media.first_air_date || '').split('-')[0]
  const kind = mediaType === 'movie' ? 'movie' : 'TV series'
  const named = year ? `${title} (${year})` : title

  // What people type: "watch <title> online free". The title tag leads with it.
  const fullTitle = `Watch ${named} Online Free in HD${SEO.TITLE_SEPARATOR}${SEO.SITE_NAME}`
  const lead =
    mediaType === 'tv' && media.number_of_seasons
      ? `Watch ${named} online free — all ${media.number_of_seasons} season${media.number_of_seasons === 1 ? '' : 's'} in HD on StreamVault.`
      : `Watch ${named} online free in HD on StreamVault.`
  const description = clampDescription(media.overview ? `${lead} ${media.overview}` : `${lead} Stream the full ${kind} instantly, no sign-up.`)

  // OG image — prefer backdrop (wide format), fall back to poster, then default
  const ogImage = media.backdrop_path
    ? `${SEO.TMDB_BACKDROP_BASE}${media.backdrop_path}`
    : media.poster_path
    ? `${SEO.TMDB_POSTER_BASE}${media.poster_path}`
    : `${SEO.SITE_URL}${SEO.DEFAULT_OG_IMAGE}`

  // Canonical URL for this specific watch page
  const slug = slugify(title)
  const canonical = `${SEO.SITE_URL}/watch/${mediaType}/${media.id}${slug ? `-${slug}` : ''}`

  const ogType = mediaType === 'movie' ? 'video.movie' : 'video.tv_show'
  const genres = (media.genres ?? []).map((g) => g.name).filter(Boolean)

  useDocumentHead({
    title: fullTitle,
    meta: [
      { name: 'description', content: description },
      { name: 'robots', content: 'index, follow, max-image-preview:large, max-snippet:-1, max-video-preview:-1' },
      { name: 'keywords', content: [`watch ${title}`, `${title} online free`, `${title} streaming`, ...genres].join(', ') },
      { property: 'og:site_name', content: SEO.SITE_NAME },
      { property: 'og:locale', content: 'en_US' },
      { property: 'og:title', content: fullTitle },
      { property: 'og:description', content: description },
      { property: 'og:image', content: ogImage },
      { property: 'og:image:alt', content: `${named} — ${kind}` },
      { property: 'og:url', content: canonical },
      { property: 'og:type', content: ogType },
      ...(mediaType === 'movie' && media.release_date ? [{ property: 'video:release_date', content: media.release_date }] : []),
      { name: 'twitter:card', content: 'summary_large_image' },
      { name: 'twitter:title', content: fullTitle },
      { name: 'twitter:description', content: description },
      { name: 'twitter:image', content: ogImage },
    ],
    links: [{ rel: 'canonical', href: canonical }],
    jsonLd: [
      {
        id: 'page',
        data: {
          '@context': 'https://schema.org',
          '@type': 'WebPage',
          '@id': `${canonical}#webpage`,
          url: canonical,
          name: fullTitle,
          description,
          isPartOf: { '@id': `${SEO.SITE_URL}/#website` },
          inLanguage: 'en',
        },
      },
    ],
  })

  return null
}
