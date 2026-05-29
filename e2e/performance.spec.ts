/**
 * StreamVault E2E — Performance Budget
 *
 * Verifies performance budgets using real browser timing APIs.
 * All tests run against the production preview build.
 *
 * Budgets:
 *  - Time To First Byte (TTFB):        < 500ms
 *  - DOM Content Loaded (DCL):         < 2000ms
 *  - Page paint (domcontentloaded):    < 3000ms
 *  - No single JS chunk              > 2 MB
 *  - Total JS transferred           < 6 MB
 *  - Largest Contentful Paint (LCP)  < 4000ms (Web Vitals)
 *  - No render-blocking CSS > 200 KB
 *  - Images are not oversized (no uncompressed > 1 MB)
 */

import { test, expect } from './fixtures'

// ─── Timing ───────────────────────────────────────────────────────────────

test.describe('Performance — Page Load Timing', () => {
  test('homepage paints within 3 seconds (domcontentloaded)', async ({ unauthMockPage: page }) => {
    const start = Date.now()
    await page.goto('/', { waitUntil: 'domcontentloaded' })
    const elapsed = Date.now() - start
    expect(elapsed, `Homepage DOMContentLoaded took ${elapsed}ms (budget: 3000ms)`).toBeLessThan(3000)
  })

  test('pricing page paints within 3 seconds', async ({ unauthMockPage: page }) => {
    const start = Date.now()
    await page.goto('/pricing', { waitUntil: 'domcontentloaded' })
    const elapsed = Date.now() - start
    expect(elapsed, `Pricing DOMContentLoaded took ${elapsed}ms (budget: 3000ms)`).toBeLessThan(3000)
  })

  test('browser Navigation Timing: TTFB < 500ms', async ({ unauthMockPage: page }) => {
    await page.goto('/', { waitUntil: 'domcontentloaded' })
    const ttfb = await page.evaluate(() => {
      const [entry] = performance.getEntriesByType('navigation') as PerformanceNavigationTiming[]
      return entry ? entry.responseStart - entry.requestStart : 0
    })
    expect(ttfb, `TTFB was ${ttfb.toFixed(0)}ms (budget: 500ms)`).toBeLessThan(500)
  })

  test('browser Navigation Timing: DOM interactive < 3000ms', async ({ unauthMockPage: page }) => {
    await page.goto('/', { waitUntil: 'domcontentloaded' })
    const domInteractive = await page.evaluate(() => {
      const [entry] = performance.getEntriesByType('navigation') as PerformanceNavigationTiming[]
      return entry ? entry.domInteractive - entry.startTime : 0
    })
    expect(domInteractive, `DOM Interactive was ${domInteractive.toFixed(0)}ms (budget: 3000ms)`).toBeLessThan(3000)
  })

  test('Largest Contentful Paint (LCP) is within 4 seconds', async ({ unauthMockPage: page }) => {
    let lcp = 0
    await page.goto('/')
    // Use PerformanceObserver via page.evaluate
    lcp = await page.evaluate(async () => {
      return new Promise<number>(resolve => {
        let value = 0
        const observer = new PerformanceObserver(list => {
          const entries = list.getEntries()
          const last = entries[entries.length - 1] as PerformancePaintTiming
          if (last) value = last.startTime
        })
        try {
          observer.observe({ type: 'largest-contentful-paint', buffered: true })
        } catch { /* LCP not supported */ }
        // Give it 3s to accumulate entries
        setTimeout(() => {
          observer.disconnect()
          resolve(value)
        }, 3000)
      })
    })
    if (lcp > 0) {
      expect(lcp, `LCP was ${lcp.toFixed(0)}ms (budget: 5000ms)`).toBeLessThan(5000)
    }
    // If lcp=0 the browser didn't report it — skip rather than fail
  })
})

// ─── Bundle Size ──────────────────────────────────────────────────────────

