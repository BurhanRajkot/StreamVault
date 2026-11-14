/**
 * Real-Debrid direct links, moved to the download server nearest the viewer.
 *
 * Real-Debrid picks a link's download server by the address that asked for
 * the link: our backend. So every viewer was handed a server in its main
 * (Amsterdam) data centre, wherever they were. Real-Debrid also answers
 * every request with `Connection: close`, so the start (three requests in
 * a row), every seek and every seek-bar preview frame opens a new connection
 * to that server. Measured from India (2026-11-10), per seek: 1.9s median
 * there, up to 17s; 1.0s on Real-Debrid's Mumbai server.
 *
 * Its regional servers serve any download, byte for byte, as
 * `/d/<full download id>/<file>` (the id with its host suffix; the main
 * data centre's own links drop that). Which one is nearest is measured, not
 * guessed: every server has a speedtest file that allows cross-origin reads,
 * and a 4 KB range of it answers in ~60 ms from next door, ~600 ms from
 * another continent. The answer is kept for a few hours per browser.
 *
 * Only the direct link moves. Real-Debrid's HLS transcode is served from
 * the main data centre only.
 */

import type { DebridReadyPlayback } from './debridApi'

/** Real-Debrid's regional download servers, as listed on its speedtest page (real-debrid.com/speedtest). */
export const REAL_DEBRID_EDGES = ['mum1', 'sgp1', 'sgpo1', 'sgpl1', 'kul1', 'hkg1', 'tyo1', 'lax1', 'tlv1', 'rbx'] as const

/** A main-data-centre server, timed as the stand-in for the one a link comes with. */
const MAIN_SERVER = '45'

const DOWNLOAD_DOMAIN = '.download.real-debrid.com'
const STORAGE_KEY = 'sv:rd-edge'
/** How long a measurement is trusted. Long enough to cover an evening; short enough for a laptop that moved. */
const MEASUREMENT_TTL_MS = 6 * 60 * 60_000
/** A server that hasn't answered by now isn't the nearest. */
const PROBE_TIMEOUT_MS = 4000
/** Rounds of probes: the first also pays for the DNS lookup. The best round counts. */
const PROBE_ROUNDS = 2
/**
 * How much faster a regional server must answer before a link is moved to
 * it: it fetches from the main data centre itself, so it's only worth it
 * when it's clearly closer.
 */
const EDGE_MIN_SPEEDUP = 0.6
const EDGE_MIN_GAIN_MS = 100

export type EdgeChoice = (typeof REAL_DEBRID_EDGES)[number] | null

interface Measurement {
  /** The regional server to use, or null to keep the main data centre's. */
  edge: EdgeChoice
  at: number
}

/** Whether `url` is a Real-Debrid download link (not its HLS transcode, not anything else). */
export function isRealDebridDownloadUrl(url: string): boolean {
  try {
    const { protocol, hostname, pathname } = new URL(url)
    return protocol === 'https:' && hostname.endsWith(DOWNLOAD_DOMAIN) && pathname.startsWith('/d/')
  } catch {
    return false
  }
}

/**
 * The download's full id (with its host suffix), which every regional server
 * accepts. From the backend; failing that, from the link itself, or from the
 * transcode link, which carries the full id too (`/t/<id>/...`).
 */
