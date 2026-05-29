/**
 * StreamVault E2E — Navigation Flows
 *
 * Verifies complex multi-page journeys and state persistence.
 *
 * Covers:
 *  - Full journey: Home -> Search -> Watch -> Favorites -> Remove -> Home
 *  - Deep linking directly to pages
 *  - Browser history (Back/Forward)
 */

import { test, expect } from './fixtures'
import { HomePage } from './pages/HomePage'
import { SearchPage } from './pages/SearchPage'
import { WatchPage } from './pages/WatchPage'
import { FavoritesPage } from './pages/FavoritesPage'
import { MOCK_MOVIES } from './fixtures/mocks'

test.describe('End-to-End User Journeys', () => {
  test('Journey: Search -> Watch -> Add Favorite -> View Favorites', async ({ mockApiPage: page }) => {
    // 1. Start at Home
    await page.goto('/')
    const home = new HomePage(page)
    await home.waitForAppReady()

    // 2. Search for a movie
    const search = new SearchPage(page)
    await search.open()
    await search.typeQuery(MOCK_MOVIES.inception.title)
    await search.waitForResults()
    await search.firstResultCard.click()

    // 3. Watch Page renders
    const watch = new WatchPage(page)
    await expect(page).toHaveURL(/\/watch\//)
    await watch.assertMovieContentVisible(MOCK_MOVIES.inception.title)

    // 4. Add to favorites
    await watch.addToFavorites()

    // 5. Navigate to Favorites page via navbar
    const favLink = page.locator('nav a[href="/favorites"]').first()
    await favLink.click()

    // 6. Favorites Page renders with the added item
    const favPage = new FavoritesPage(page)
    await expect(page).toHaveURL('/favorites')
    await favPage.waitForCards()
    const count = await favPage.countCards()
    expect(count).toBeGreaterThan(0)

    // 7. Remove from favorites
    await favPage.firstMediaCard.click()
    await watch.waitForAppReady()
    await watch.removeFromFavorites()

    // 8. Go back to Home
    await watch.goBack()
    await expect(page).toHaveURL('/')
  })

  test('Deep linking: loading Watch page directly works', async ({ mockApiPage: page }) => {
    const watch = new WatchPage(page)
    const mockId = `${MOCK_MOVIES.inception.id}-test`
    await watch.goto('movie', mockId)
    
    // Page should render content directly without going through home
    await watch.assertMovieContentVisible(MOCK_MOVIES.inception.title)
  })

  test('Browser Back/Forward navigation works', async ({ unauthMockPage: page }) => {
    // 1. Home
    await page.goto('/')
    const home = new HomePage(page)
    await home.waitForAppReady()

    // 2. Pricing
    await page.goto('/pricing', { waitUntil: 'domcontentloaded' })
    await expect(page.locator('h1:has-text("Pricing"), h1:has-text("Plans")').first()).toBeVisible()

    // 3. Back to Home
    await page.goBack()
    await expect(page).toHaveURL('/')
    await home.assertNotBlankScreen()

    // 4. Forward to Pricing
    await page.goForward()
    await expect(page).toHaveURL('/pricing')
    await expect(page.locator('h1')).toBeVisible()
  })
})
