/**
 * Hermetic network policy for every e2e browser context.
 *
 * Nothing leaves the machine: the app's own origin is served by `vite
 * preview`, the backend by MockApi, and everything else is either a stand-in
 * or blocked —
 *   - TMDB images        → a generated SVG poster
 *   - media.e2e.test     → the sample video (with Range support, as a CDN would),
 *                          and Real-Debrid's converted (HLS) stream of it
 *   - embed iframes      → a stub page (streaming providers are third-party sites)
 *   - anything else      → aborted (analytics, fonts, trailers, ...)
 */

import { readdirSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import type { BrowserContext, Route } from '@playwright/test'
import { CONVERTED_SEGMENT_S } from './data'

const SAMPLE_VIDEO = readFileSync(fileURLToPath(new URL('./media/sample.webm', import.meta.url)))

/** The converted stream's init segment and 5-second media segments (VP9 + Opus fMP4). */
const CONVERTED_DIR = new URL('./media/converted/', import.meta.url)
const CONVERTED_FILES = new Map(
  readdirSync(fileURLToPath(CONVERTED_DIR)).map((name) => [name, readFileSync(fileURLToPath(new URL(name, CONVERTED_DIR)))])
)
const CONVERTED_SEGMENTS = [...CONVERTED_FILES.keys()].filter((name) => name.endsWith('.m4s')).length

const POSTER_SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="500" height="750" viewBox="0 0 500 750">
  <defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
    <stop offset="0" stop-color="#1e293b"/><stop offset="1" stop-color="#7c3aed"/>
  </linearGradient></defs>
  <rect width="500" height="750" fill="url(#g)"/>
  <circle cx="250" cy="300" r="120" fill="#f59e0b" opacity=".55"/>
</svg>`

export const EMBED_STUB_TEXT = 'Embed server stub'

const EMBED_STUB_HTML = `<!doctype html><html><body style="margin:0;display:grid;place-items:center;height:100vh;background:#111;color:#eee;font:16px sans-serif">${EMBED_STUB_TEXT}</body></html>`

function serveVideo(route: Route) {
  const range = route.request().headers()['range']
  const total = SAMPLE_VIDEO.length
  const match = range ? /bytes=(\d*)-(\d*)/.exec(range) : null
  if (!match) {
    return route.fulfill({
      status: 200,
      headers: { 'Content-Type': 'video/webm', 'Accept-Ranges': 'bytes', 'Content-Length': String(total) },
      body: SAMPLE_VIDEO,
    })
  }
  const start = match[1] ? Number(match[1]) : 0
  const end = match[2] ? Math.min(Number(match[2]), total - 1) : total - 1
  return route.fulfill({
    status: 206,
    headers: {
      'Content-Type': 'video/webm',
      'Accept-Ranges': 'bytes',
      'Content-Range': `bytes ${start}-${end}/${total}`,
      'Content-Length': String(end - start + 1),
    },
    body: SAMPLE_VIDEO.subarray(start, end + 1),
  })
}

/**
 * Real-Debrid's converted stream, as Real-Debrid serves it: `?t=<seconds>`
 * on the playlist starts it there, listing only the rest of the file.
 */
function serveConverted(route: Route, url: URL) {
  const name = url.pathname.slice('/converted/'.length)
  if (name === 'full.m3u8') {
    const first = Math.min(Math.floor(Number(url.searchParams.get('t') ?? 0) / CONVERTED_SEGMENT_S), CONVERTED_SEGMENTS - 1)
    const lines = [
      '#EXTM3U',
      '#EXT-X-VERSION:7',
      `#EXT-X-TARGETDURATION:${CONVERTED_SEGMENT_S}`,
      '#EXT-X-MEDIA-SEQUENCE:0',
      '#EXT-X-PLAYLIST-TYPE:VOD',
      '#EXT-X-MAP:URI="init.mp4"',
    ]
    for (let i = first; i < CONVERTED_SEGMENTS; i++) lines.push(`#EXTINF:${CONVERTED_SEGMENT_S}.000,`, `seg${i}.m4s`)
    lines.push('#EXT-X-ENDLIST', '')
    return route.fulfill({ status: 200, contentType: 'application/vnd.apple.mpegurl', body: lines.join('\n') })
  }
  const file = CONVERTED_FILES.get(name)
  if (!file) return route.fulfill({ status: 404, body: '' })
  return route.fulfill({ status: 200, contentType: 'video/mp4', body: file })
}

/**
 * Install the policy. Register it BEFORE MockApi.attach(): Playwright runs
 * the most recently registered matching route first, so the mock API wins
 * for its own origin and this catch-all handles the rest.
 */
export async function isolateNetwork(context: BrowserContext, appOrigin: string): Promise<void> {
  await context.route('**/*', (route) => {
    const request = route.request()
    const url = new URL(request.url())

    if (url.origin === appOrigin || url.protocol === 'data:' || url.protocol === 'blob:') return route.continue()
    if (url.hostname === 'image.tmdb.org') {
      return route.fulfill({ status: 200, contentType: 'image/svg+xml', body: POSTER_SVG })
    }
    if (url.hostname === 'media.e2e.test') {
      return url.pathname.startsWith('/converted/') ? serveConverted(route, url) : serveVideo(route)
    }

    const frame = request.frame()
    const isSubframeDocument = request.resourceType() === 'document' && frame.parentFrame() !== null
    if (isSubframeDocument) {
      return route.fulfill({ status: 200, contentType: 'text/html', body: EMBED_STUB_HTML })
    }

    return route.abort('blockedbyclient')
  })
}
