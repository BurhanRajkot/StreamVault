import { PREMIUM_PAUSED } from './premiumPause'

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
  /**
   * Label shown in the server dropdown. Servers are named after the brightest
   * stars in the night sky, brightest first (Sirius, Canopus, Arcturus, ...),
   * so the brightest name is the best-tested server; Sol (the Sun, brighter
   * than all of them) is Vidy, on top. ⚡ Premium (Real-Debrid) sits last.
   * The provider itself only shows in `id` and the URLs.
   */
  name: string
  /** URL template with {tmdbId}/{season}/{episode} placeholders. */
  tv: string
  /** URL template with a {tmdbId} placeholder. */
  movie: string
  quality: string
  /** A short tag drawn beside the name in the server list ("4K"). */
  badge?: string
  seekSupport: 'excellent' | 'good' | 'medium'
  description: string
  /**
   * Origins this player may post playback telemetry from. A provider can
   * redirect to a different origin than the iframe src (vidfast.pro ->
   * vidfast.vc), so the embed URL's own origin is not a sufficient check on
   * incoming messages. Any redirect target must be listed here too, so it
   * lands in STREAMING_DOMAINS and the CSP frame-src. Empty means the player
   * is silent — see `reportsPlayback`.
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
 * Ordered as they appear in the server dropdown, above ⚡ Premium, which sits
 * last (see serverOptions). The first entry is the default server — what every
 * playback starts on; the rest are fallbacks the user can switch to.
 *
 * Lineup and order come from a real-playback test on 2026-11-12: each server
 * played in Chrome, framed from the production origin, across nine titles
 * (Fight Club, Sinners, Breaking Bad, Severance, Frieren, Tokyo Story,
 * 3 Idiots, Laapataa Ladies, Panchayat), reading the <video> element itself
 * for start time, resolution and seek recovery. Ids are kept for servers that
 * stayed, so saved continue-watching rows still resume on them.
 *
 * Dropped then, with the reason, so they aren't re-added blind:
 * - 111movies.net now redirects to player.vidmario.net (outside our CSP) and
 *   sat on "FETCHING MEDIA" for every title
 * - player.videasy.to serves a self-signed DDoS-Guard certificate
 * - vidsrc.pm answers 404 on its embed paths
 * - nontongo.win shows a details page whose Play button does nothing
 * - vidrock.to / vidrock.net: the first click turns the frame into a
 *   full-page scam ad
 * - vidup.to is on VidFast's CDN but failed 3 of 9 titles, so it adds no cover
 */
