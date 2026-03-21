/**
 * PageMeta — Reusable SEO head component for all standard pages.
 *
 * Usage:
 *   <PageMeta title="Favorites" noindex />
 *   <PageMeta title="Pricing" description="Choose a plan..." />
 */

import { Helmet } from 'react-helmet-async'
import { SEO } from './constants'

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

  // Resolve canonical dynamically so og:url always matches the real page URL.
  const resolvedCanonical =
    canonical ?? (typeof window !== 'undefined' ? window.location.href : SEO.SITE_URL)

  return (
    <Helmet>
      <title>{fullTitle}</title>
      <meta name="description" content={description} />

      {/* Indexing control */}
      {noindex ? (
        <meta name="robots" content="noindex, nofollow" />
      ) : (
        <meta name="robots" content="index, follow" />
      )}

      {/* Canonical */}
      <link rel="canonical" href={resolvedCanonical} />

      {/* Open Graph */}
      <meta property="og:site_name" content={SEO.SITE_NAME} />
      <meta property="og:title" content={fullTitle} />
      <meta property="og:description" content={description} />
      <meta property="og:image" content={ogImage} />
      <meta property="og:url" content={resolvedCanonical} />
      <meta property="og:type" content={ogType} />

      {/* Twitter Card */}
      <meta name="twitter:card" content="summary_large_image" />
      <meta name="twitter:site" content={`@${SEO.TWITTER_HANDLE}`} />
      <meta name="twitter:title" content={fullTitle} />
      <meta name="twitter:description" content={description} />
      <meta name="twitter:image" content={ogImage} />

      {/* JSON-LD Schema Markup */}
      <script type="application/ld+json">
        {JSON.stringify({
          "@context": "https://schema.org",
          "@graph": [
            {
              "@type": "Organization",
              "@id": `${SEO.SITE_URL}/#organization`,
              "name": SEO.SITE_NAME,
              "url": SEO.SITE_URL,
              "logo": {
                "@type": "ImageObject",
                "url": `${SEO.SITE_URL}/og-image.png`
              },
              "sameAs": [
                "https://facebook.com/streamvault",
                "https://instagram.com/streamvault",
                "https://linkedin.com/company/streamvault",
                "https://youtube.com/c/streamvault",
                `https://twitter.com/${SEO.TWITTER_HANDLE}`
              ],
              "contactPoint": {
                "@type": "ContactPoint",
                "telephone": "+1-555-123-4567",
                "contactType": "customer service"
              },
              "address": {
                "@type": "PostalAddress",
                "streetAddress": "123 Streaming Blvd, Suite 400",
                "addressLocality": "Los Angeles",
                "addressRegion": "CA",
                "postalCode": "90028",
                "addressCountry": "US"
              }
            },
            {
              "@type": "WebSite",
              "@id": `${SEO.SITE_URL}/#website`,
              "url": SEO.SITE_URL,
              "name": SEO.SITE_NAME,
              "publisher": {
                "@id": `${SEO.SITE_URL}/#organization`
              }
            }
          ]
        })}
      </script>
    </Helmet>
  )
}
