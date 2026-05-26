/**
 * StreamVault E2E Audit Tests — Homepage & Navigation
 *
 * Covers:
 *  - Page loads without errors
 *  - Navigation elements are present
 *  - SEO meta tags
 *  - Core accessibility (keyboard, ARIA roles)
 *  - Performance budget (LCP / paint)
 *  - Security headers (served through vite preview)
 */

import { test, expect } from '@playwright/test'

test.beforeEach(async ({ context }) => {
  // Dismiss the disclaimer modal globally
  await context.addInitScript(() => {
    window.sessionStorage.setItem('disclaimerAccepted', 'true')
  })
})

test.describe('Homepage', () => {
  test('should load without console errors', async ({ page }) => {
    const errors: string[] = []
    page.on('console', msg => {
      if (msg.type() === 'error') errors.push(msg.text())
    })
    page.on('pageerror', err => errors.push(err.message))

    await page.goto('/')
    await page.waitForLoadState('networkidle')

    // Filter out known third-party noise and connection/resource errors from environment/backend offline
    const critical = errors.filter(
      e => !e.includes('auth0') &&
           !e.includes('intercom') &&
           !e.includes('analytics') &&
           !e.includes('net::ERR') &&
           !e.includes('Failed to load resource') &&
           !e.includes('Failed to fetch')
    )
    expect(critical).toHaveLength(0)
  })

  test('should have a valid <title> tag', async ({ page }) => {
    await page.goto('/')
    const title = await page.title()
    expect(title.length).toBeGreaterThan(0)
    expect(title).toContain('StreamVault')
  })

  test('should have a meta description', async ({ page }) => {
    await page.goto('/')
    const desc = await page.locator('meta[name="description"]').first().getAttribute('content')
    expect(desc).toBeTruthy()
    expect((desc ?? '').length).toBeGreaterThan(20)
  })

  test('should have exactly one <h1> element', async ({ page }) => {
    await page.goto('/')
    await page.waitForLoadState('domcontentloaded')
    const h1s = await page.locator('h1').count()
    expect(h1s).toBe(1)
  })

  test('should have a viewport meta tag for mobile', async ({ page }) => {
    await page.goto('/')
    const viewport = await page.locator('meta[name="viewport"]').getAttribute('content')
    expect(viewport).toContain('width=device-width')
  })
})

test.describe('Navigation', () => {
  test('should render the main navigation bar', async ({ page }) => {
    await page.goto('/')
    await page.waitForLoadState('domcontentloaded')
    const nav = page.locator('nav, [role="navigation"]').first()
    await expect(nav).toBeVisible()
  })

  test('should be focusable via keyboard (Tab navigation)', async ({ page }) => {
    await page.goto('/')
    await page.keyboard.press('Tab')
    const focused = await page.evaluate(() => document.activeElement?.tagName)
    expect(['A', 'BUTTON', 'INPUT', 'SELECT', 'TEXTAREA']).toContain(focused)
  })

  test('should navigate to the Pricing page', async ({ page }) => {
    await page.goto('/')
    // Look for any pricing link in the navigation or page body
    const pricingLink = page.locator('a[href*="pricing"], a[href*="plans"]').first()
    if (await pricingLink.count() > 0) {
      await pricingLink.click()
      await page.waitForLoadState('domcontentloaded')
      expect(page.url()).toContain('pric')
    } else {
      // Navigate directly
      await page.goto('/pricing')
      await page.waitForLoadState('domcontentloaded')
      await expect(page.locator('h1')).toBeVisible()
    }
  })
})

test.describe('Accessibility (WCAG basics)', () => {
  test('all images should have alt attributes', async ({ page }) => {
    await page.goto('/')
    await page.waitForLoadState('domcontentloaded')
    const imgsWithoutAlt = await page.evaluate(() =>
      [...document.querySelectorAll('img')].filter(
        img => !img.hasAttribute('alt')
      ).length
    )
    expect(imgsWithoutAlt).toBe(0)
  })

  test('all form inputs should have accessible labels', async ({ page }) => {
    await page.goto('/')
    await page.waitForLoadState('domcontentloaded')
    const unlabelledInputs = await page.evaluate(() =>
      [...document.querySelectorAll('input:not([type="hidden"])')].filter(input => {
        const id = input.id
        const ariaLabel = input.getAttribute('aria-label')
        const ariaLabelledBy = input.getAttribute('aria-labelledby')
        const hasLabel = id ? !!document.querySelector(`label[for="${id}"]`) : false
        return !hasLabel && !ariaLabel && !ariaLabelledBy
      }).length
    )
    expect(unlabelledInputs).toBe(0)
  })

  test('interactive elements should have visible focus outlines', async ({ page }) => {
    await page.goto('/')
    // Press Tab and check that :focus-visible is used or focus styling is applied
    await page.keyboard.press('Tab')
    const hasFocusVisible = await page.evaluate(() => {
      const el = document.activeElement
      if (!el) return false
      const style = window.getComputedStyle(el)
      return style.outlineStyle !== 'none' || style.boxShadow !== 'none'
    })
    expect(hasFocusVisible).toBe(true)
  })
})