export const STREAM_PROVIDER_LIST: readonly StreamProvider[] = [
  {
    // Default server since 2026-11-13: Vidy (vidy.st) is the embed player
    // behind movy.sx — up to 4K, its own quality / location / audio /
    // subtitle menus, and a public embed API (vidy.st → Docs). It redirects
    // vidy.st → www.vidy.st, so the templates point at www directly. Flags:
    // `color` is the accent (hex, no #), `autoplay=true` starts with sound once
    // a stream is found. It posts MEDIA_DATA about once a second (JSON
    // strings) while it plays, so the stall watchdog can use it.
    id: 'vidy',
    name: 'Sol',
    tv: 'https://www.vidy.st/tv/{tmdbId}/{season}/{episode}?autoplay=true&color=2563EB',
    movie: 'https://www.vidy.st/movie/{tmdbId}?autoplay=true&color=2563EB',
    quality: '4K, 1080p',
    badge: '4K',
    seekSupport: 'excellent',
    description: 'Vidy — up to 4K, pick quality, location, audio and subtitles in the player',
    messageOrigins: ['https://www.vidy.st'],
    reportsPlayback: true,
  },
  {
    // What hover previews use — it must autoplay (see HoverVideoPlayer).
    id: 'vidfast_pro',
    name: 'Sirius',
    tv: 'https://vidfast.vc/tv/{tmdbId}/{season}/{episode}?autoPlay=true',
    movie: 'https://vidfast.vc/movie/{tmdbId}?autoPlay=true',
    quality: '1080p, 4K where available',
    seekSupport: 'excellent',
    description: 'VidFast — played all 9 test titles in 1080p',
    // vidfast.pro only redirects here; vidfast.domains lists .vc as current.
    messageOrigins: ['https://vidfast.vc'],
    reportsPlayback: true,
  },
  {
    id: 'vidspark',
    name: 'Canopus',
    tv: 'https://vidspark.to/tv/{tmdbId}/{season}/{episode}',
    movie: 'https://vidspark.to/movie/{tmdbId}',
    quality: '1080p',
    seekSupport: 'excellent',
    description: 'VidSpark — played all 9 test titles, 7 in 1080p',
    // Never autoplays (no URL flag for it): it waits on its own play button,
    // so it stays out of reportsPlayback — the stall watchdog would otherwise
    // tell a viewer who simply hasn't pressed play yet that it's stuck.
  },
  {
    id: 'vidlink_pro',
    name: 'Arcturus',
    tv: 'https://vidlink.pro/tv/{tmdbId}/{season}/{episode}?autoplay=true',
    movie: 'https://vidlink.pro/movie/{tmdbId}?autoplay=true',
    quality: '1080p',
    seekSupport: 'excellent',
    description: 'VidLink — played 8 of 9 test titles, 6 in 1080p',
    messageOrigins: ['https://vidlink.pro'],
    reportsPlayback: true,
  },
  {
    // Slow to start on some titles, but it played on every run on the live site.
    id: 'vidzee',
    name: 'Vega',
    tv: 'https://player.vidzee.wtf/embed/tv/{tmdbId}/{season}/{episode}',
    movie: 'https://player.vidzee.wtf/embed/movie/{tmdbId}',
    quality: '480p–1080p',
    seekSupport: 'good',
    description: 'VidZee — played all 9 test titles; quality varies',
    messageOrigins: ['https://player.vidzee.wtf'],
    reportsPlayback: true,
  },
  {
    // Quickest to start when it plays, but in 5 of 17 runs on the built and
    // live app it sat at 00:00 with its player showing "playing".
    id: 'vidsrc_pk',
    name: 'Capella',
    tv: 'https://embed.vidsrc.pk/tv/{tmdbId}/{season}/{episode}',
    movie: 'https://embed.vidsrc.pk/movie/{tmdbId}',
    quality: '720p–1080p',
    seekSupport: 'good',
    description: 'VidSrc.pk — quickest to start, played 8 of 9 test titles',
  },
  {
    id: 'vidcore',
    name: 'Rigel',
    tv: 'https://vidcore.org/embed/tv/{tmdbId}/{season}/{episode}',
    movie: 'https://vidcore.org/embed/movie/{tmdbId}',
    quality: '480p–1080p',
    seekSupport: 'good',
    description: 'VidCore — last resort, played 8 of 9 test titles',
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
   * The default embed server — what every playback starts on (see
   * defaultServer); everything else in PROVIDER_NAMES is a fallback the user
   * can switch to from the server dropdown.
   */
  DEFAULT_PROVIDER: STREAM_PROVIDER_LIST[0].id,

  /**
   * What the quick-view preview plays. Not the default server: Vidy starts
   * with sound and never falls back to muted, which a preview must not do.
   */
  PREVIEW_PROVIDER: 'vidfast_pro',

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
   *    and providers redirect (vidfast.pro -> vidfast.vc) or nest a second
   *    player frame (vidspark.to -> cdn.vidspark.to). The
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
export type MediaMode = 'home' | 'movie' | 'tv' | 'downloads' | 'documentary' | 'anime'

/** Each browse tab has its own URL, so a tab can be linked, reloaded and reached with Back. */
export const MODE_PATHS: Record<MediaMode, string> = {
  home: '/',
  movie: '/movies',
  tv: '/tv',
  anime: '/anime',
  documentary: '/documentaries',
  downloads: '/downloads',
}

export function modeFromPath(pathname: string): MediaMode {
  const path = pathname.length > 1 ? pathname.replace(/\/+$/, '') : pathname
  const match = (Object.keys(MODE_PATHS) as MediaMode[]).find((mode) => MODE_PATHS[mode] === path)
  return match ?? 'home'
}

/**
 * Server id for Real-Debrid playback, handled entirely client-side (see
 * DebridPlayerPane) rather than via an embed-provider iframe. Kept out of
 * STREAM_PROVIDER_LIST since it has no tv/movie URL template.
 */
export const DEBRID_SERVER_ID = 'debrid'

/** The id Real-Debrid's server had while it was TorBox — still in saved continue-watching rows. */
export const LEGACY_TORBOX_SERVER_ID = 'torbox'

/** One entry in the server dropdown. */
export interface ServerOption {
  id: string
  /** "Premium", "Sirius" */
  name: string
  /** The whole entry as plain text, for places that can't style parts of it (a native <select>). */
  label: string
  /** What it streams in — Premium's "4K/1080p", Sol's "4K". */
  detail?: string
  /** Premium only: free for everyone right now. */
  free?: boolean
  /** Premium only: not working right now (PREMIUM_PAUSED). Still listed, last. */
  unavailable?: boolean
}

/**
 * Server dropdown options for a given mode. Real-Debrid is offered for movies
 * and TV — search is matched by IMDb id (+ season/episode for TV, via
 * Torrentio) rather than fuzzy title text, so season packs vs per-episode
 * releases aren't the reliability problem they'd be with title matching alone.
 * It comes last (2026-11-13): Sol (Vidy) first, then the stars, then Premium.
 */
export function serverOptions(
  mode: MediaMode,
  { debridFree = false }: { debridFree?: boolean } = {}
): ServerOption[] {
  const providers: ServerOption[] = STREAM_PROVIDER_LIST.map(({ id, name, badge }) => ({
    id,
    name,
    detail: badge,
    label: badge ? `${name} (${badge})` : name,
  }))
  if (mode !== 'movie' && mode !== 'tv') return providers
  const free = debridFree && !PREMIUM_PAUSED
  const premium: ServerOption = {
    id: DEBRID_SERVER_ID,
    name: 'Premium',
    detail: '4K/1080p',
    free,
    unavailable: PREMIUM_PAUSED,
    label: PREMIUM_PAUSED ? 'Premium (4K/1080p) · Paused' : free ? 'Premium (4K/1080p) · Free' : 'Premium (4K/1080p)',
  }
  return [...providers, premium]
}

/**
 * The server a playback starts on when nothing picked one: the first in the
 * dropdown — Sol (Vidy) everywhere.
 */
export function defaultServer(mode: MediaMode): string {
  return serverOptions(mode)[0].id
}

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
  vote_count?: number
  popularity?: number
  release_date?: string
  first_air_date?: string
  media_type?: string
  runtime?: number
  tagline?: string
  number_of_seasons?: number
  episode_run_time?: number[]
  /** Present on movie detail responses directly; TV needs `external_ids` appended. */
  imdb_id?: string | null
  external_ids?: { imdb_id?: string | null }
  /** Full genre objects — returned by the detail endpoints. */
  genres?: Genre[]
  /** Bare genre ids — what the list endpoints (discover/search/trending) return instead. */
  genre_ids?: number[]
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
  /** Appended to the detail responses (`append_to_response=similar`). */
  similar?: { results: Media[] }
}