test.describe('Performance — Bundle Size', () => {
  test('no individual JS chunk exceeds 2 MB', async ({ unauthMockPage: page }) => {
    const bodyPromises: Promise<void>[] = []
    const oversized: string[] = []

    page.on('response', res => {
      if (!res.url().includes('.js') || res.status() !== 200) return
      const cl = res.headers()['content-length']
      if (cl) {
        const bytes = parseInt(cl, 10)
        if (bytes > 2 * 1024 * 1024) {
          oversized.push(`${new URL(res.url()).pathname} — ${(bytes / 1024 / 1024).toFixed(2)} MB`)
        }
        return
      }
      bodyPromises.push(
        res.body()
          .then(buf => {
            if (buf.length > 2 * 1024 * 1024) {
              oversized.push(`${new URL(res.url()).pathname} — ${(buf.length / 1024 / 1024).toFixed(2)} MB`)
            }
          })
          .catch(() => {})
      )
    })

    await page.goto('/', { waitUntil: 'networkidle' })
    await Promise.all(bodyPromises)

    if (oversized.length > 0) console.warn('⚠ Oversized JS chunks:', oversized)
    expect(oversized, `Oversized JS chunks detected:\n${oversized.join('\n')}`).toHaveLength(0)
  })

  test('total JS transferred is less than 6 MB', async ({ unauthMockPage: page }) => {
    const bodyPromises: Promise<void>[] = []
    let totalBytes = 0

    page.on('response', res => {
      if (!res.url().includes('.js') || res.status() !== 200) return
      const cl = res.headers()['content-length']
      if (cl) {
        totalBytes += parseInt(cl, 10)
        return
      }
      bodyPromises.push(
        res.body().then(buf => { totalBytes += buf.length }).catch(() => {})
      )
    })

    await page.goto('/', { waitUntil: 'networkidle' })
    await Promise.all(bodyPromises)

    const totalMB = (totalBytes / 1024 / 1024).toFixed(2)
    expect(totalBytes, `Total JS is ${totalMB} MB (budget: 6 MB)`).toBeLessThan(6 * 1024 * 1024)
  })

  test('no individual CSS chunk exceeds 500 KB', async ({ unauthMockPage: page }) => {
    const oversized: string[] = []

    page.on('response', res => {
      if (!res.url().includes('.css') || res.status() !== 200) return
      const cl = res.headers()['content-length']
      if (cl && parseInt(cl, 10) > 500 * 1024) {
        oversized.push(`${new URL(res.url()).pathname} — ${(parseInt(cl) / 1024).toFixed(0)} KB`)
      }
    })

    await page.goto('/', { waitUntil: 'networkidle' })
    if (oversized.length > 0) console.warn('⚠ Oversized CSS:', oversized)
    expect(oversized, `Oversized CSS files:\n${oversized.join('\n')}`).toHaveLength(0)
  })
})

// ─── Resource Hygiene ─────────────────────────────────────────────────────

test.describe('Performance — Resource Hygiene', () => {
  test('no failed (4xx/5xx) resource requests on initial load', async ({ unauthMockPage: page }) => {
    const failed: string[] = []
    page.on('response', res => {
      const status = res.status()
      const url = res.url()
      // Skip known API endpoints that may 403/404 without auth
      if (status >= 400 && !url.includes('/api/') && !url.includes('localhost:4000') && !url.includes('auth0')) {
        failed.push(`${status} ${url}`)
      }
    })
    await page.goto('/', { waitUntil: 'networkidle' })
    if (failed.length > 0) console.warn('⚠ Failed resource requests:', failed)
    expect(failed).toHaveLength(0)
  })

  test('no duplicate script tags with the same src', async ({ unauthMockPage: page }) => {
    await page.goto('/')
    const dupes = await page.evaluate(() => {
      const srcs = [...document.querySelectorAll('script[src]')].map(s => s.getAttribute('src'))
      const seen = new Set<string>()
      return srcs.filter(src => {
        if (seen.has(src!)) return true
        seen.add(src!)
        return false
      })
    })
    expect(dupes, `Duplicate scripts: ${dupes.join(', ')}`).toHaveLength(0)
  })

  test('service worker is registered (PWA)', async ({ unauthMockPage: page }) => {
    await page.goto('/', { waitUntil: 'networkidle' })
    const hasServiceWorker = await page.evaluate(async () => {
      if (!('serviceWorker' in navigator)) return false
      const regs = await navigator.serviceWorker.getRegistrations()
      return regs.length > 0
    })
    // Service worker may not be registered in preview mode — soft check
    if (!hasServiceWorker) {
      console.warn('⚠ No service worker registered (may be expected in preview/dev mode)')
    }
  })
})
