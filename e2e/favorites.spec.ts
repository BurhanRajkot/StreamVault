import { test, expect } from '@playwright/test'

test.describe('Favorites Watchlist Flow', () => {
  let mockFavorites: Array<{ id: string; tmdbId: number; mediaType: string }> = []

  test.beforeEach(async ({ context, page }) => {
    mockFavorites = []

    // Dismiss the disclaimer modal globally
    await context.addInitScript(() => {
      try {
        window.sessionStorage.setItem('disclaimerAccepted', 'true')
        window.localStorage.removeItem('e2e_mock_authenticated')
        window.localStorage.removeItem('e2e_mock_user')
      } catch (e) {}
    })

    // Mock favorites database endpoint
    await page.route('**/favorites', async route => {
      if (route.request().method() === 'GET') {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify(mockFavorites)
        })
      } else if (route.request().method() === 'POST') {
        const payload = JSON.parse(route.request().postData() || '{}')
        const item = { id: `fav-${payload.tmdbId}`, tmdbId: payload.tmdbId, mediaType: payload.mediaType }
        mockFavorites.push(item)
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify(item)
        })
      }
    })

    await page.route('**/favorites/*', async route => {
      if (route.request().method() === 'DELETE') {
        const url = route.request().url()
        const id = url.split('/').pop()
        mockFavorites = mockFavorites.filter(f => f.id !== id)
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ success: true })
        })
      }
    })

    // Mock recommendations profile to avoid onboarding popup interfering
    await page.route('**/recommendations/profile', async route => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ isNewUser: false })
      })
    })

    // Mock TMDB discover/trending and details
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
          overview: 'Cobb steals information from targets by entering their dreams.',
          poster_path: '/ljsZTbVsrQSqZgWeep2B1QiDKuh.jpg',
          vote_average: 8.4,
          release_date: '2010-07-15',
          genres: [{ id: 28, name: 'Action' }]
        })
      })
    })
  })

  test('should redirect unauthenticated users to login and then show empty favorites', async ({ page }) => {
    // Navigate to favorites unauthenticated
    await page.goto('/favorites')

    // Wait for the mock auto-login to trigger and redirect
    const emptyHeader = page.locator('h3:has-text("Nothing saved yet")')
    await expect(emptyHeader).toBeVisible({ timeout: 15000 })
  })

  test('should allow user to add and remove a movie from favorites', async ({ page }) => {
    // Navigate to origin page first
    await page.goto('/')
    await page.waitForLoadState('networkidle')

    // Authenticate user directly after origin navigation
    await page.evaluate(() => {
      window.localStorage.setItem('e2e_mock_authenticated', 'true')
    })
    await page.reload()
    await page.waitForLoadState('networkidle')

    // Click on the movie card (Inception) to open details modal
    const movieCard = page.locator('.group.relative.cursor-pointer, [role="button"]:has(img)').first()
    await expect(movieCard).toBeVisible()
    await movieCard.click()

    // Add to favorites
    const favBtn = page.locator('button[aria-label="Add to favorites"]')
    await expect(favBtn).toBeVisible()
    await favBtn.click()

    // Verify button text changes to "Remove from favorites"
    const unfavBtn = page.locator('button[aria-label="Remove from favorites"]')
    await expect(unfavBtn).toBeVisible()

    // Navigate to /favorites and verify movie card is shown
    await page.goto('/favorites')
    const favCard = page.locator('.group.relative.cursor-pointer, [role="button"]:has(img)').first()
    await expect(favCard).toBeVisible({ timeout: 10000 })

    // Open detail modal from favorites page
    await favCard.click()

    // Remove from favorites
    const removeBtn = page.locator('button[aria-label="Remove from favorites"]')
    await expect(removeBtn).toBeVisible()
    await removeBtn.click()

    // Close details modal
    const closeBtn = page.locator('button:has-text("Back"), button:has-text("Close")').first()
    await closeBtn.click()

    // Verify page displays empty state again
    const emptyHeader = page.locator('h3:has-text("Nothing saved yet")')
    await expect(emptyHeader).toBeVisible({ timeout: 10000 })
  })
})
