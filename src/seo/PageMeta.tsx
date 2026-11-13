/**
 * PageMeta — Reusable SEO head component for all standard pages.
 *
 * Usage:
 *   <PageMeta title="Favorites" noindex />
 *   <PageMeta title="Pricing" description="Choose a plan..." />
 */

import { SEO } from './constants'
import { absoluteUrl } from './text'
import { useDocumentHead } from './useDocumentHead'

interface PageMetaProps {
  /** Page title. " • StreamVault" is appended automatically. */
  title?: string
  /** Meta description for this page. Falls back to site default. */
  description?: string
  /** Open Graph image URL. Falls back to default og-image. */
  ogImage?: string
  /** Open Graph type. Defaults to "website". */
  ogType?: string
  /** If true, injects noindex,nofollow — use for private/error pages. */
  noindex?: boolean
  /** Canonical URL. Defaults to current page URL. */
  canonical?: string
}

export function PageMeta({
  title,
  description = SEO.SITE_DESCRIPTION,
  ogImage = SEO.DEFAULT_OG_IMAGE,
  ogType = 'website',
  noindex = false,
  canonical,
}: PageMetaProps) {
  const fullTitle = title
    ? `${title}${SEO.TITLE_SEPARATOR}${SEO.SITE_NAME}`
    : `${SEO.SITE_NAME} — Watch Movies, TV Shows & Anime`

  // Canonical is the production URL of this path — never the preview host,
  // and never with ?query or #hash, which would split one page into many.
  const resolvedCanonical =
    canonical ??
    (typeof window !== 'undefined'
      ? `${SEO.SITE_URL}${window.location.pathname.replace(/(.)\/+$/, '$1')}`
      : SEO.SITE_URL)
  const image = absoluteUrl(ogImage)

  useDocumentHead({
    title: fullTitle,
    meta: [
      { name: 'description', content: description },
      {
        name: 'robots',
        content: noindex ? 'noindex, nofollow' : 'index, follow, max-image-preview:large, max-snippet:-1, max-video-preview:-1',
      },
      { property: 'og:site_name', content: SEO.SITE_NAME },
      { property: 'og:locale', content: 'en_US' },
      { property: 'og:title', content: fullTitle },
      { property: 'og:description', content: description },
      { property: 'og:image', content: image },
      { property: 'og:image:alt', content: fullTitle },
      { property: 'og:url', content: resolvedCanonical },
      { property: 'og:type', content: ogType },
      { name: 'twitter:card', content: 'summary_large_image' },
      { name: 'twitter:title', content: fullTitle },
      { name: 'twitter:description', content: description },
      { name: 'twitter:image', content: image },
    ],
    links: [{ rel: 'canonical', href: resolvedCanonical }],
    // Who runs the site, and the site itself (index.html carries the same
    // site-level graph for non-JS crawlers). Only facts — made-up addresses,
    // phone numbers or social profiles are "misleading structured data" to
    // Google and can cost rich results.
    jsonLd: [
      {
        id: 'page',
        data: {
          '@context': 'https://schema.org',
          '@type': 'WebPage',
          '@id': `${resolvedCanonical}#webpage`,
          url: resolvedCanonical,
          name: fullTitle,
          description,
          isPartOf: { '@id': `${SEO.SITE_URL}/#website` },
          publisher: { '@id': `${SEO.SITE_URL}/#organization` },
          inLanguage: 'en',
        },
      },
    ],
  })

  return null
}