test.describe('Performance Budget', () => {
  test('page should paint within 3 seconds', async ({ page }) => {
    const startTime = Date.now()
    await page.goto('/', { waitUntil: 'domcontentloaded' })
    const elapsed = Date.now() - startTime
    expect(elapsed).toBeLessThan(3000)
  })

  test('bundle should not include obviously large un-lazy-loaded chunks', async ({ page }) => {
    // Collect a Promise for each JS response body so we can await them all
    // AFTER navigation. Using an async listener directly is fire-and-forget:
    // page.goto resolves before the body reads finish, leaving the array empty.
    const bodyPromises: Promise<void>[] = []
    const oversizedChunks: string[] = []

    page.on('response', res => {
      if (!res.url().includes('.js') || res.status() !== 200) return

      // Try content-length header first (zero allocation, synchronous)
      const contentLength = res.headers()['content-length']
      if (contentLength) {
        const bytes = parseInt(contentLength, 10)
        if (bytes > 2 * 1024 * 1024) {
          oversizedChunks.push(`${res.url()} (${(bytes / 1024).toFixed(0)} KB via header)`)
        }
        return
      }

      // Fall back to reading the body (async — collect the Promise)
      bodyPromises.push(
        res.body()
          .then(buf => {
            if (buf.length > 2 * 1024 * 1024) {
              oversizedChunks.push(`${res.url()} (${(buf.length / 1024).toFixed(0)} KB)`)
            }
          })
          .catch(() => { /* response already consumed or redirected — skip */ }),
      )
    })

    await page.goto('/', { waitUntil: 'networkidle' })

    // Wait for every pending body-read to complete before asserting
    await Promise.all(bodyPromises)

    if (oversizedChunks.length > 0) {
      console.warn('Oversized JS chunks detected:', oversizedChunks)
    }
    expect(oversizedChunks).toHaveLength(0)
  })
})

test.describe('Not Found Page', () => {
  test('should render a 404 page for unknown routes', async ({ page }) => {
    await page.goto('/this-page-definitely-does-not-exist-xyz')
    // Wait for the 404 heading/text or layout code to appear (auto-waiting)
    const errText = page.locator('h1:has-text("404")')
      .or(page.locator('text=404 Error'))
      .or(page.locator('text=The Missing Reel'))
      .first()
    await expect(errText).toBeVisible({ timeout: 10_000 })
  })
})

test.describe('Interactive UI Features', () => {
  test('should switch between light and dark themes', async ({ page }) => {
    await page.goto('/')
    await page.evaluate(() => {
      window.localStorage.setItem('theme', 'light')
    })
    await page.reload()
    await page.waitForLoadState('domcontentloaded')
    
    const themeBtn = page.locator('button[aria-label*="Switch to"]').first()
    await expect(themeBtn).toBeVisible()
    
    // Get the current theme class on <html>
    const initialClass = await page.locator('html').getAttribute('class')
    
    // Click theme button
    await themeBtn.click()
    
    // Verify theme class changed (uses auto-waiting locator assertion)
    await expect(page.locator('html')).not.toHaveClass(initialClass || '')
  })

  test('should filter content when clicking on an OTT provider', async ({ page }) => {
    await page.goto('/')
    await page.waitForLoadState('networkidle')
    
    const providerBtn = page.locator('button[aria-label^="Filter by"]').first()
    if (await providerBtn.count() > 0) {
      await expect(providerBtn).toBeVisible()
      await providerBtn.click()
      
      // Check that it gets selected (has a Check icon inside it or gets visual active state)
      const checkIcon = providerBtn.locator('svg')
      await expect(checkIcon).toBeVisible()
      
      // Clicking "Show all providers" should reset it
      const showAllBtn = page.locator('button[aria-label="Show all providers"]')
      await showAllBtn.click()
      await expect(checkIcon).not.toBeVisible()
    }
  })

  test('should open movie details modal when clicking a media card', async ({ page }) => {
    // Intercept discover calls to guarantee cards are present
    await page.route('**/tmdb/discover/movie*', async route => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          results: [
            { id: 27205, title: 'Inception', media_type: 'movie', poster_path: '/ljsZTbVsrQSqZgWeep2B1QiDKuh.jpg', vote_average: 8.4 }
          ],
          total_pages: 1
        })
      })
    })

    await page.route('**/tmdb/trending/*', async route => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          results: [
            { id: 27205, title: 'Inception', media_type: 'movie', poster_path: '/ljsZTbVsrQSqZgWeep2B1QiDKuh.jpg', vote_average: 8.4 }
          ]
        })
      })
    })

    await page.route('**/tmdb/movie/27205*', async route => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          id: 27205,
          title: 'Inception',
          overview: 'Cobb steals information from dreams.',
          poster_path: '/ljsZTbVsrQSqZgWeep2B1QiDKuh.jpg',
          vote_average: 8.4
        })
      })
    })

    await page.goto('/')
    await page.waitForLoadState('networkidle')
    
    // Find a media card in the popular grid or recently added
    const mediaCard = page.locator('.group.relative.cursor-pointer, [role="button"]:has(img)').first()
    await expect(mediaCard).toBeVisible({ timeout: 10000 })
    await mediaCard.click()
    
    // Modal or watch details should become visible
    // Wait for the navigation to finish by expecting the URL to contain /watch/
    await expect(page).toHaveURL(/.*\/watch\/.*/)
  })
})
