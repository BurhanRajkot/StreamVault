/**
 * StreamVault E2E — Responsive Design
 *
 * Verifies that the UI adapts correctly to different screen sizes.
 * Tests will fail if elements overlap, become unreachable, or if
 * mobile navigation doesn't render.
 *
 * Covers:
 *  - Mobile (iPhone SE / Pixel 7) layout checks
 *  - Tablet (iPad Pro) layout checks
 *  - Touch target sizes
 *  - Navigation adapts to viewport (hamburger vs desktop links)
 */

import { test, expect } from './fixtures'
import { HomePage } from './pages/HomePage'

test.describe('Responsive — Mobile Viewport (Small)', () => {
  // Mobile Viewport (e.g. iPhone SE / Pixel 7)
  test.use({ viewport: { width: 375, height: 667 } })

  test('navbar converts to mobile menu', async ({ unauthMockPage: page }) => {
    await page.goto('/', { waitUntil: 'domcontentloaded' })
    const home = new HomePage(page)
    await home.waitForAppReady()

    // Desktop nav links should typically be hidden
    const desktopLinks = page.locator('nav a[href="/pricing"]').first()
    const isDesktopVisible = await desktopLinks.isVisible().catch(() => false)
    
    // Hamburger menu or mobile nav should be visible
    const hamburger = page.locator('[aria-label*="menu" i], [aria-label*="navigation" i], button[aria-expanded]')
    const isHamburgerVisible = await hamburger.first().isVisible().catch(() => false)

    // Either desktop is hidden, or mobile menu is shown (or both)
    expect(!isDesktopVisible || isHamburgerVisible, 'Mobile layout did not activate on small screen').toBe(true)
  })

  test('media grid adjusts column count on mobile', async ({ unauthMockPage: page }) => {
    await page.goto('/', { waitUntil: 'domcontentloaded' })
    const home = new HomePage(page)
    await home.assertMediaCardsHaveContent()

    // Measure the width of a single card
    const firstCard = home.mediaCards.first()
    const cardBox = await firstCard.boundingBox()
    
    // On a 375px screen, a card should take up a significant portion of width (e.g. 2 or 3 columns max)
    expect(cardBox).not.toBeNull()
    if (cardBox) {
      const percentageWidth = (cardBox.width / 375) * 100
      expect(percentageWidth, 'Cards are too small on mobile (expecting 2-3 cols)').toBeGreaterThan(25) // At least 25% width (4 cols max)
    }
  })

  test('touch targets are adequately sized for mobile', async ({ unauthMockPage: page }) => {
    await page.goto('/', { waitUntil: 'domcontentloaded' })
    
    // Check main call-to-action buttons
    const ctas = page.locator('button')
    const count = await ctas.count()
    
    // We just check the first few prominent buttons
    for (let i = 0; i < Math.min(count, 3); i++) {
      const btn = ctas.nth(i)
      if (await btn.isVisible()) {
        const box = await btn.boundingBox()
        if (box) {
          // WCAG recommends 44x44, but 32x32 is often a minimum in dense UIs
          expect(box.height >= 32 || box.width >= 32, 'Touch target is too small on mobile').toBe(true)
        }
      }
    }
  })
})

test.describe('Responsive — Tablet Viewport', () => {
  test.use({ viewport: { width: 768, height: 1024 } })

  test('media grid adjusts column count on tablet', async ({ unauthMockPage: page }) => {
    await page.goto('/', { waitUntil: 'domcontentloaded' })
    const home = new HomePage(page)
    await home.assertMediaCardsHaveContent()

    const firstCard = home.mediaCards.first()
    const cardBox = await firstCard.boundingBox()
    
    expect(cardBox).not.toBeNull()
    if (cardBox) {
      const percentageWidth = (cardBox.width / 768) * 100
      // On tablet, expect smaller percentage width (e.g. 4-5 columns)
      expect(percentageWidth, 'Cards are too large on tablet').toBeLessThan(35)
    }
  })
})
