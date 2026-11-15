// ─────────────────────────────────────────────────────────────────
// StreamVault — Central SEO Constants
// All SEO-related values live here. Update once, propagates everywhere.
// ─────────────────────────────────────────────────────────────────

export const SEO = {
  /** Production domain — must match Vercel deployment URL */
  SITE_URL: 'https://stream-vault.site',

  SITE_NAME: 'StreamVault',

  SITE_DESCRIPTION:
    'Watch movies, TV shows and anime online free on StreamVault — HD and 4K streaming, every season and episode, smart recommendations, no sign-up required.',

  AUTHOR: 'Piracy Is Not Stealing',

  /** The open-source repository — the site's one real profile elsewhere. */
  GITHUB_URL: 'https://github.com/dragon-manner/StreamVault',

  /** Default OG/Twitter card image shown when no movie poster is available */
  DEFAULT_OG_IMAGE: '/og-image.png',

  /** TMDB image CDN base for backdrop images (w1280 is ideal for og:image) */
  TMDB_BACKDROP_BASE: 'https://image.tmdb.org/t/p/w1280',

  /** TMDB image CDN base for poster images */
  TMDB_POSTER_BASE: 'https://image.tmdb.org/t/p/w500',

  /** Separator used in <title> tags: "Movie Name • StreamVault" */
  TITLE_SEPARATOR: ' • ',
} as const
