/**
 * A single streaming provider, and everything the app needs to know about it.
 *
 * This is the ONE place a provider is defined. Every list the app used to keep
 * by hand — STREAM_PROVIDERS (twice: tv and `_movie`), PROVIDER_NAMES,
 * PROVIDER_METADATA, PLAYER_MESSAGE_ORIGINS, PROVIDERS_REPORTING_PLAYBACK,
 * STREAMING_DOMAINS — is derived from this array below. Adding a provider used
 * to mean six edits here plus vercel.json, netlify.toml and the e2e spec, and
 * the lists silently drifted apart when one was missed.
 */
export interface StreamProvider {
  /** Stable key used as the value of the server dropdown and in saved progress. */
  id: string
  /** Label shown in the server dropdown. */
  name: string
  /** URL template with {tmdbId}/{season}/{episode} placeholders. */
  tv: string
  /** URL template with a {tmdbId} placeholder. */
  movie: string
  quality: string
  seekSupport: 'excellent' | 'good' | 'medium'
  description: string
  /**
   * Origins this player may post playback telemetry from. Several providers
   * redirect to a different origin than the iframe src (vidfast.pro ->
   * vidfast.vc, 111movies.net -> player.vidlove.cc), so the embed URL's own
   * origin is not a sufficient check on incoming messages. Empty means the
   * player is silent — see `reportsPlayback`.
   */
  messageOrigins?: string[]
  /**
   * True when this player reports playback telemetry (MEDIA_DATA /
   * PLAYER_EVENT) to the parent window. Only these can be watched for the
   * "iframe loaded but the stream never started" case: a provider that stays
   * silent would otherwise look permanently stalled.
   */
  reportsPlayback?: boolean
}

/**
 * Ordered as they appear in the server dropdown. The first entry is the default
 * every playback starts on; the rest are fallbacks the user can switch to.
 */
export const STREAM_PROVIDER_LIST: readonly StreamProvider[] = [
  {
    id: 'super111movies',
    name: 'Super 111movies',
    tv: 'https://111movies.net/tv/{tmdbId}/{season}/{episode}?autoplay=1&theme=23ddc36c',
    movie: 'https://111movies.net/movie/{tmdbId}?autoplay=1&theme=23ddc36c',
    quality: '🚫 Ads Free',
    seekSupport: 'excellent',
    description: 'Super 111movies — Ads free • Skip intro',
    // 111movies.net serves a 302 to player.vidlove.cc, so the iframe ends up there.
    messageOrigins: ['https://111movies.net', 'https://player.vidlove.cc'],
    reportsPlayback: true,
  },
  {
    id: 'vidsrc_me',
    name: 'Source 1 (vidsrc_me)',
    tv: 'https://vidsrc.me/embed/tv?tmdb={tmdbId}&season={season}&episode={episode}',
    movie: 'https://vidsrc.me/embed/movie?tmdb={tmdbId}',
    quality: '👑 Industry Standard',
    seekSupport: 'excellent',
    description: 'Massive library, highly reliable',
  },
  {
    id: 'vidlink_pro',
    name: 'Source 13 (vidlink_pro)',
    tv: 'https://vidlink.pro/tv/{tmdbId}/{season}/{episode}?primaryColor=ff4747&autoplay=true',
    movie: 'https://vidlink.pro/movie/{tmdbId}?primaryColor=ff4747&autoplay=true',
    quality: '⚡ Instant',
    seekSupport: 'excellent',
    description: 'Prism HD Stream',
    messageOrigins: ['https://vidlink.pro'],
    reportsPlayback: true,
  },
  {
    id: 'vidfast_pro',
    name: 'Source 14 (vidfast_pro)',
    tv: 'https://vidfast.pro/tv/{tmdbId}/{season}/{episode}?autoPlay=true',
    movie: 'https://vidfast.pro/movie/{tmdbId}?autoPlay=true',
    quality: '⚡ Ultra Fast',
    seekSupport: 'excellent',
    description: 'Lumina High-Speed',
    // vidfast.pro redirects to vidfast.vc.
    messageOrigins: ['https://vidfast.pro', 'https://vidfast.vc'],
    reportsPlayback: true,
  },
  {
    id: 'vidzee',
    name: 'Source 15 (vidzee)',
    tv: 'https://player.vidzee.wtf/embed/tv/{tmdbId}/{season}/{episode}',
    movie: 'https://player.vidzee.wtf/embed/movie/{tmdbId}',
    quality: '⚡ Ultra Fast',
    seekSupport: 'excellent',
    description: 'Lightning fast initial load',
    messageOrigins: ['https://player.vidzee.wtf'],
    reportsPlayback: true,
  },
  {
    id: 'videasy',
    name: 'Source 19 (videasy)',
    tv: 'https://player.videasy.to/tv/{tmdbId}/{season}/{episode}',
    movie: 'https://player.videasy.to/movie/{tmdbId}',
    quality: '✓ Smooth',
    seekSupport: 'medium',
    description: 'Horizon Versatile',
    messageOrigins: ['https://player.videasy.to'],
    reportsPlayback: true,
  },
  {
    id: 'obsidian',
    name: 'Source 20 (obsidian)',
    tv: 'https://vidrock.ru/tv/{tmdbId}/{season}/{episode}',
    movie: 'https://vidrock.ru/movie/{tmdbId}',
    quality: '⚡ Elite Quality',
    seekSupport: 'excellent',
    description: 'Obsidian Premium Stream',
  },
  {
    id: 'extra_2',
    name: 'Extra 2 (vidsrc.pm)',
    tv: 'https://vidsrc.pm/embed/tv?tmdb={tmdbId}&season={season}&episode={episode}',
    movie: 'https://vidsrc.pm/embed/movie?tmdb={tmdbId}',
    quality: '✓ Stable',
    seekSupport: 'good',
    description: 'VidSrc PM failover',
  },
  {
    id: 'extra_4',
    name: 'Extra 4 (flicky)',
    tv: 'https://flicky.host/embed/tv/?id={tmdbId}/{season}/{episode}',
    movie: 'https://flicky.host/embed/movie/?id={tmdbId}',
    quality: '⚡ Fast',
    seekSupport: 'excellent',
    description: 'Flicky host stream',
  },
] as const

