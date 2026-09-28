/**
 * Torrentio integration — torrentio.strem.fun, the Stremio-addon torrent
 * search index (aggregates YTS/EZTV/1337x/RARBG/TorrentGalaxy/TPB/etc.).
 *
 * Replaces Comet in the same role: a broader, more precisely-matched search
 * index than apibay. Results are matched by IMDb id (+ season/episode for
 * series) instead of fuzzy title text, so unlike apibay it can reliably tell
 * a season pack from a single episode. Any result carrying an `infoHash`
 * gets merged into TorBox's own cache-check / add / poll pipeline in
 * torbox.ts — same as an apibay result, so the rest of the app doesn't need
 * to know which indexer a release came from.
 *
 * Deliberately queried with NO debrid config in the URL (no TorBox key sent
 * to Torrentio, unlike the old Comet setup): pointing Torrentio at a debrid
 * account switches it into "resolved playback" mode, which (a) strips the
 * info-hash from every result — recoverable from Comet's bingeGroup, but
 * Torrentio's bingeGroup format doesn't carry it — and (b) drops every
 * candidate Torrentio hasn't itself already cache-checked against TorBox,
 * which would mean funneling every stream through an extra
 * torrentio.strem.fun hop and losing the large unchecked candidate pool our
 * own tier-balanced cache check (searchMediaTorrents below) depends on.
 * Plain search is free and public — no key required. TorBox's own API
 * (torboxFetch, same TORBOX_API_KEY as everywhere else) is what actually
 * checks cache status and resolves playback, exactly as it does for apibay
 * results — this is the same division Stremio itself uses under the hood
 * (a scraper addon for search, the debrid account for resolution), just
 * without routing playback through the addon's own server.
 */

const TORRENTIO_BASE_URL = process.env.TORRENTIO_BASE_URL || 'https://torrentio.strem.fun'

export interface TorrentioStream {
  name?: string
  title?: string
  infoHash?: string
  fileIdx?: number
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
 * Throws on network/HTTP failure — callers should treat this as best-effort
 * and not let it block a search that also has other sources (see
 * searchMediaTorrents in torbox.ts).
 */
export async function searchTorrentio(
  imdbId: string,
  mediaType: 'movie' | 'series',
  season?: number,
  episode?: number
): Promise<TorrentioStream[]> {
  const mediaId =
    mediaType === 'series' && season != null && episode != null
      ? `${imdbId}:${season}:${episode}`
      : imdbId

  const url = `${TORRENTIO_BASE_URL}/stream/${mediaType}/${encodeURIComponent(mediaId)}.json`

  const res = await fetch(url, {
    headers: { 'User-Agent': 'StreamVault/1.0' },
    // Deliberately generous: this is how long the lookup may *run*, not how
    // long a user waits on it. searchMediaTorrents bounds the wait separately
    // and lets a slow lookup finish in the background so its result is cached
    // for the next request.
    signal: AbortSignal.timeout(25_000),
  })

  if (!res.ok) {
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
  size: number
  seeders: number
}

const INFO_HASH_RE = /^[a-fA-F0-9]{40}$/

/** Release name for display and quality/audio parsing — the actual filename, not Torrentio's multi-line title block. */
function streamReleaseName(stream: TorrentioStream): string {
  const firstTitleLine = (stream.title || '').split('\n')[0].trim()
  return stream.behaviorHints?.filename || firstTitleLine || stream.name || 'Unknown release'
}

/**
 * The subset of Torrentio's results we can drive ourselves — anything
 * carrying a torrent info-hash. Those get fed through TorBox's own add /
 * cache-check / poll pipeline.
 */
export function torrentioTorrentCandidates(streams: TorrentioStream[]): TorrentioTorrentCandidate[] {
  const candidates: TorrentioTorrentCandidate[] = []
  for (const stream of streams) {
    if (typeof stream.infoHash !== 'string' || !INFO_HASH_RE.test(stream.infoHash)) continue
    candidates.push({
      infoHash: stream.infoHash.toUpperCase(),
      name: streamReleaseName(stream),
      size: parseSize(stream),
      seeders: parseSeeders(stream),
    })
  }
  return candidates
}
