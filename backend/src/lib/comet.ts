/**
 * Comet integration — github.com/g0ldyy/comet, a multi-indexer Stremio-style
 * torrent/debrid search addon (aggregates Jackett/Prowlarr/Torrentio/Zilean/
 * etc.).
 *
 * We use Comet purely as a broader search index than apibay: results are
 * matched by IMDb id (+ season/episode for series) instead of fuzzy title
 * text, so unlike apibay it can reliably tell a season pack from a single
 * episode. Any result carrying an `infoHash` gets merged into TorBox's own
 * cache-check / add / poll pipeline in torbox.ts — same as an apibay result,
 * so the rest of the app doesn't need to know which indexer a release came
 * from.
 *
 * We use the free public instance by default (COMET_BASE_URL overrides it
 * for a self-hosted one). It requires a real debrid account to return
 * anything — passing a debrid key is how "cachedOnly" style debrid search
 * addons work, most of them refuse plain torrent listing on shared public
 * instances to avoid abuse.
 */

const COMET_BASE_URL = process.env.COMET_BASE_URL || 'https://comet.elfhosted.com'
const TORBOX_KEY = process.env.TORBOX_API_KEY

export interface CometStream {
  name?: string
  description?: string
  title?: string
  url?: string
  infoHash?: string
  fileIdx?: number
  behaviorHints?: {
    filename?: string
    videoSize?: number
    /** "comet|<debrid service>|<info-hash>" */
    bingeGroup?: string
  }
}

interface CometResponse {
  streams?: CometStream[]
}

function buildConfig(): string {
  const config = {
    debridService: 'torbox',
    debridApiKey: TORBOX_KEY || '',
    // Ask for raw torrent entries (infoHash) alongside any debrid-resolved
    // ones — we drive downloading/polling ourselves via TorBox's own API
    // rather than relying on Comet's opaque resolved playback URLs.
    enableTorrent: true,
    cachedOnly: false,
  }
  return Buffer.from(JSON.stringify(config)).toString('base64')
}

/**
 * Query Comet for a movie or series episode by IMDb id.
 * Throws on network/HTTP failure — callers should treat this as best-effort
 * and not let it block a search that also has other sources (see
 * searchMediaTorrents in torbox.ts).
 */
export async function searchComet(
  imdbId: string,
  mediaType: 'movie' | 'series',
  season?: number,
  episode?: number
): Promise<CometStream[]> {
  if (!TORBOX_KEY) return []

  const mediaId =
    mediaType === 'series' && season != null && episode != null
      ? `${imdbId}:${season}:${episode}`
      : imdbId

  const b64config = encodeURIComponent(buildConfig())
  const url = `${COMET_BASE_URL}/${b64config}/stream/${mediaType}/${encodeURIComponent(mediaId)}.json`

  const res = await fetch(url, {
    headers: { 'User-Agent': 'StreamVault/1.0' },
    // Deliberately generous: this is how long the lookup may *run*, not how
    // long a user waits on it. searchMediaTorrents bounds the wait separately
    // and lets a slow lookup finish in the background so its result is cached
    // for the next request. (The public instance measured 3-16s uncached, so
    // the old 9s abort meant slow titles could never complete, let alone cache.)
    signal: AbortSignal.timeout(25_000),
  })

  if (!res.ok) {
    throw new Error(`Comet search failed: ${res.status}`)
  }

  const data = (await res.json()) as CometResponse
  return Array.isArray(data.streams) ? data.streams : []
}

/** Extract the seeder count Comet embeds in the description text ("👤 N"). */
function parseSeeders(stream: CometStream): number {
  const text = `${stream.name || ''} ${stream.description || stream.title || ''}`
  const match = text.match(/👤\s*(\d+)/)
  return match ? parseInt(match[1], 10) : 0
}

export interface CometTorrentCandidate {
  infoHash: string
  name: string
  size: number
  seeders: number
  /** Comet tagged this stream as already cached on the debrid service (⚡). A hint only — TorBox's own cache check is authoritative. */
  cachedHint: boolean
}

const INFO_HASH_RE = /^[a-fA-F0-9]{40}$/
const BINGE_GROUP_HASH_RE = /\|([a-fA-F0-9]{40})$/

/**
 * The torrent info-hash behind a Comet stream.
 *
 * With a debrid service configured, the public instance returns resolved
 * playback streams with no top-level `infoHash` at all (0 of 2,085 streams
 * for a popular movie, as of Sept 2026) — the hash only survives in
 * `behaviorHints.bingeGroup` as "comet|<service>|<hash>". Reading just
 * `infoHash` silently turned every Comet search into zero candidates.
 */
function streamInfoHash(stream: CometStream): string | null {
  if (typeof stream.infoHash === 'string' && INFO_HASH_RE.test(stream.infoHash)) {
    return stream.infoHash
  }
  return stream.behaviorHints?.bingeGroup?.match(BINGE_GROUP_HASH_RE)?.[1] ?? null
}

/** Release name for display and quality/audio parsing — the actual filename, not Comet's multi-line emoji description. */
function streamReleaseName(stream: CometStream): string {
  const firstDescriptionLine = (stream.description || stream.title || '')
    .split('\n')[0]
    .replace(/^📄\s*/u, '')
    .trim()
  return stream.behaviorHints?.filename || firstDescriptionLine || stream.name || 'Unknown release'
}

/**
 * The subset of Comet's results we can drive ourselves — anything we can
 * recover a torrent info-hash for (see streamInfoHash). Those get fed through
 * TorBox's own add / cache-check / poll pipeline rather than Comet's opaque
 * playback URLs.
 */
export function cometTorrentCandidates(streams: CometStream[]): CometTorrentCandidate[] {
  const candidates: CometTorrentCandidate[] = []
  for (const stream of streams) {
    const infoHash = streamInfoHash(stream)
    if (!infoHash) continue
    candidates.push({
      infoHash: infoHash.toUpperCase(),
      name: streamReleaseName(stream),
      size: stream.behaviorHints?.videoSize || 0,
      seeders: parseSeeders(stream),
      cachedHint: (stream.name || '').includes('⚡'),
    })
  }
  return candidates
}
