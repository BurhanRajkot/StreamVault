/**
 * StreamVault E2E — Smoke Tests
 *
 * Fast sanity checks that run on every push.
 *
 * CRITICAL: Every test now verifies that ACTUAL CONTENT renders — not
 * just that #root has children. The old assertions would pass on a
 * completely blank/broken page because React mounts an empty shell.
 *
 * Covers:
 *  - React app mounts AND renders visible text/UI (auth'd + unauth'd)
 *  - Body renders substantial text content (> 100 chars)
 *  - Core routes load with visible headings and content
 *  - No horizontal scroll overflow at mobile viewport
 *  - Mobile nav is accessible
 *  - PWA manifest link is present
 *  - Favicon is declared
 *  - No critical JS errors on initial load
 *  - Footer is visible on homepage
 *  - At least one image renders on homepage
 *  - Page has meaningful content height (not blank)
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
  test('React app mounts and renders visible content', async ({ unauthMockPage: page }) => {
    const errors: string[] = []
    page.on('pageerror', err => {
      if (!err.message.includes('Failed to fetch')) errors.push(err.message)
    })

    await page.goto('/', { waitUntil: 'domcontentloaded' })

    const root = page.locator('#root')
    await expect(root).toBeVisible()

    // STRONG CHECK: Wait for actual text content — not just a React shell
    await page.waitForFunction(() => {
      const body = document.body
      return body && (body.innerText || '').trim().length > 50
    }, { timeout: 15_000 })

    // Verify at least one heading or interactive element is present
    const hasContent = await page.locator('h1, h2, h3, button, a[href]').first().isVisible().catch(() => false)
    expect(hasContent, 'Page mounted but no headings or interactive elements visible').toBe(true)

    expect(errors).toHaveLength(0)
  })

  test('React app mounts and renders visible content (authenticated)', async ({ mockApiPage: page }) => {
    const errors: string[] = []
    page.on('pageerror', err => {
      if (!err.message.includes('Failed to fetch')) errors.push(err.message)
    })

    await page.goto('/', { waitUntil: 'domcontentloaded' })

    const root = page.locator('#root')
    await expect(root).toBeVisible()

    // STRONG CHECK: Wait for actual text content
    await page.waitForFunction(() => {
      const body = document.body
      return body && (body.innerText || '').trim().length > 50
    }, { timeout: 15_000 })

    const hasContent = await page.locator('h1, h2, h3, button, a[href]').first().isVisible().catch(() => false)
    expect(hasContent, 'Authenticated page has no visible headings or buttons').toBe(true)

    expect(errors).toHaveLength(0)
  })

  test('body renders substantial text content (> 100 chars)', async ({ unauthMockPage: page }) => {
    await page.goto('/')
    await page.waitForLoadState('networkidle')
    const bodyText = await page.evaluate(() => (document.body.innerText || '').trim())
    expect(
      bodyText.length,
      `Body text is only ${bodyText.length} chars — page appears blank or minimal`
    ).toBeGreaterThan(100)
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

  test('page has meaningful content height (not a blank screen)', async ({ unauthMockPage: page }) => {
    await page.goto('/', { waitUntil: 'networkidle' })
    const contentHeight = await page.evaluate(() => {
      const root = document.getElementById('root')
      return root ? root.scrollHeight : 0
    })
    expect(
      contentHeight,
      `Content height is only ${contentHeight}px — likely a blank screen`
    ).toBeGreaterThan(300)
  })

  test('at least one image renders on the homepage', async ({ unauthMockPage: page }) => {
    await page.goto('/', { waitUntil: 'networkidle' })
    const imgCount = await page.locator('img').count()
    expect(imgCount, 'No images found on homepage — page may be broken').toBeGreaterThan(0)
  })
})

// ─── Core Routes ──────────────────────────────────────────────────────────

test.describe('Smoke — Core Routes', () => {
  for (const { path, name } of CORE_ROUTES) {
    test(`${name} (${path}) loads with visible heading and content`, async ({ unauthMockPage: page }) => {
      await page.goto(path, { waitUntil: 'domcontentloaded' })

      // Wait for actual content — not just DOM skeleton
      const h1 = page.locator('h1').first()
      await expect(h1).toBeVisible({ timeout: 10_000 })

      // Verify the heading has actual text
      const headingText = await h1.innerText()
      expect(headingText.trim().length, `${name} page <h1> is empty`).toBeGreaterThan(0)

      // Verify page has body text content
      const bodyText = await page.evaluate(() => (document.body.innerText || '').trim())
      expect(bodyText.length, `${name} page has minimal text content`).toBeGreaterThan(50)
    })
  }

  test('unknown route shows 404 page with meaningful content', async ({ unauthMockPage: page }) => {
    await page.goto('/this-definitely-does-not-exist-xyz')
    const errIndicator = page.locator('h1:has-text("404")')
      .or(page.locator('text=404 Error'))
      .or(page.locator('text=The Missing Reel'))
      .or(page.locator('text=Not Found'))
      .first()
    await expect(errIndicator).toBeVisible({ timeout: 10_000 })

    // Verify the 404 page has actual content, not just a number
    const bodyText = await page.evaluate(() => (document.body.innerText || '').trim())
    expect(bodyText.length, '404 page has no content beyond the error code').toBeGreaterThan(20)
  })

  test('/error/500 route renders server error page with content', async ({ unauthMockPage: page }) => {
    await page.goto('/error/500', { waitUntil: 'domcontentloaded' })
    const errPage = page.locator('h1, h2').filter({ hasText: /500|Server Error|Something went wrong/i }).first()
    await expect(errPage).toBeVisible({ timeout: 5_000 })

    // Verify meaningful error message exists
    const bodyText = await page.evaluate(() => (document.body.innerText || '').trim())
    expect(bodyText.length, 'Server error page has no descriptive content').toBeGreaterThan(30)
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

  test('page declares language attribute on <html>', async ({ unauthMockPage: page }) => {
    await page.goto('/')
    const lang = await page.locator('html').getAttribute('lang')
    expect(lang, 'Missing lang attribute on <html> element').toBeTruthy()
  })
})

// ─── Navigation & Footer ─────────────────────────────────────────────────

test.describe('Smoke — Navigation & Footer', () => {
  test('navigation bar is visible on homepage', async ({ unauthMockPage: page, isMobile }) => {
    await page.goto('/', { waitUntil: 'domcontentloaded' })

    if (isMobile) {
      // On mobile, the main nav is hidden and a hamburger menu or mobile-specific nav is shown.
      // We look for the header instead to verify it's present.
      const header = page.locator('header').first()
      await expect(header).toBeVisible({ timeout: 8_000 })
    } else {
      const nav = page.locator('nav, [role="navigation"]').first()
      await expect(nav).toBeVisible({ timeout: 8_000 })

      // Verify nav has actual content (links, buttons)
      const navText = await nav.innerText().catch(() => '')
      expect(navText.trim().length, 'Navigation bar has no text content').toBeGreaterThan(0)
    }
  })

  test('footer is present and has content', async ({ unauthMockPage: page }) => {
    await page.goto('/', { waitUntil: 'networkidle' })
    const footer = page.locator('footer').first()
    await expect(footer).toBeAttached({ timeout: 8_000 })

    // Scroll to footer and verify content
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight))
    await page.waitForTimeout(500)
    const footerText = await footer.innerText().catch(() => '')
    expect(footerText.trim().length, 'Footer has no text content').toBeGreaterThan(5)
  })
})

// ─── Mobile Viewport ─────────────────────────────────────────────────────

test.describe('Smoke — Mobile Viewport (iPhone 14 Pro)', () => {
  test.use({ viewport: { width: 393, height: 852 } })

  test('homepage renders without horizontal overflow', async ({ unauthMockPage: page }) => {
    await page.goto('/', { waitUntil: 'domcontentloaded' })

    // STRONG CHECK: Wait for actual content, not just #root
    await page.waitForFunction(() => {
      const body = document.body
      return body && (body.innerText || '').trim().length > 30
    }, { timeout: 15_000 })

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

  test('mobile homepage shows visible content (not blank)', async ({ unauthMockPage: page }) => {
    await page.goto('/', { waitUntil: 'networkidle' })
    const bodyText = await page.evaluate(() => (document.body.innerText || '').trim())
    expect(bodyText.length, 'Mobile homepage appears blank').toBeGreaterThan(50)
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

  test('tablet homepage shows visible content', async ({ unauthMockPage: page }) => {
    await page.goto('/', { waitUntil: 'networkidle' })
    const bodyText = await page.evaluate(() => (document.body.innerText || '').trim())
    expect(bodyText.length, 'Tablet homepage appears blank').toBeGreaterThan(50)
  })
})
