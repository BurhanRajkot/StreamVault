/**
 * Hermetic network policy for every e2e browser context.
 *
 * Nothing leaves the machine: the app's own origin is served by `vite
 * preview`, the backend by MockApi, and everything else is either a stand-in
 * or blocked —
 *   - TMDB images        → a generated SVG poster
 *   - media.e2e.test     → the sample video (with Range support, as a CDN would)
 *   - embed iframes      → a stub page (streaming providers are third-party sites)
 *   - anything else      → aborted (analytics, fonts, trailers, ...)
 */

import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import type { BrowserContext, Route } from '@playwright/test'

const SAMPLE_VIDEO = readFileSync(fileURLToPath(new URL('./media/sample.webm', import.meta.url)))

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
    if (url.hostname === 'media.e2e.test') return serveVideo(route)

    const frame = request.frame()
    const isSubframeDocument = request.resourceType() === 'document' && frame.parentFrame() !== null
    if (isSubframeDocument) {
      return route.fulfill({ status: 200, contentType: 'text/html', body: EMBED_STUB_HTML })
    }

    return route.abort('blockedbyclient')
  })
}
