/**
 * StreamVault E2E — Web Vitals & Performance
 *
 * Checks that the application meets basic performance budgets.
 * Tests will fail if the site is too slow to render content or
 * downloads too many unoptimized assets.
 *
 * Covers:
 *  - First Contentful Paint (FCP) < 2000ms
 *  - Largest Contentful Paint (LCP) < 3000ms
 *  - Cumulative Layout Shift (CLS) < 0.1
 *  - Total network payload size < 10MB
 *  - Image formats and compression
 */

import { test, expect } from './fixtures'
import { HomePage } from './pages/HomePage'

test.describe('Performance Metrics', () => {
  // Use a slower network condition if testing locally, but default to fast for stability
  
  test('First Contentful Paint (FCP) is under 2.0s', async ({ unauthMockPage: page }) => {
    await page.goto('/')

    // Wait for metrics to be available
    await page.waitForFunction(() => {
      return (window as any).performance.getEntriesByType('paint').length > 0
    }, { timeout: 10_000 })

    const fcp = await page.evaluate(() => {
      const paintMetrics = performance.getEntriesByType('paint')
      const fcpEntry = paintMetrics.find(m => m.name === 'first-contentful-paint')
      return fcpEntry ? fcpEntry.startTime : 0
    })

    // It should be non-zero and fast
    expect(fcp, `FCP is ${fcp}ms — expected < 2000ms`).toBeGreaterThan(0)
    expect(fcp, `FCP is ${fcp}ms — expected < 2000ms`).toBeLessThan(2000)
  })

  test('Cumulative Layout Shift (CLS) is minimal', async ({ unauthMockPage: page }) => {
    // We can inject a PerformanceObserver to catch CLS
    await page.goto('/')
    
    // Simulate some scrolling which can trigger layout shifts
    const home = new HomePage(page)
    await home.waitForAppReady()
    await home.scrollToBottom()
    await page.waitForTimeout(500)
    await home.scrollToTop()

    const cls = await page.evaluate(() => {
      return new Promise<number>((resolve) => {
        let clsValue = 0
        const observer = new PerformanceObserver((list) => {
          for (const entry of list.getEntries()) {
            if (!(entry as any).hadRecentInput) {
              clsValue += (entry as any).value
            }
          }
        })
        observer.observe({ type: 'layout-shift', buffered: true })
        
        // Give it a moment to collect
        setTimeout(() => {
          observer.disconnect()
          resolve(clsValue)
        }, 500)
      })
    })

    expect(cls, `CLS is ${cls} — expected < 0.1`).toBeLessThan(0.1)
  })

  test('Total network payload is under 10MB', async ({ unauthMockPage: page }) => {
    let totalBytes = 0
    page.on('response', async (response) => {
      try {
        const headers = response.headers()
        const contentLength = headers['content-length']
        if (contentLength) {
          totalBytes += parseInt(contentLength, 10)
        } else {
          // Fallback if header is missing
          const buffer = await response.body().catch(() => null)
          if (buffer) {
            totalBytes += buffer.length
          }
        }
      } catch (e) {
        // Ignore read errors for aborted requests
      }
    })

    await page.goto('/', { waitUntil: 'networkidle' })

    const totalMB = totalBytes / (1024 * 1024)
    expect(totalMB, `Total payload is ${totalMB.toFixed(2)}MB — expected < 10MB`).toBeLessThan(10)
  })

  test('Images have sizing attributes to prevent layout shift', async ({ unauthMockPage: page }) => {
    await page.goto('/')
    await page.waitForLoadState('networkidle')

    const unsizedImages = await page.evaluate(() => {
      const images = Array.from(document.querySelectorAll('img'))
      return images.filter(img => {
        // Must have either explicit width/height attrs or CSS dimensions
        const hasAttrs = img.hasAttribute('width') && img.hasAttribute('height')
        const style = window.getComputedStyle(img)
        const hasCss = (style.width !== 'auto' && style.height !== 'auto') || style.aspectRatio !== 'auto'
        const hasTailwindClasses = img.className.includes('w-') && (img.className.includes('h-') || img.className.includes('aspect-'))
        return !hasAttrs && !hasCss && !hasTailwindClasses
      }).length
    })

    expect(unsizedImages, `Found ${unsizedImages} images without sizing properties`).toBe(0)
  })
})
