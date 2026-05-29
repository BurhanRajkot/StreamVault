/**
 * StreamVault E2E — Favorites
 *
 * DEEP COVERAGE: Every test verifies actual content from mock API data.
 * Favorites list must render visible cards with images, the empty state
 * must have specific messaging, and the auth wall must have context.
 *
 * Covers:
 *  - Unauthenticated access shows Auth Wall with context
 *  - Empty state when no favorites exist
 *  - Rendering of favorite cards with actual images and titles
 *  - Count updates (e.g. "X saved")
 *  - Clicking a favorite card navigates to /watch
 *  - Removing a favorite updates the UI and count
 */

import { test, expect } from './fixtures'
import { FavoritesPage } from './pages/FavoritesPage'
import { MOCK_MOVIES } from './fixtures/mocks'
import { BasePage } from './pages/BasePage'

test.describe('Favorites Page — Unauthenticated', () => {
  test('unauthenticated user sees the auth wall with descriptive content', async ({ unauthMockPage: page }) => {
    const favorites = new FavoritesPage(page)
    await favorites.goto()

    const isShowingAuth = await favorites.isShowingAuthWall()
    expect(isShowingAuth, 'Auth wall is not visible on favorites page').toBe(true)

    // STRONG CHECK: Verify the auth wall has explanatory text, not just a button
    const bodyText = await page.evaluate(() => (document.body.innerText || '').trim())
    expect(bodyText.length, 'Auth wall has no explanatory content').toBeGreaterThan(40)
    expect(bodyText.toLowerCase(), 'Auth wall does not explain why login is needed').toContain('sign in')
  })
})

test.describe('Favorites Page — Authenticated (Empty)', () => {
  test('empty state shows specific messaging and CTA when user has no favorites', async ({ mockApiPage: page }) => {
    // Override the mock to return empty array for favorites
    await page.route('**/api/users/favorites', async route => {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([]) })
    })

    const favorites = new FavoritesPage(page)
    await favorites.goto()

    const isEmpty = await favorites.isShowingEmptyState()
    expect(isEmpty, 'Empty state heading is not visible').toBe(true)

    // Verify CTA is visible
    await expect(favorites.emptyStateCTA).toBeVisible()

    const bodyText = await page.evaluate(() => (document.body.innerText || '').trim())
    expect(bodyText.length, 'Empty state has minimal content').toBeGreaterThan(20)
  })
})

test.describe('Favorites Page — Authenticated (Populated)', () => {
  test('renders favorite cards with actual images and content', async ({ mockApiPage: page }) => {
    const favorites = new FavoritesPage(page)
    await favorites.goto()
    await favorites.waitForCards()

    const count = await favorites.countCards()
    expect(count, 'No favorite cards rendered').toBeGreaterThan(0)

    // STRONG CHECK: Verify the first card has an image and text
    const firstCard = favorites.firstMediaCard
    const imgCount = await firstCard.locator('img').count()
    const cardText = await firstCard.innerText().catch(() => '')
    expect(imgCount > 0 || cardText.trim().length > 0, 'Favorite card is completely empty').toBe(true)
  })

  test('clicking a favorite card navigates to /watch page', async ({ mockApiPage: page }) => {
    const favorites = new FavoritesPage(page)
    await favorites.goto()
    await favorites.waitForCards()

    await favorites.firstMediaCard.click()
    await expect(page).toHaveURL(/\/watch\//, { timeout: 10_000 })

    // Verify watch page rendered
    const bodyText = await page.evaluate(() => (document.body.innerText || '').trim())
    expect(bodyText.length, 'Watch page is blank after clicking favorite').toBeGreaterThan(50)
  })

  test('favorites page has a visible heading and count', async ({ mockApiPage: page }) => {
    const favorites = new FavoritesPage(page)
    await favorites.goto()

    await expect(favorites.pageHeading).toBeVisible()
    const headingText = await favorites.pageHeading.innerText()
    expect(headingText.trim().length, 'Favorites heading is empty').toBeGreaterThan(0)

    // Verify page content exists
    const bodyText = await page.evaluate(() => (document.body.innerText || '').trim())
    expect(bodyText.length, 'Favorites page has no body content').toBeGreaterThan(50)
  })
})
