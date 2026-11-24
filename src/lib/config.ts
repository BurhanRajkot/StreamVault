
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
   * stars in the night sky (Sol is the Sun). ⚡ Premium (Real-Debrid) sits last.
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
 * playback starts on; the rest are fallbacks the user can switch to. The app
 * offers only the first of these plus Premium (app/src/lib/servers.ts).
 *
 * Lineup and order come from a real-playback test on 2026-11-23/24: 21
 * servers played in headed Chromium, framed from the production origin, across
 * 11 titles (Fight Club, Sinners, 3 Idiots, Laapataa Ladies, Tokyo Story,
 * Breaking Bad, Severance S2, Panchayat, Frieren), reading the <video> element
 * itself (shadow DOM included) for start time, resolution, smoothness and seek
 * recovery. VidFast played all 11 in 1080p and starts fastest, so it leads.
 * Ids are kept for servers that stayed, so saved continue-watching rows still
 * resume on them.
 *
 * Dropped, with the reason, so they aren't re-added blind:
 * - embed.vidsrc.pk: 0 of 11 — never produced a picture
 * - vidcore.org, vidspark.to: wait on their own play button almost every
 *   time, missed Severance and Tokyo Story, and seek slowly (VidSpark up to 25s)
 * - cinemaos.tech, primesrc.me, vidplay.to, 2embed.cc, vidup.to: 0 plays
 * - embedwave.cc, vidapi.xyz, cinesrc.st: half or fewer, mostly 480p; vidapi
 *   opens 2–4 pop-ups per play; cinesrc has no TV
 * - player.videasy.net, vidking.net, vidsrc.xyz, zxcstream: don't resolve here
 * - vixsrc.to, mapple, multiembed.mov, moviesapi.to: Cloudflare challenge
 * - vidjoy.pro, embedmaster.link: redirect to ad pages
 * - earlier (2026-11-12): 111movies, nontongo, vidrock (scam-ad frame), vidsrc.pm
 */
