/**
 * StreamVault E2E — Search Audit Tests
 *
 * Tests the autocomplete search experience without requiring auth.
 * All tests target the public-facing search widget.
 */

import { test, expect } from '@playwright/test'

test.describe('Search UI', () => {
  test.beforeEach(async ({ context, page }) => {
    // Dismiss the disclaimer modal globally
    await context.addInitScript(() => {
      window.sessionStorage.setItem('disclaimerAccepted', 'true')
    })
    await page.goto('/')
    await page.waitForLoadState('domcontentloaded')
  })

  test('should render a search input on the homepage', async ({ page }) => {
    // Open search first by clicking the search button
    const openSearchButton = page.locator('button[aria-label="Open search"]').first()
    await openSearchButton.click()

    const searchInput = page.locator('input[placeholder*="Search"]').first()
    await expect(searchInput).toBeVisible()
  })

  test('should accept typed text in the search box', async ({ page }) => {
    const openSearchButton = page.locator('button[aria-label="Open search"]').first()
    await openSearchButton.click()

    const searchInput = page.locator('input[placeholder*="Search"]').first()
    await searchInput.fill('inception')
    await expect(searchInput).toHaveValue('inception')
  })

  test('should show autocomplete suggestions after typing', async ({ page }) => {
    // Intercept search request to return mock predictable data
    await page.route('**/tmdb/search/hybrid*', async route => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          results: [
            { id: 27205, title: 'Inception', media_type: 'movie', poster_path: '/ljsZTbVsrQSqZgWeep2B1QiDKuh.jpg', vote_average: 8.4 }
          ],
          total_results: 1,
          total_pages: 1
        })
      })
    })

    const openSearchButton = page.locator('button[aria-label="Open search"]').first()
    await openSearchButton.click()

    const searchInput = page.locator('input[placeholder*="Search"]').first()
    await searchInput.fill('inc')

    // Suggestions or grid cards should appear
    const firstCard = page.locator('.group.relative.cursor-pointer, [role="button"]:has(img)').first()
    await expect(firstCard).toBeVisible({ timeout: 10_000 })
  })

  test('search box should be keyboard accessible (Enter submits)', async ({ page }) => {
    await page.route('**/tmdb/search/hybrid*', async route => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          results: [
            { id: 27205, title: 'Inception', media_type: 'movie', poster_path: '/ljsZTbVsrQSqZgWeep2B1QiDKuh.jpg', vote_average: 8.4 }
          ],
          total_results: 1,
          total_pages: 1
        })
      })
    })

    const openSearchButton = page.locator('button[aria-label="Open search"]').first()
    await openSearchButton.click()

    const searchInput = page.locator('input[placeholder*="Search"]').first()
    await searchInput.fill('inception')
    await page.keyboard.press('Enter')

    // Expect search results cards to render
    const card = page.locator('.group.relative.cursor-pointer, [role="button"]:has(img)').first()
    await expect(card).toBeVisible({ timeout: 10_000 })

    // Click on result card and make sure details modal opens
    await card.click()
    const closeBtn = page.locator('button[aria-label="Close modal"], button:has-text("Close")').first()
    await expect(closeBtn).toBeVisible({ timeout: 10_000 })
    await closeBtn.click()

    // Clear search using the "Close search" or clear button
    const clearBtn = page.locator('button[aria-label="Close search"], button:has(svg)').first()
    await clearBtn.click()
    await expect(searchInput).not.toBeVisible()
  })
})