export function fullDownloadId(playback: Pick<DebridReadyPlayback, 'directUrl' | 'hls' | 'downloadId'>): string | null {
  if (playback.downloadId && /^[A-Z0-9]{14,}$/i.test(playback.downloadId)) return playback.downloadId
  let pathId: string | undefined
  try {
    pathId = new URL(playback.directUrl).pathname.split('/')[2]
  } catch {
    return null
  }
  if (!pathId) return null
  if (pathId.length > 13) return pathId
  const transcodeId = playback.hls?.match(/\/t\/([A-Z0-9]+)\//i)?.[1]
  return transcodeId && transcodeId.length > pathId.length && transcodeId.startsWith(pathId) ? transcodeId : null
}

/** The same download on regional server `edge`. Null when the link isn't one Real-Debrid's regional servers can serve. */
export function edgeDownloadUrl(directUrl: string, downloadId: string, edge: string): string | null {
  if (!isRealDebridDownloadUrl(directUrl)) return null
  const url = new URL(directUrl)
  const [, , , ...rest] = url.pathname.split('/') // '', 'd', <id>, <file name...>
  if (rest.length === 0) return null
  // An IPv4-only host ("44-4") gets the regional server's IPv4-only name ("mum1-4") too.
  const ipv4Only = url.hostname.split('.')[0].endsWith('-4')
  url.hostname = `${edge}${ipv4Only ? '-4' : ''}${DOWNLOAD_DOMAIN}`
  url.pathname = ['', 'd', downloadId, ...rest].join('/')
  return url.href
}

/**
 * Pick from probe times (ms; Infinity = no answer): the fastest regional
 * server when it's clearly faster than the main data centre, else null.
 */
export function chooseEdge(main: number, edges: Partial<Record<string, number>>): EdgeChoice {
  let best: EdgeChoice = null
  let bestMs = Infinity
  for (const edge of REAL_DEBRID_EDGES) {
    const ms = edges[edge] ?? Infinity
    if (ms < bestMs) {
      best = edge
      bestMs = ms
    }
  }
  if (best === null || !Number.isFinite(bestMs)) return null
  if (!Number.isFinite(main)) return best
  return bestMs <= main * EDGE_MIN_SPEEDUP && main - bestMs >= EDGE_MIN_GAIN_MS ? best : null
}

function readMeasurement(): Measurement | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as Partial<Measurement>
    if (typeof parsed.at !== 'number' || Date.now() - parsed.at > MEASUREMENT_TTL_MS) return null
    const edge = parsed.edge ?? null
    if (edge !== null && !(REAL_DEBRID_EDGES as readonly string[]).includes(edge)) return null
    return { edge, at: parsed.at }
  } catch {
    return null
  }
}

function writeMeasurement(m: Measurement): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(m))
  } catch {
    // Private mode / storage full: it's measured again next time.
  }
}

/** Time to the first answer for 4 KB of `server`'s speedtest file, in ms (Infinity when it doesn't answer). */
async function timeServer(server: string): Promise<number> {
  const file = server === MAIN_SERVER ? 'testDefault.rar' : 'test.rar'
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), PROBE_TIMEOUT_MS)
  const start = performance.now()
  try {
    // A plain range is CORS-safelisted (no preflight); the file allows any origin.
    const res = await fetch(`https://${server}${DOWNLOAD_DOMAIN}/speedtest/${file}`, {
      headers: { Range: 'bytes=0-4095' },
      cache: 'no-store',
      credentials: 'omit',
      signal: ctrl.signal,
    })
    const ms = performance.now() - start
    return res.ok ? ms : Infinity
  } catch {
    return Infinity
  } finally {
    clearTimeout(timer)
    ctrl.abort() // the 4 KB, or whatever's left of the file should a server ignore the range
  }
}

async function measure(): Promise<EdgeChoice> {
  const servers = [MAIN_SERVER, ...REAL_DEBRID_EDGES]
  const best = new Map<string, number>()
  for (let round = 0; round < PROBE_ROUNDS; round++) {
    const times = await Promise.all(servers.map(timeServer))
    servers.forEach((s, i) => best.set(s, Math.min(best.get(s) ?? Infinity, times[i])))
  }
  const main = best.get(MAIN_SERVER) ?? Infinity
  const edge = chooseEdge(main, Object.fromEntries(best))
  // Nothing answered at all — offline, or something in the way: don't remember that.
  if ([...best.values()].some(Number.isFinite)) writeMeasurement({ edge, at: Date.now() })
  return edge
}

let inFlight: Promise<EdgeChoice> | null = null

/** The regional server to use (null: keep the main data centre's), measured now unless known. Never rejects. */
export function nearestEdge(): Promise<EdgeChoice> {
  const known = readMeasurement()
  if (known) return Promise.resolve(known.edge)
  if (typeof window === 'undefined' || typeof fetch !== 'function') return Promise.resolve(null)
  if (!inFlight) {
    inFlight = measure()
      .catch(() => null)
      .finally(() => {
        inFlight = null
      })
  }
  return inFlight
}

/** Start measuring ahead of a Premium play, so the answer is in by the time a link is. */
export function warmNearestEdge(): void {
  void nearestEdge()
}

/** The measured answer, if there is one yet: undefined while unknown. */
export function knownEdge(): EdgeChoice | undefined {
  return readMeasurement()?.edge
}

/** Forget the measurement — the server it picked failed. */
export function forgetEdge(): void {
  try {
    localStorage.removeItem(STORAGE_KEY)
  } catch {
    // nothing to forget
  }
}

/** The ready file's direct link on the nearest regional server — null to use it as Real-Debrid gave it. */
export function nearestDirectUrl(playback: DebridReadyPlayback, edge: EdgeChoice | undefined): string | null {
  if (!edge) return null
  const id = fullDownloadId(playback)
  if (!id) return null
  return edgeDownloadUrl(playback.directUrl, id, edge)
}
