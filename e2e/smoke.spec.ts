/**
 * StreamVault E2E — Smoke Tests
 *
 * Fast sanity checks that run on every push.
 * Must stay quick: no waits > 5 seconds, no network-heavy assertions.
 *
 * Covers:
 *  - React app mounts without crashing (auth'd + unauth'd)
 *  - Body renders non-empty content
 *  - Core routes load and have an <h1>
 *  - No horizontal scroll overflow at mobile viewport
 *  - Mobile nav is accessible
 *  - PWA manifest link is present
 *  - Favicon is declared
 *  - No critical JS errors on initial load
 */

import { test, expect } from './fixtures'
import { HomePage } from './pages/HomePage'

// ─── Routes to sanity-check ────────────────────────────────────────────────

const CORE_ROUTES = [
  { path: '/', name: 'Home' },
  { path: '/pricing', name: 'Pricing' },
  { path: '/login', name: 'Login' },
] as const

// ─── App Shell ────────────────────────────────────────────────────────────

test.describe('Smoke — App Shell (unauthenticated)', () => {
  test('React app mounts without crashing', async ({ unauthMockPage: page }) => {
    const errors: string[] = []
    page.on('pageerror', err => {
      if (!err.message.includes('Failed to fetch')) errors.push(err.message)
    })

    await page.goto('/', { waitUntil: 'domcontentloaded' })

    const root = page.locator('#root')
    await expect(root).toBeVisible()
    await expect(root.locator('> *:not(script)').first()).toBeVisible({ timeout: 10_000 })
    expect(errors).toHaveLength(0)
  })

  test('React app mounts without crashing (authenticated)', async ({ mockApiPage: page }) => {
    const errors: string[] = []
    page.on('pageerror', err => {
      if (!err.message.includes('Failed to fetch')) errors.push(err.message)
    })

    await page.goto('/', { waitUntil: 'domcontentloaded' })

    const root = page.locator('#root')
    await expect(root).toBeVisible()
    await expect(root.locator('> *:not(script)').first()).toBeVisible({ timeout: 10_000 })
    expect(errors).toHaveLength(0)
  })

  test('body renders non-empty text content', async ({ unauthMockPage: page }) => {
    await page.goto('/')
    const bodyText = await page.textContent('body')
    expect((bodyText ?? '').trim().length).toBeGreaterThan(10)
  })

  test('no critical console errors on cold load', async ({ unauthMockPage: page }) => {
    const criticalErrors: string[] = []
    const IGNORED = ['auth0', 'intercom', 'analytics', 'net::ERR', 'Failed to load resource', 'Failed to fetch']
    page.on('console', msg => {
      if (msg.type() === 'error' && !IGNORED.some(s => msg.text().includes(s))) {
        criticalErrors.push(msg.text())
      }
    })
    page.on('pageerror', err => {
      if (!IGNORED.some(s => err.message.includes(s))) {
        criticalErrors.push(err.message)
      }
    })

    await page.goto('/', { waitUntil: 'networkidle' })
    expect(criticalErrors, `Unexpected console errors: ${criticalErrors.join('\n')}`).toHaveLength(0)
  })
})

// ─── Core Routes ──────────────────────────────────────────────────────────

test.describe('Smoke — Core Routes', () => {
  for (const { path, name } of CORE_ROUTES) {
    test(`${name} (${path}) loads and exposes an <h1>`, async ({ unauthMockPage: page }) => {
      await page.goto(path, { waitUntil: 'domcontentloaded' })
      const h1 = page.locator('h1').first()
      await expect(h1).toBeVisible({ timeout: 8_000 })
    })
  }

  test('unknown route shows 404 page', async ({ unauthMockPage: page }) => {
    await page.goto('/this-definitely-does-not-exist-xyz')
    const errIndicator = page.locator('h1:has-text("404")')
      .or(page.locator('text=404 Error'))
      .or(page.locator('text=The Missing Reel'))
      .or(page.locator('text=Not Found'))
      .first()
    await expect(errIndicator).toBeVisible({ timeout: 10_000 })
  })

  test('/error/500 route renders server error page', async ({ unauthMockPage: page }) => {
    await page.goto('/error/500', { waitUntil: 'domcontentloaded' })
    const errPage = page.locator('h1, h2').filter({ hasText: /500|Server Error|Something went wrong/i }).first()
    await expect(errPage).toBeVisible({ timeout: 5_000 })
  })
})

// ─── HTML Document ────────────────────────────────────────────────────────

test.describe('Smoke — HTML Document', () => {
  test('page has a non-empty <title>', async ({ unauthMockPage: page }) => {
    await page.goto('/')
    const title = await page.title()
    expect(title.length).toBeGreaterThan(0)
  })

  test('page declares a favicon', async ({ unauthMockPage: page }) => {
    await page.goto('/')
    const favicon = await page.locator('link[rel*="icon"]').first().getAttribute('href')
    expect(favicon).toBeTruthy()
  })

  test('page has a PWA manifest link', async ({ unauthMockPage: page }) => {
    await page.goto('/')
    const manifest = await page.locator('link[rel="manifest"]').first().getAttribute('href')
    expect(manifest).toBeTruthy()
  })

  test('viewport meta tag is present for mobile', async ({ unauthMockPage: page }) => {
    await page.goto('/')
    const viewport = await page.locator('meta[name="viewport"]').getAttribute('content')
    expect(viewport).toContain('width=device-width')
  })
})

// ─── Mobile Viewport ─────────────────────────────────────────────────────

test.describe('Smoke — Mobile Viewport (iPhone 14 Pro)', () => {
  test.use({ viewport: { width: 393, height: 852 } })

  test('homepage renders without horizontal overflow', async ({ unauthMockPage: page }) => {
    await page.goto('/', { waitUntil: 'domcontentloaded' })
    await expect(page.locator('#root')).toBeVisible()
    const overflows = await page.evaluate(() =>
      document.documentElement.scrollWidth > document.documentElement.clientWidth
    )
    expect(overflows, 'Page has unexpected horizontal scroll on mobile').toBe(false)
  })

  test('mobile navigation is accessible (hamburger or nav visible)', async ({ unauthMockPage: page }) => {
    await page.goto('/', { waitUntil: 'domcontentloaded' })
    const mobileNav = page.locator('[aria-label*="menu" i], [aria-label*="navigation" i], button[aria-expanded]')
    const desktopNav = page.locator('nav').first()
    const hasMobile = await mobileNav.count() > 0
    const hasDesktop = await desktopNav.isVisible().catch(() => false)
    expect(hasMobile || hasDesktop, 'No navigation element found on mobile').toBe(true)
  })

  test('pricing page renders without horizontal overflow on mobile', async ({ unauthMockPage: page }) => {
    await page.goto('/pricing', { waitUntil: 'domcontentloaded' })
    const overflows = await page.evaluate(() =>
      document.documentElement.scrollWidth > document.documentElement.clientWidth
    )
    expect(overflows).toBe(false)
  })
})

// ─── Tablet Viewport ──────────────────────────────────────────────────────

test.describe('Smoke — Tablet Viewport (iPad Pro)', () => {
  test.use({ viewport: { width: 1024, height: 1366 } })

  test('homepage renders and nav is visible on tablet', async ({ unauthMockPage: page }) => {
    await page.goto('/', { waitUntil: 'domcontentloaded' })
    const nav = page.locator('nav, [role="navigation"]').first()
    await expect(nav).toBeVisible({ timeout: 5_000 })
    const overflows = await page.evaluate(() =>
      document.documentElement.scrollWidth > document.documentElement.clientWidth
    )
    expect(overflows).toBe(false)
  })
})
