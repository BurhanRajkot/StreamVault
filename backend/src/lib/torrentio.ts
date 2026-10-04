/**
 * Torrentio integration — torrentio.strem.fun, the Stremio-addon torrent
 * search index (aggregates YTS/EZTV/1337x/RARBG/TorrentGalaxy/TPB/etc.).
 *
 * Results are matched by IMDb id (+ season/episode for series) instead of
 * fuzzy title text, so unlike apibay it can reliably tell a season pack from
 * a single episode.
 *
 * Queried WITH the Real-Debrid key in the URL (Torrentio's `realdebrid=`
 * config). Real-Debrid retired its own cache-check endpoint
 * (/torrents/instantAvailability), so Torrentio's "[RD+]" tag — built from
 * what its users have already resolved — is the only cheap way to know which
 * releases will play instantly. In that mode Torrentio drops the bare
 * `infoHash` field and returns a `/resolve/realdebrid/<key>/<hash>/...` URL
 * instead; the hash and file index are parsed back out of it here, and the
 * URL itself (which carries the key) never leaves this module. Playback is
 * still resolved by our own backend against the Real-Debrid API — the
 * resolve URL is never called.
 *
 * Set TORRENTIO_DEBRID_CACHE=false to keep the key away from Torrentio; the
 * search then runs keyless and every release is reported as not cached.
 */

const TORRENTIO_BASE_URL = process.env.TORRENTIO_BASE_URL || 'https://torrentio.strem.fun'

export interface TorrentioStream {
  name?: string
  title?: string
  /** Present only in keyless mode. */
  infoHash?: string
  fileIdx?: number
  /** Present only in debrid mode: /resolve/realdebrid/<key>/<hash>/<cache>/<fileIdx>/<filename> */
  url?: string
  behaviorHints?: {
    filename?: string
    bingeGroup?: string
  }
}

interface TorrentioResponse {
  streams?: TorrentioStream[]
}

/**
 * Query Torrentio for a movie or series episode by IMDb id.
 * Throws on network/HTTP failure — callers should treat this as best-effort.
 *
 * @param debridKey - Real-Debrid API key; when given, results carry RD cache status.
 */
export async function searchTorrentio(
  imdbId: string,
  mediaType: 'movie' | 'series',
  season?: number,
  episode?: number,
  debridKey?: string
): Promise<TorrentioStream[]> {
  const mediaId =
    mediaType === 'series' && season != null && episode != null
      ? `${imdbId}:${season}:${episode}`
      : imdbId

  const config = debridKey ? `/realdebrid=${encodeURIComponent(debridKey)}` : ''
  const url = `${TORRENTIO_BASE_URL}${config}/stream/${mediaType}/${encodeURIComponent(mediaId)}.json`

  const res = await fetch(url, {
    headers: { 'User-Agent': 'StreamVault/1.0' },
    // Deliberately generous: this is how long the lookup may *run*, not how
    // long a user waits on it. searchMediaReleases bounds the wait separately
    // and lets a slow lookup finish in the background so its result is cached
    // for the next request.
    signal: AbortSignal.timeout(25_000),
  })

  if (!res.ok) {
    // Status only — the request URL carries the debrid key.
    throw new Error(`Torrentio search failed: ${res.status}`)
  }

  const data = (await res.json()) as TorrentioResponse
  return Array.isArray(data.streams) ? data.streams : []
}

/** Extract the seeder count Torrentio embeds in the title text ("👤 N"). */
function parseSeeders(stream: TorrentioStream): number {
  const text = `${stream.name || ''} ${stream.title || ''}`
  const match = text.match(/👤\s*(\d+)/)
  return match ? parseInt(match[1], 10) : 0
}

const SIZE_UNITS: Record<string, number> = {
  B: 1,
  KB: 1024,
  MB: 1024 ** 2,
  GB: 1024 ** 3,
  TB: 1024 ** 4,
}

/** Extract the release size Torrentio embeds in the title text ("💾 12.34 GB"). */
function parseSize(stream: TorrentioStream): number {
  const text = stream.title || ''
  const match = text.match(/💾\s*([\d.]+)\s*(B|KB|MB|GB|TB)/)
  if (!match) return 0
  const unit = SIZE_UNITS[match[2]]
  return unit ? Math.round(parseFloat(match[1]) * unit) : 0
}

export interface TorrentioTorrentCandidate {
  infoHash: string
  name: string
  /** The video file Torrentio matched inside the torrent, when it says. */
  fileName?: string
  /** Index of that file in the torrent's file list, when known. */
  fileIdx?: number
  size: number
  seeders: number
  /** True when Torrentio tags the release "[RD+]" (instantly available on Real-Debrid). */
  cached: boolean
}

const INFO_HASH_RE = /^[a-fA-F0-9]{40}$/
const RESOLVE_URL_RE = /\/resolve\/[^/]+\/[^/]+\/([a-fA-F0-9]{40})\/[^/]*\/(\d+)\//

/**
 * Release name for display and quality/audio parsing — the torrent's own name
 * (first title line), which carries resolution/codec tags even when the file
 * inside is just "Movie (2010).mkv". Falls back to the filename.
 */
function streamReleaseName(stream: TorrentioStream): string {
  const firstTitleLine = (stream.title || '').split('\n')[0].trim()
  return firstTitleLine || stream.behaviorHints?.filename || stream.name || 'Unknown release'
}

/** Info-hash + file index from either result shape (keyless `infoHash`, or the debrid resolve URL). */
function streamTorrentRef(stream: TorrentioStream): { infoHash: string; fileIdx?: number } | null {
  if (typeof stream.infoHash === 'string' && INFO_HASH_RE.test(stream.infoHash)) {
    return { infoHash: stream.infoHash, fileIdx: typeof stream.fileIdx === 'number' ? stream.fileIdx : undefined }
  }
  const match = typeof stream.url === 'string' ? stream.url.match(RESOLVE_URL_RE) : null
  if (!match) return null
  return { infoHash: match[1], fileIdx: parseInt(match[2], 10) }
}

/** Every Torrentio result we can drive ourselves through the Real-Debrid API. */
export function torrentioTorrentCandidates(streams: TorrentioStream[]): TorrentioTorrentCandidate[] {
  const candidates: TorrentioTorrentCandidate[] = []
  for (const stream of streams) {
    const ref = streamTorrentRef(stream)
    if (!ref) continue
    candidates.push({
      infoHash: ref.infoHash.toUpperCase(),
      name: streamReleaseName(stream),
      fileName: stream.behaviorHints?.filename,
      fileIdx: ref.fileIdx,
      size: parseSize(stream),
      seeders: parseSeeders(stream),
      cached: /\[RD\+\]/.test(stream.name || ''),
    })
  }
  return candidates
}
