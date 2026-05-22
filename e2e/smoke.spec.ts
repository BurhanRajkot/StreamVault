/**
 * StreamVault E2E — Smoke Test
 *
 * Quick sanity checks that run on every push:
 *  - App shell renders
 *  - No critical JS errors
 *  - Core routes load
 *  - Basic responsiveness at mobile viewport
 */

import { test, expect } from '@playwright/test'

test.beforeEach(async ({ context }) => {
  // Dismiss the disclaimer modal globally
  await context.addInitScript(() => {
    window.sessionStorage.setItem('disclaimerAccepted', 'true')
  })
})

const ROUTES_TO_CHECK = [
  { path: '/', name: 'Home' },
  { path: '/pricing', name: 'Pricing' },
]

test.describe('Smoke — App Shell', () => {
  test('the React app mounts without crashing', async ({ page }) => {
    const jsErrors: string[] = []
    page.on('pageerror', err => jsErrors.push(err.message))

    await page.goto('/', { waitUntil: 'domcontentloaded' })

    // Wait for React to hydrate (root div should have children)
    const root = page.locator('#root')
    await expect(root).toBeVisible()
    const children = await root.locator('>*').count()
    expect(children).toBeGreaterThan(0)

    expect(jsErrors).toHaveLength(0)
  })

  test('the page renders a non-empty <body>', async ({ page }) => {
    await page.goto('/')
    const bodyText = await page.textContent('body')
    expect((bodyText ?? '').trim().length).toBeGreaterThan(0)
  })
})

test.describe('Smoke — Core Routes', () => {
  for (const { path, name } of ROUTES_TO_CHECK) {
    test(`${name} (${path}) loads and has an <h1>`, async ({ page }) => {
      await page.goto(path, { waitUntil: 'domcontentloaded' })
      const h1 = page.locator('h1').first()
      await expect(h1).toBeVisible({ timeout: 5000 })
    })
  }
})

test.describe('Smoke — Mobile Viewport', () => {
  test.use({ viewport: { width: 390, height: 844 } }) // iPhone 14

  test('homepage renders correctly on mobile', async ({ page }) => {
    await page.goto('/', { waitUntil: 'domcontentloaded' })
    const root = page.locator('#root')
    await expect(root).toBeVisible()
    // Page should not overflow horizontally
    const hasHorizontalScroll = await page.evaluate(() =>
      document.documentElement.scrollWidth > document.documentElement.clientWidth
    )
    expect(hasHorizontalScroll).toBe(false)
  })

  test('navigation is accessible on mobile (hamburger or nav visible)', async ({ page }) => {
    await page.goto('/', { waitUntil: 'domcontentloaded' })
    // Either a mobile nav burger icon or a full nav should be visible
    const mobileNav = page.locator(
      '[aria-label*="menu" i], [aria-label*="navigation" i], [data-testid="mobile-menu"], button[aria-expanded]'
    )
    const desktopNav = page.locator('nav').first()
    const hasMobileNav = await mobileNav.count() > 0
    const hasDesktopNav = await desktopNav.isVisible().catch(() => false)
    expect(hasMobileNav || hasDesktopNav).toBe(true)
  })
})
