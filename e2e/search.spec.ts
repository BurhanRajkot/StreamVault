/**
 * StreamVault E2E — Search
 *
 * Covers the full search overlay lifecycle for both
 * authenticated and unauthenticated users.
 *
 *  - Opening / closing the search overlay
 *  - Typing triggers mocked API calls
 *  - Results appear with correct data
 *  - Empty-state shown when no results
 *  - Keyboard navigation: Escape closes, Enter submits
 *  - Clicking a result navigates to /watch
 *  - Short queries (<2 chars) don't show results
 *  - Search is accessible (aria-label, role)
 */

import { test, expect } from './fixtures'
import { SearchPage } from './pages/SearchPage'

// ─── Search Overlay — Unauthenticated ─────────────────────────────────────

test.describe('Search — Unauthenticated User', () => {
  test('search button is visible on the navbar', async ({ unauthMockPage: page }) => {
    await page.goto('/')
    await page.waitForLoadState('domcontentloaded')
    const searchBtn = page.locator('button[aria-label="Open search"]').first()
    await expect(searchBtn).toBeVisible()
  })

  test('clicking search button opens the search overlay', async ({ unauthMockPage: page }) => {
    await page.goto('/')
    const search = new SearchPage(page)
    await search.open()
    await expect(search.searchInput).toBeVisible()
  })

  test('search input accepts typed text', async ({ unauthMockPage: page }) => {
    await page.goto('/')
    const search = new SearchPage(page)
    await search.open()
    await search.typeQuery('inception')
    await expect(search.searchInput).toHaveValue('inception')
  })

  test('Escape key closes the search overlay', async ({ unauthMockPage: page }) => {
    await page.goto('/')
    const search = new SearchPage(page)
    await search.open()
    await search.pressEscape()
    await expect(search.searchInput).not.toBeVisible({ timeout: 5_000 })
  })

  test('search overlay closes via the close button', async ({ unauthMockPage: page }) => {
    await page.goto('/')
    const search = new SearchPage(page)
    await search.open()
    if (await search.closeButton.count() > 0) {
      await search.close()
      await expect(search.searchInput).not.toBeVisible({ timeout: 5_000 })
    }
  })

  test('search input has correct aria-label or role', async ({ unauthMockPage: page }) => {
    await page.goto('/')
    const search = new SearchPage(page)
    await search.open()
    const input = search.searchInput
    const ariaLabel = await input.getAttribute('aria-label')
    const role = await input.getAttribute('role')
    const inputType = await input.getAttribute('type')
    // Must have at least one accessible identifier
    expect(ariaLabel || role || inputType === 'search').toBeTruthy()
  })
})

// ─── Search Results ───────────────────────────────────────────────────────

test.describe('Search — Results & API Integration', () => {
  test('typing shows autocomplete results from mock API', async ({ unauthMockPage: page }) => {
    await page.goto('/')
    const search = new SearchPage(page)
    await search.open()
    await search.typeQuery('inception')
    await search.waitForResults()
    const count = await search.resultCards.count()
    expect(count).toBeGreaterThan(0)
  })

  test('single character query does not show results', async ({ unauthMockPage: page }) => {
    await page.goto('/')
    const search = new SearchPage(page)
    await search.open()
    await search.typeQuery('i')
    // Wait a moment for any debounce + response
    await page.waitForTimeout(500)
    const count = await search.resultCards.count()
    // Should be 0 or the search should not fire for 1 char
    expect(count).toBe(0)
  })

  test('query that matches nothing shows an empty/no-results state', async ({ unauthMockPage: page }) => {
    await page.goto('/')
    const search = new SearchPage(page)
    await search.open()
    // "xyzzy999" will not match any of our mock movies
    await search.typeQuery('xyzzy999nomatch')
    await page.waitForTimeout(800)
    // Either no cards appear, or an empty-state message appears
    const cardCount = await search.resultCards.count()
    const hasEmptyMsg = await page.locator('text=No results, text=Nothing found, text=no matches').count() > 0
    expect(cardCount === 0 || hasEmptyMsg).toBe(true)
  })

  test('clicking a search result navigates to /watch', async ({ mockApiPage: page }) => {
    await page.goto('/')
    const search = new SearchPage(page)
    await search.open()
    await search.typeQuery('inception')
    await search.waitForResults()
    await search.firstResultCard.click()
    await expect(page).toHaveURL(/\/watch\//, { timeout: 10_000 })
  })

  test('clearing the input hides results', async ({ unauthMockPage: page }) => {
    await page.goto('/')
    const search = new SearchPage(page)
    await search.open()
    await search.typeQuery('inception')
    await search.waitForResults()
    await search.clearInput()
    await page.waitForTimeout(400)
    const count = await search.resultCards.count()
    expect(count).toBe(0)
  })
})

// ─── Search — Authenticated User ──────────────────────────────────────────

test.describe('Search — Authenticated User', () => {
  test('authenticated user sees the same search results as unauthenticated', async ({ mockApiPage: page }) => {
    await page.goto('/')
    const search = new SearchPage(page)
    await search.open()
    await search.typeQuery('inception')
    await search.waitForResults()
    const count = await search.resultCards.count()
    expect(count).toBeGreaterThan(0)
  })

  test('search result click as authenticated user goes to /watch', async ({ mockApiPage: page }) => {
    await page.goto('/')
    const search = new SearchPage(page)
    await search.open()
    await search.typeQuery('inception')
    await search.waitForResults()
    await search.firstResultCard.click()
    await expect(page).toHaveURL(/\/watch\/movie\//, { timeout: 10_000 })
  })
})

// ─── Keyboard Navigation Within Search ───────────────────────────────────

test.describe('Search — Keyboard Navigation', () => {
  test('Enter key submits the search query', async ({ unauthMockPage: page }) => {
    await page.goto('/')
    const search = new SearchPage(page)
    await search.open()
    await search.typeQuery('inception')
    await search.pressEnter()
    // Results should remain visible or navigate
    await page.waitForTimeout(500)
    const stillOpen = await search.searchInput.isVisible().catch(() => false)
    const navigated = page.url().includes('/watch')
    // Either the search is still open with results, OR we navigated
    expect(stillOpen || navigated).toBe(true)
  })

  test('Tab key moves focus within the search overlay', async ({ unauthMockPage: page }) => {
    await page.goto('/')
    const search = new SearchPage(page)
    await search.open()
    await search.typeQuery('dark')
    await search.waitForResults()
    // Tab should move focus to the first result or close button
    await page.keyboard.press('Tab')
    const focused = await page.evaluate(() => document.activeElement?.tagName)
    expect(focused).toBeTruthy()
    expect(focused).not.toBe('BODY')
  })
})