/** Hostname of a template URL, for building the streaming-domain allowlist. */
function hostOf(template: string): string {
  return new URL(template.replace(/\{[^}]+\}/g, '1')).hostname
}

const uniq = <T,>(values: T[]): T[] => Array.from(new Set(values))

export const CONFIG = {
  // SECURITY: TMDB_API_KEY removed from frontend - all TMDB calls now go through backend proxy
  // The API key is stored securely in backend environment variables only
  TMDB_BASE_URL: 'https://api.themoviedb.org/3',
  IMG_BASE_URL: 'https://image.tmdb.org/t/p',
  IMG_SIZES: {
    // Responsive TMDB sizes to avoid multi-megabyte original assets on landing page
    poster: '/w342',
    hero: '/w1280',
    // Smaller sizes for cards/thumbnails
    backdrop: '/w780',
    thumbnail: '/w185',
    logo: '/w300',
  },

  /**
   * Multi-width srcSet breakpoints for each image category.
   * Keys are TMDB size paths; values are the display width in px.
   * Used by getImageSrcSet() in api.ts to build responsive srcSet attributes.
   */
  IMG_SRCSET_SIZES: {
    poster: [
      { tmdbSize: '/w185', displayW: 185 },
      { tmdbSize: '/w342', displayW: 342 },
      { tmdbSize: '/w500', displayW: 500 },
    ],
    backdrop: [
      { tmdbSize: '/w300', displayW: 300 },
      { tmdbSize: '/w780', displayW: 780 },
      { tmdbSize: '/w1280', displayW: 1280 },
    ],
    hero: [
      { tmdbSize: '/w780', displayW: 780 },
      { tmdbSize: '/w1280', displayW: 1280 },
    ],
    thumbnail: [
      { tmdbSize: '/w185', displayW: 185 },
    ],
    logo: [
      { tmdbSize: '/w185', displayW: 185 },
      { tmdbSize: '/w300', displayW: 300 },
    ],
  },

  /**
   * URL templates keyed the way buildEmbedUrl looks them up: `<id>` for tv and
   * `<id>_movie` for movies. Derived from STREAM_PROVIDER_LIST.
   */
  STREAM_PROVIDERS: Object.fromEntries(
    STREAM_PROVIDER_LIST.flatMap((p) => [
      [p.id, p.tv],
      [`${p.id}_movie`, p.movie],
    ])
  ) as Record<string, string>,

  /**
   * The server every playback starts on. Everything else in PROVIDER_NAMES is a
   * fallback the user can switch to from the server dropdown if this one fails.
   */
  DEFAULT_PROVIDER: STREAM_PROVIDER_LIST[0].id,

  PROVIDER_NAMES: Object.fromEntries(
    STREAM_PROVIDER_LIST.map((p) => [p.id, p.name])
  ) as Record<string, string>,

  PROVIDER_METADATA: Object.fromEntries(
    STREAM_PROVIDER_LIST.map((p) => [
      p.id,
      { quality: p.quality, seekSupport: p.seekSupport, description: p.description },
    ])
  ) as Record<string, { quality: string; seekSupport: string; description: string }>,

  /** Origins an embedded player is allowed to post playback telemetry from. */
  PLAYER_MESSAGE_ORIGINS: uniq(
    STREAM_PROVIDER_LIST.flatMap((p) => p.messageOrigins ?? [])
  ),

  /**
   * Providers whose player reports playback telemetry to the parent window.
   * Only these can be watched for the "iframe loaded but the stream never
   * started" case: the player renders its own shell and sits on a spinner while
   * it resolves a source, which the iframe `load` event cannot detect.
   */
  PROVIDERS_REPORTING_PLAYBACK: STREAM_PROVIDER_LIST
    .filter((p) => p.reportsPlayback)
    .map((p) => p.id),

  /** Every host an embed can legitimately land on, including post-redirect hosts. */
  STREAMING_DOMAINS: uniq([
    ...STREAM_PROVIDER_LIST.map((p) => hostOf(p.tv)),
    ...STREAM_PROVIDER_LIST.map((p) => hostOf(p.movie)),
    ...STREAM_PROVIDER_LIST.flatMap((p) =>
      (p.messageOrigins ?? []).map((o) => new URL(o).hostname)
    ),
  ]),

  /**
   * The `allow` attribute every player iframe must carry.
   *
   * Two rules these providers impose, both learned the hard way:
   *
   * 1. Each feature needs an explicit `*` allowlist, not the bare feature name.
   *    A bare `fullscreen` delegates only to the iframe's *original* src origin,
   *    and several providers redirect (vidfast.pro -> vidfast.vc,
   *    111movies.net -> player.vidlove.cc) or nest a second player frame. The
   *    redirected/nested document then falls outside the allowlist and Chrome
   *    logs "Permissions policy violation: fullscreen is not allowed in this
   *    document" — the player loads but the fullscreen button is dead.
   *
   * 2. It must not grant less than the document's own Permissions-Policy header
   *    (vercel.json / netlify.toml). Anything the document holds but the frame
   *    omits is silently dropped at the frame boundary.
   *
   * NOTE: deliberately no `sandbox` attribute. These players break under any
   * sandbox we can give them, so the frame runs with full privileges — which is
   * why the message-origin check in MovieDetailModal and the CSP frame-src
   * allowlist are the only things standing between the page and the provider.
   * Do not widen either without reason.
   */
  PLAYER_IFRAME_ALLOW: [
    'accelerometer *',
    'autoplay *',
    'clipboard-write *',
    'encrypted-media *',
    'gyroscope *',
    'picture-in-picture *',
    'fullscreen *',
  ].join('; '),

  /**
   * Referrer policy for player iframes. Providers verify the embedding domain
   * against their allowlist, so the request must carry an Origin-level
   * referrer — `no-referrer` gets the embed rejected outright.
   */
  PLAYER_IFRAME_REFERRER_POLICY: 'origin' as const,

  /**
   * CSP `frame-src` source list covering every provider host (plus wildcard
   * subdomains for redirect targets). Keep vercel.json / netlify.toml in step
   * with this — run `npm run gen:csp` to print the current value.
   */
  get CSP_FRAME_SRC(): string {
    return uniq(
      this.STREAMING_DOMAINS.flatMap((host: string) => {
        const bare = host.replace(/^(player|www)\./, '')
        return [`https://${host}`, `https://*.${bare}`]
      })
    ).join(' ')
  },
}

/* ONLY REQUIRED MODES */
export type MediaMode = 'home' | 'movie' | 'tv' | 'downloads' | 'documentary'

export interface Genre {
  id: number
  name: string
}

export interface Cast {
  id: number
  name: string
  character: string
  profile_path: string | null
}

export interface Crew {
  id: number
  name: string
  job: string
  department: string
  profile_path: string | null
}

export interface Media {
  id: number
  title?: string
  name?: string
  poster_path: string | null
  backdrop_path: string | null
  overview: string
  vote_average: number
  popularity?: number
  release_date?: string
  first_air_date?: string
  media_type?: string
  runtime?: number
  tagline?: string
  number_of_seasons?: number
  episode_run_time?: number[]
  genres?: Genre[]
  credits?: {
    cast: Cast[]
    crew: Crew[]
  }
  images?: {
    logos: { file_path: string; iso_639_1: string | null }[]
    backdrops: { file_path: string }[]
  }
  release_dates?: {
    results: {
      iso_3166_1: string
      release_dates: { certification: string }[]
    }[]
  }
  content_ratings?: {
    results: {
      iso_3166_1: string
      rating: string
    }[]
  }
}
