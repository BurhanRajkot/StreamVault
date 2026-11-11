/**
 * Magnet links — how downloads are offered: the viewer's own torrent app
 * fetches the release from the people sharing it, so Real-Debrid (one
 * account, one connection at a time) is never involved.
 */

/**
 * Public trackers named in every link. A torrent app finds the release
 * through DHT alone too, but trackers find people sharing it much faster.
 */
const TRACKERS = [
  'udp://tracker.opentrackr.org:1337/announce',
  'udp://open.demonii.com:1337/announce',
  'udp://open.stealth.si:80/announce',
  'udp://tracker.torrent.eu.org:451/announce',
  'udp://exodus.desync.com:6969/announce',
  'udp://explodie.org:6969/announce',
]

/** A BitTorrent v1 info-hash: 40 hex digits, or 32 base32 characters. */
const INFO_HASH_RE = /^(?:[0-9a-f]{40}|[a-z2-7]{32})$/i

/** The magnet link for a release, or null when `infoHash` isn't one. */
export function magnetLink(infoHash: string, name?: string): string | null {
  const hash = infoHash.trim()
  if (!INFO_HASH_RE.test(hash)) return null
  const params = [`xt=urn:btih:${hash.length === 40 ? hash.toLowerCase() : hash.toUpperCase()}`]
  if (name?.trim()) params.push(`dn=${encodeURIComponent(name.trim())}`)
  for (const tracker of TRACKERS) params.push(`tr=${encodeURIComponent(tracker)}`)
  return `magnet:?${params.join('&')}`
}
