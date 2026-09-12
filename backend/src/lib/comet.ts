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
    // searchMediaTorrents waits on this via Promise.allSettled alongside
    // apibay (8s timeout) — a slow/loaded public Comet instance shouldn't
    // stall the whole search for anywhere near 20s.
    signal: AbortSignal.timeout(9000),
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
}

/**
 * The subset of Comet's results we can drive ourselves — anything exposing a
 * raw info-hash. (Resolved debrid stream objects without one are skipped: we
 * have no way to poll their download progress, and TorBox's own cache-check
 * already tells us what's instantly playable.)
 */
export function cometTorrentCandidates(streams: CometStream[]): CometTorrentCandidate[] {
  return streams
    .filter(
      (s): s is CometStream & { infoHash: string } =>
        typeof s.infoHash === 'string' && /^[a-fA-F0-9]{40}$/.test(s.infoHash)
    )
    .map((s) => ({
      infoHash: s.infoHash.toUpperCase(),
      name: s.description || s.title || s.name || 'Unknown release',
      size: s.behaviorHints?.videoSize || 0,
      seeders: parseSeeders(s),
    }))
}
