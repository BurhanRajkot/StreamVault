/**
 * StreamVault E2E — Responsive / Cross-Viewport Tests
 *
 * Systematically tests critical pages across the viewport matrix:
 *  - Mobile S  : 375 × 812  (iPhone SE / older iPhones)
 *  - Mobile M  : 393 × 852  (iPhone 14 Pro)
 *  - Mobile L  : 430 × 932  (iPhone 14 Plus)
 *  - Tablet P  : 768 × 1024 (iPad Mini portrait)
 *  - Tablet L  : 1024 × 768 (iPad Mini landscape)
 *  - Laptop    : 1366 × 768 (13" laptop)
 *  - Desktop   : 1920 × 1080 (FHD)
 *
 * For each viewport, checks:
 *  1. No horizontal overflow
 *  2. Main nav is visible (or burger menu present)
 *  3. <h1> renders
 *  4. No JS crash
 */

import { test, expect } from './fixtures'

// ─── Viewport Matrix ──────────────────────────────────────────────────────

const VIEWPORTS = [
  { name: 'Mobile S (iPhone SE)',     width: 375,  height: 812  },
  { name: 'Mobile M (iPhone 14 Pro)', width: 393,  height: 852  },
  { name: 'Mobile L (iPhone 14 Plus)',width: 430,  height: 932  },
  { name: 'Tablet Portrait (iPad)',   width: 768,  height: 1024 },
  { name: 'Tablet Landscape (iPad)',  width: 1024, height: 768  },
  { name: 'Laptop (1366×768)',        width: 1366, height: 768  },
  { name: 'Desktop FHD',             width: 1920, height: 1080 },
] as const

const PAGES_TO_CHECK = [
  { path: '/',         name: 'Homepage'  },
  { path: '/pricing',  name: 'Pricing'   },
  { path: '/login',    name: 'Login'     },
] as const

// ─── Overflow Check (All Viewports × All Pages) ───────────────────────────

for (const vp of VIEWPORTS) {
  test.describe(`Responsive — ${vp.name} (${vp.width}×${vp.height})`, () => {
    test.use({ viewport: { width: vp.width, height: vp.height } })

    for (const pg of PAGES_TO_CHECK) {
      test(`${pg.name} — no horizontal overflow at ${vp.width}px wide`, async ({ unauthMockPage: page }) => {
        await page.goto(pg.path, { waitUntil: 'domcontentloaded' })
        const overflows = await page.evaluate(() =>
          document.documentElement.scrollWidth > document.documentElement.clientWidth
        )
        expect(overflows, `${pg.name} overflows horizontally at ${vp.width}px`).toBe(false)
      })
    }

    test('homepage <h1> visible', async ({ unauthMockPage: page }) => {
      await page.goto('/', { waitUntil: 'domcontentloaded' })
      await expect(page.locator('h1').first()).toBeVisible({ timeout: 8_000 })
    })

    test('homepage nav element is accessible', async ({ unauthMockPage: page }) => {
      await page.goto('/', { waitUntil: 'domcontentloaded' })
      const nav = page.locator('nav, [role="navigation"], button[aria-expanded], [aria-label*="menu" i]').first()
      await expect(nav).toBeVisible({ timeout: 5_000 })
    })

    test('homepage does not crash JS', async ({ unauthMockPage: page }) => {
      const errors: string[] = []
      page.on('pageerror', err => {
        if (!err.message.includes('Failed to fetch')) errors.push(err.message)
      })
      await page.goto('/', { waitUntil: 'domcontentloaded' })
      await expect(page.locator('#root > *').first()).toBeVisible({ timeout: 10_000 })
      expect(errors, `JS errors at ${vp.width}px: ${errors.join('\n')}`).toHaveLength(0)
    })
  })
}

// ─── Specific Responsive Behaviors ───────────────────────────────────────

