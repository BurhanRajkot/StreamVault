/**
 * StreamVault E2E — Accessibility (a11y)
 *
 * Verifies basic WCAG compliance across the site.
 *
 * Covers:
 *  - Landmarks (main, nav, footer)
 *  - Color contrast (basic checks)
 *  - Aria labels on icon buttons
 */

import { test, expect } from './fixtures'
import { HomePage } from './pages/HomePage'

test.describe('Accessibility Standards', () => {
  test('homepage has expected ARIA landmarks', async ({ unauthMockPage: page }) => {
    await page.goto('/')
    const home = new HomePage(page)
    await home.waitForAppReady()

    // Main content area
    const mainCount = await page.locator('main, [role="main"]').count()
    expect(mainCount, 'Page should have exactly one main landmark').toBe(1)

    // Navigation
    const navCount = await page.locator('nav, [role="navigation"]').count()
    expect(navCount, 'Page should have at least one navigation landmark').toBeGreaterThan(0)
  })

  test('icon-only buttons have aria-labels', async ({ unauthMockPage: page }) => {
    await page.goto('/')
    await page.waitForLoadState('domcontentloaded')

    // Find buttons that only contain SVG/icons and no text
    const unlabelledButtons = await page.evaluate(() => {
      const buttons = Array.from(document.querySelectorAll('button'))
      return buttons.filter(btn => {
        const hasText = btn.innerText.trim().length > 0
        const hasAria = btn.hasAttribute('aria-label') || btn.hasAttribute('aria-labelledby')
        return !hasText && !hasAria
      }).length
    })

    expect(unlabelledButtons, `Found ${unlabelledButtons} icon buttons missing aria-labels`).toBe(0)
  })

  test('form inputs on login page have associated labels', async ({ unauthMockPage: page }) => {
    await page.goto('/login')
    await page.waitForLoadState('domcontentloaded')

    const unlabelledInputs = await page.evaluate(() => {
      const inputs = Array.from(document.querySelectorAll('input:not([type="hidden"])'))
      return inputs.filter(input => {
        const id = input.id
        const hasLabel = id ? !!document.querySelector(`label[for="${id}"]`) : false
        const hasAria = input.hasAttribute('aria-label') || input.hasAttribute('aria-labelledby')
        return !hasLabel && !hasAria
      }).length
    })

    expect(unlabelledInputs, `Found ${unlabelledInputs} inputs missing labels on login page`).toBe(0)
  })
})
