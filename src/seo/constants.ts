// ─────────────────────────────────────────────────────────────────
// StreamVault — Central SEO Constants
// All SEO-related values live here. Update once, propagates everywhere.
// ─────────────────────────────────────────────────────────────────

export const SEO = {
  /** Production domain — must match Vercel deployment URL */
  SITE_URL: 'https://stream-vault-7u6q.vercel.app',

  SITE_NAME: 'StreamVault',

  SITE_DESCRIPTION:
    'StreamVault is your ultimate destination to watch movies, TV shows, and anime online for free. Enjoy high-quality streaming with no sign-up required.',

  /** Default OG/Twitter card image shown when no movie poster is available */
  DEFAULT_OG_IMAGE: '/og-image.png',

  /** TMDB image CDN base for backdrop images (w1280 is ideal for og:image) */
  TMDB_BACKDROP_BASE: 'https://image.tmdb.org/t/p/w1280',

  /** TMDB image CDN base for poster images */
  TMDB_POSTER_BASE: 'https://image.tmdb.org/t/p/w500',

  /** Twitter handle (without @) */
  TWITTER_HANDLE: 'streamvault',

  /** Separator used in <title> tags: "Movie Name • StreamVault" */
  TITLE_SEPARATOR: ' • ',
} as const