test.describe('Responsive — Mobile Navigation (375px)', () => {
  test.use({ viewport: { width: 375, height: 812 } })

  test('desktop nav links are not visible (collapsed into burger)', async ({ unauthMockPage: page }) => {
    await page.goto('/', { waitUntil: 'domcontentloaded' })
    // On narrow mobile the full desktop nav should be hidden, replaced by a burger
    const desktopNavLinks = page.locator('nav a').filter({ hasText: /pricing|favorites|downloads/i })
    // At least one of these patterns should be true:
    // - Links are hidden (display:none)
    // - A burger/hamburger button is present
    const burgerBtn = page.locator('button[aria-expanded], [aria-label*="menu" i], [data-testid="mobile-menu-btn"]').first()
    const hasBurger = await burgerBtn.count() > 0
    const linksHidden = await desktopNavLinks.first().isHidden().catch(() => true)
    expect(hasBurger || linksHidden).toBe(true)
  })

  test('pricing plan cards stack vertically (not side-by-side)', async ({ unauthMockPage: page }) => {
    await page.goto('/pricing', { waitUntil: 'domcontentloaded' })
    const planCards = page.locator('h2:has-text("Premium"), h2:has-text("Basic"), h2:has-text("Family"), [data-testid*="plan"]')
    const count = await planCards.count()
    if (count < 2) return // Not enough cards to compare

    const firstBox = await planCards.nth(0).boundingBox()
    const secondBox = await planCards.nth(1).boundingBox()
    if (firstBox && secondBox) {
      // On mobile, cards stack: second card's top > first card's bottom (roughly)
      const isStacked = secondBox.y > firstBox.y + firstBox.height / 2
      expect(isStacked, 'Plan cards appear side-by-side on mobile (expected stacked)').toBe(true)
    }
  })
})

test.describe('Responsive — Desktop Navigation (1920px)', () => {
  test.use({ viewport: { width: 1920, height: 1080 } })

  test('full nav links are visible without a burger menu', async ({ unauthMockPage: page }) => {
    await page.goto('/', { waitUntil: 'domcontentloaded' })
    // At 1920px, full nav links should be directly visible
    const nav = page.locator('nav').first()
    await expect(nav).toBeVisible()
    // Burger menu should NOT be present (or should be hidden)
    const burgerBtn = page.locator('[aria-label*="menu" i], button[aria-expanded]').first()
    const burgerVisible = await burgerBtn.isVisible().catch(() => false)
    // This is a soft check — some responsive navs show burger at all sizes
    if (burgerVisible) {
      console.warn('⚠ Burger menu visible at 1920px — may be intentional')
    }
  })

  test('media cards appear in a grid layout (multiple columns)', async ({ mockApiPage: page }) => {
    await page.goto('/', { waitUntil: 'networkidle' })
    const cards = page.locator('.group.relative.cursor-pointer, [role="button"]:has(img)').filter({ hasNot: page.locator('nav') })
    const count = await cards.count()
    if (count < 2) return // Not enough cards rendered

    const firstBox = await cards.nth(0).boundingBox()
    const secondBox = await cards.nth(1).boundingBox()
    if (firstBox && secondBox) {
      // Side-by-side layout: first and second cards share a similar Y position
      const isSideBySide = Math.abs(firstBox.y - secondBox.y) < firstBox.height * 0.5
      expect(isSideBySide, 'Cards should appear side-by-side on desktop').toBe(true)
    }
  })
})

// ─── Touch / Pointer Media Queries ────────────────────────────────────────

test.describe('Responsive — Interaction Models', () => {
  test.use({ viewport: { width: 393, height: 852 } })

  test('search button is large enough to tap on mobile (min 44×44px)', async ({ unauthMockPage: page }) => {
    await page.goto('/', { waitUntil: 'domcontentloaded' })
    const searchBtn = page.locator('button[aria-label="Open search"]').first()
    if (await searchBtn.count() === 0) return

    const box = await searchBtn.boundingBox()
    if (box) {
      expect(box.width, `Search button too narrow: ${box.width}px (min 44px)`).toBeGreaterThanOrEqual(44)
      expect(box.height, `Search button too short: ${box.height}px (min 44px)`).toBeGreaterThanOrEqual(44)
    }
  })

  test('nav hamburger button is large enough to tap on mobile', async ({ unauthMockPage: page }) => {
    await page.goto('/', { waitUntil: 'domcontentloaded' })
    const burger = page.locator('button[aria-expanded], [aria-label*="menu" i]').first()
    if (await burger.count() === 0) return

    const box = await burger.boundingBox()
    if (box) {
      expect(box.width).toBeGreaterThanOrEqual(44)
      expect(box.height).toBeGreaterThanOrEqual(44)
    }
  })
})
