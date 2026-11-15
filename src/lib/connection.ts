/**
 * How fast this viewer's connection is, in kbit/s — so the Premium player can
 * start a release the connection can carry, and be patient with a slow one
 * instead of taking it for a dead one.
 *
 * Measured, not guessed: a short timed download from the Real-Debrid server
 * the film itself will come from (its speedtest file allows cross-origin
 * reads — see lib/debridHost). It runs while the release is being found, so
 * it costs no time; on a fast line it's over in a fraction of a second, on a
 * slow one it stops after a few seconds with whatever arrived.
 *
 * The browser's own figure (navigator.connection) only stands in when that
 * download couldn't be made, and only when the browser itself calls the
 * connection slow: Chrome caps the figure at 10 Mbit/s and reports its
 * defaults until it has seen traffic, so "fast" from it says nothing.
 *
 * The player also reports what it sees while a film stalls (noteThroughput),
 * which the next film or episode then starts from.
 */

import { nearestEdge, speedtestUrl } from './debridHost'

/** How much of the speedtest file is asked for: ~0.2s on a fast line. */
const PROBE_BYTES = 1_500_000
/** The download stops here, with whatever has arrived. */
const PROBE_MAX_MS = 3000
/** Less than this, in less than MIN_SAMPLE_MS, is too little to judge a connection by. */
const MIN_SAMPLE_BYTES = 64_000
const MIN_SAMPLE_MS = 1000
/** How long a figure is trusted: a phone leaves the Wi-Fi, a download ends. */
const ESTIMATE_TTL_MS = 10 * 60_000

/** kbit/s for `bytes` arriving over `ms` — null when that's too little to say. */
export function throughputKbps(bytes: number, ms: number): number | null {
  if (!(bytes > 0) || !(ms > 0)) return null
  if (bytes < MIN_SAMPLE_BYTES && ms < MIN_SAMPLE_MS) return null
  return Math.max(1, Math.round((bytes * 8) / ms))
}

/** The parts of the Network Information API used here (Chromium only). */
export interface NetworkHint {
  effectiveType?: string
  /** Mbit/s. */
  downlink?: number
  saveData?: boolean
}

/**
 * What the browser says about the connection, in kbit/s — only when it calls
 * it slow ("3g" and below: under ~0.7 Mbit/s, or a long round trip).
 */
export function browserHintKbps(hint: NetworkHint | null | undefined): number | null {
  if (!hint || !hint.effectiveType || hint.effectiveType === '4g') return null
  if (typeof hint.downlink === 'number' && hint.downlink > 0) return Math.round(hint.downlink * 1000)
  switch (hint.effectiveType) {
    case 'slow-2g':
      return 50
    case '2g':
      return 70
    case '3g':
      return 700
    default:
      return null
  }
}

function browserHint(): NetworkHint | null {
  if (typeof navigator === 'undefined') return null
  return (navigator as Navigator & { connection?: NetworkHint }).connection ?? null
}

/** Time a download of the start of `server`'s speedtest file. Null when it couldn't be made. */
async function measureThroughput(server: string | null): Promise<number | null> {
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), PROBE_MAX_MS)
  let bytes = 0
  let firstBytes = 0
  let firstAt = 0
  let lastAt = 0
  try {
    // A plain range is CORS-safelisted (no preflight); the file allows any origin.
    const res = await fetch(speedtestUrl(server), {
      headers: { Range: `bytes=0-${PROBE_BYTES - 1}` },
      cache: 'no-store',
      credentials: 'omit',
      signal: ctrl.signal,
    })
    if (!res.ok || !res.body) return null
    const reader = res.body.getReader()
    for (;;) {
      const { done, value } = await reader.read()
      if (done) break
      lastAt = performance.now()
      bytes += value.byteLength
      if (!firstAt) {
        firstAt = lastAt
        firstBytes = bytes
      }
      // A server that ignores the range would send all 10 GB.
      if (bytes >= PROBE_BYTES) break
    }
  } catch {
    // Stopped at the deadline, or the connection failed: judge by what arrived.
  } finally {
    clearTimeout(timer)
    ctrl.abort()
  }
  // From the first bytes to the last: the time to connect says how far the
  // server is, not how much the line carries.
  return throughputKbps(bytes - firstBytes, lastAt - firstAt)
}

let latest: { kbps: number; at: number } | null = null
let inFlight: Promise<number | null> | null = null

/** What's known about the connection right now, in kbit/s — null when nothing recent is. */
export function knownThroughput(): number | null {
  if (latest && Date.now() - latest.at <= ESTIMATE_TTL_MS) return latest.kbps
  return browserHintKbps(browserHint())
}

/** The player saw the connection deliver this much (while a film stalled). */
export function noteThroughput(kbps: number): void {
  if (kbps > 0 && Number.isFinite(kbps)) latest = { kbps: Math.round(kbps), at: Date.now() }
}

/** Forget what was measured (tests). */
export function resetThroughput(): void {
  latest = null
  inFlight = null
}

/**
 * The connection's speed in kbit/s: what's known, else measured now. Null
 * when it can't be told (the download was blocked, or nothing arrived).
 * Never rejects.
 */
export function estimateConnection(): Promise<number | null> {
  if (latest && Date.now() - latest.at <= ESTIMATE_TTL_MS) return Promise.resolve(latest.kbps)
  if (typeof window === 'undefined' || typeof fetch !== 'function') return Promise.resolve(null)
  if (!inFlight) {
    inFlight = nearestEdge()
      .then((edge) => measureThroughput(edge))
      .then((kbps) => {
        if (kbps !== null) noteThroughput(kbps)
        return kbps ?? browserHintKbps(browserHint())
      })
      .catch(() => browserHintKbps(browserHint()))
      .finally(() => {
        inFlight = null
      })
  }
  return inFlight
}