export const STREAM_PROVIDER_LIST: readonly StreamProvider[] = [
  {
    // Default server since 2026-11-24 and the app's one embed server: 11 of 11
    // test titles, all 1080p, ~7s to a picture, autoplays. Also what hover
    // previews play — it must autoplay (see HoverVideoPlayer).
    id: 'vidfast_pro',
    name: 'Sirius',
    tv: 'https://vidfast.vc/tv/{tmdbId}/{season}/{episode}?autoPlay=true',
    movie: 'https://vidfast.vc/movie/{tmdbId}?autoPlay=true',
    quality: '1080p, 4K where available',
    badge: 'HD',
    seekSupport: 'excellent',
    description: 'VidFast — played all 11 test titles in 1080p, fastest to start',
    // vidfast.pro only redirects here; vidfast.domains lists .vc as current.
    messageOrigins: ['https://vidfast.vc'],
    reportsPlayback: true,
  },
  {
    // Vidy (vidy.st), the player behind movy.sx — up to 4K, its own quality /
    // location / audio / subtitle menus, and a public embed API (vidy.st →
    // Docs). It redirects vidy.st → www.vidy.st, so the templates point at www
    // directly. Flags: `color` is the accent (hex, no #), `autoplay=true`
    // starts with sound once a stream is found. It posts MEDIA_DATA about once
    // a second (JSON strings) while it plays. 10 of 11, but slower to start
    // (~10–13s) than VidFast, so it's second.
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
    // 11 of 11, 720p–1080p, the fewest pop-up ads of any server tested.
    id: 'vidsrc_sh',
    name: 'Canopus',
    tv: 'https://vidsrc.sh/embed/tv/{tmdbId}/{season}/{episode}',
    movie: 'https://vidsrc.sh/embed/movie/{tmdbId}',
    quality: '720p–1080p',
    seekSupport: 'excellent',
    description: 'VidSrc.sh — played all 11 test titles, fewest ads',
    messageOrigins: ['https://vidsrc.sh'],
    reportsPlayback: true,
  },
  {
    id: 'vidzee',
    name: 'Vega',
    tv: 'https://player.vidzee.wtf/embed/tv/{tmdbId}/{season}/{episode}',
    movie: 'https://player.vidzee.wtf/embed/movie/{tmdbId}',
    quality: '1080p',
    seekSupport: 'excellent',
    description: 'VidZee — played 10 of 11 test titles in 1080p',
    messageOrigins: ['https://player.vidzee.wtf'],
    reportsPlayback: true,
  },
  {
    // Often loads the title and then waits on its own play button.
    id: 'vidlink_pro',
    name: 'Arcturus',
    tv: 'https://vidlink.pro/tv/{tmdbId}/{season}/{episode}?autoplay=true',
    movie: 'https://vidlink.pro/movie/{tmdbId}?autoplay=true',
    quality: '1080p',
    seekSupport: 'excellent',
    description: 'VidLink — played 8 of 11 test titles; press play if it waits',
    messageOrigins: ['https://vidlink.pro'],
    reportsPlayback: true,
  },
  {
    // Rive's embed: 4K on some titles, few ads, but posts nothing to the parent,
    // so it stays out of reportsPlayback.
    id: 'rive',
    name: 'Capella',
    tv: 'https://www.rivestream.app/embed?type=tv&id={tmdbId}&season={season}&episode={episode}',
    movie: 'https://www.rivestream.app/embed?type=movie&id={tmdbId}',
    quality: '480p–4K',
    seekSupport: 'good',
    description: 'Rive — played 10 of 11 test titles, up to 4K',
  },
  {
    // No pop-ups at all in the test; posts MEDIA_DATA while it plays.
    id: 'viduki',
    name: 'Rigel',
    tv: 'https://www.viduki.net/1/tv/{tmdbId}/{season}/{episode}',
    movie: 'https://www.viduki.net/1/movie/{tmdbId}',
    quality: '720p–1080p',
    seekSupport: 'good',
    description: 'Viduki — played 9 of 11 test titles, no pop-ups',
    messageOrigins: ['https://www.viduki.net'],
    reportsPlayback: true,
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
   * What the hover (quick-view) preview plays: the default server (VidFast),
   * so the preview is the same picture Play opens. It autoplays; closing the
   * popup unmounts the frame, which stops the sound.
   */
  PREVIEW_PROVIDER: STREAM_PROVIDER_LIST[0].id,

  /** How long a pointer has to rest on a poster before its preview opens. */
  QUICK_VIEW_HOVER_DELAY_MS: 700,

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
export type MediaMode = 'home' | 'movie' | 'tv' | 'documentary' | 'anime'

/** Each browse tab has its own URL, so a tab can be linked, reloaded and reached with Back. */
export const MODE_PATHS: Record<MediaMode, string> = {
  home: '/',
  movie: '/movies',
  tv: '/tv',
  anime: '/anime',
  documentary: '/documentaries',
}

export function modeFromPath(pathname: string): MediaMode {
  const path = pathname.length > 1 ? pathname.replace(/\/+$/, '') : pathname
  const match = (Object.keys(MODE_PATHS) as MediaMode[]).find((mode) => MODE_PATHS[mode] === path)
  return match ?? 'home'
}

/** The site is free and open source — a star is the only ask. */
export const GITHUB_REPO_URL = 'https://github.com/dragon-manner/StreamVault'

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
  /** What it streams in — Premium's "4K/1080p", Sol's "4K", Sirius's "HD". */
  detail?: string
  /** Premium only: it won't play for this viewer (not the admin, not an approved account). */
  locked?: boolean
}

/**
 * Server dropdown options for a given mode. Real-Debrid is offered for movies
 * and TV — search is matched by IMDb id (+ season/episode for TV, via
 * Torrentio) rather than fuzzy title text, so season packs vs per-episode
 * releases aren't the reliability problem they'd be with title matching alone.
 *
 * It always comes last — Sirius (VidFast) first, then the rest, then Premium —
 * for everyone. Premium plays for the admin and for accounts the admin
 * approved (the backend enforces it); everyone else sees it with a lock.
 */
export function serverOptions(
  mode: MediaMode,
  { unlocked = false }: { unlocked?: boolean } = {}
): ServerOption[] {
  const providers: ServerOption[] = STREAM_PROVIDER_LIST.map(({ id, name, badge }) => ({
    id,
    name,
    detail: badge,
    label: badge ? `${name} (${badge})` : name,
  }))
  if (mode !== 'movie' && mode !== 'tv') return providers
  const premium: ServerOption = {
    id: DEBRID_SERVER_ID,
    name: 'Premium',
    detail: '4K/1080p',
    locked: !unlocked,
    label: unlocked ? 'Premium (4K/1080p)' : 'Premium (4K/1080p) · Invite only',
  }
  return [...providers, premium]
}

/**
 * The server a playback starts on when nothing picked one: the first in the
 * dropdown — Sirius (VidFast) everywhere.
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
  /** ISO 639-1, e.g. "hi" — what the film or show was made in. */
  original_language?: string
  /** ISO 3166-1 countries the film or show comes from (TMDB gives TV this; movies, `production_countries`). */
  origin_country?: string[]
  production_countries?: { iso_3166_1: string; name: string }[]
  /** The film series a movie belongs to (detail responses). */
  belongs_to_collection?: { id: number; name: string; poster_path: string | null; backdrop_path: string | null } | null
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
