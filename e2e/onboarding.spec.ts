import { test, expect } from '@playwright/test'

test.describe('CineMatch Onboarding Flow', () => {
  test.beforeEach(async ({ context }) => {
    // Dismiss the disclaimer modal globally
    await context.addInitScript(() => {
      window.sessionStorage.setItem('disclaimerAccepted', 'true')
      window.localStorage.setItem('e2e_mock_authenticated', 'true')
      window.localStorage.removeItem('cinematch_onboarded_auth0|mock-user-123')
    })
  })

  test('should guide a new authenticated user through CineMatch onboarding', async ({ page }) => {
    // Intercept profile call to declare this as a new user
    await page.route('**/recommendations/profile', async route => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ isNewUser: true })
      })
    })

    // Mock onboarding submit endpoint
    await page.route('**/recommendations/onboarding', async route => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ success: true })
      })
    })

    // Navigate to homepage
    await page.goto('/')

    // Onboarding portal should be visible
    const portal = page.locator('span:has-text("CineMatch")').first()
    await expect(portal).toBeVisible({ timeout: 15000 })

    // Progress text starts at "Select 5 more to continue"
    const barText = page.locator('text=Select 5 more to continue')
    await expect(barText).toBeVisible()

    // Find curation movie selection buttons
    const curationMovies = page.locator('button[aria-label^="Select "]')
    const count = await curationMovies.count()
    expect(count).toBeGreaterThanOrEqual(5)

    // Click 5 curatable movies
    for (let i = 0; i < 5; i++) {
      await curationMovies.nth(i).click()
    }

    // Verify progress updates to "Awesome taste! Ready to continue."
    const readyText = page.locator('text=Awesome taste! Ready to continue.')
    await expect(readyText).toBeVisible()

    // Click "Let's go"
    const submitBtn = page.locator('button:has-text("Let\'s go")')
    await expect(submitBtn).toBeEnabled()
    await submitBtn.click()

    // Success screen appears
    const successHeader = page.locator('h2:has-text("Personalizing your experience...")')
    await expect(successHeader).toBeVisible({ timeout: 10000 })

    // Wait for the portal overlay to unmount
    await expect(portal).not.toBeVisible({ timeout: 15000 })
  })
})
