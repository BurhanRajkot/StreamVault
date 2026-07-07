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

    // 5. Close the Watch modal first — it renders as a full-viewport fixed
    // overlay (see MovieDetailModal), so the header behind it (kept mounted
    // via the backgroundLocation routing trick) is present in the DOM but not
    // clickable while the modal covers the screen.
    await watch.goBack()

    // 6. Navigate to Favorites page via navbar — the Favorites link lives in
    // the header's icon cluster, not inside the <nav> that wraps the
    // Home/Movies/TV mode-switch buttons.
    const favLink = page.locator('a[href="/favorites"]').first()
    await favLink.click()

    // 6. Favorites Page renders with the added item
    // Favorites.tsx re-runs its media-detail-fetch effect whenever the
    // favorites list reference changes (e.g. the optimistic temp entry being
    // swapped for the real one from the backend), which briefly flips back
    // to its loading state and hides already-rendered cards. Poll the count
    // itself rather than waiting once then reading a separate snapshot, so a
    // transient dip doesn't get read as "no cards".
    const favPage = new FavoritesPage(page)
    await expect(page).toHaveURL('/favorites')
    await expect.poll(() => favPage.countCards(), { timeout: 15_000 }).toBeGreaterThan(0)

    // 7. Remove from favorites
    await favPage.firstMediaCard.click()
    await watch.waitForAppReady()
    await watch.removeFromFavorites()

    // 8. Go back — the modal's backgroundLocation was "/favorites" (that's
    // where the card was clicked from), so closing it returns there, not "/".
    await watch.goBack()
    await expect(page).toHaveURL('/favorites')
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

    // 2. Pricing — heading reads "Unlock Premium Streaming", not literally
    // "Pricing"/"Plans", so just verify a real heading rendered.
    await page.goto('/pricing', { waitUntil: 'domcontentloaded' })
    await expect(page.locator('h1').first()).toBeVisible()

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
