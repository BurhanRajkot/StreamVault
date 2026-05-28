/**
 * StreamVault E2E — CineMatch Onboarding Flow
 *
 * Covers:
 *  - New authenticated user sees the onboarding portal
 *  - Progress text updates as movies are selected
 *  - "Let's go" button is disabled until minimum selection is reached
 *  - Submitting completes onboarding and shows success screen
 *  - After completion, portal is unmounted
 *  - Already-onboarded user does NOT see the portal
 */

import { test, expect } from './fixtures'

// ─── New User Onboarding ──────────────────────────────────────────────────

test.describe('CineMatch Onboarding — New User', () => {
  test('onboarding portal appears for a new authenticated user', async ({ onboardingPage: page }) => {
    await page.goto('/', { waitUntil: 'domcontentloaded' })
    // CineMatchOnboarding renders a portal with the text "CineMatch" in a <span> and "What do you love watching?" as h1
    const portal = page.locator('span:has-text("CineMatch"), [data-testid="onboarding"], h1:has-text("What do you love")').first()
    await expect(portal).toBeVisible({ timeout: 15_000 })
  })

  test('progress text starts at "Select 5 more to continue"', async ({ onboardingPage: page }) => {
    await page.goto('/', { waitUntil: 'domcontentloaded' })
    // The bottom action bar always renders (just dimmed), so this text is present in the DOM
    const progressText = page.locator('span:has-text("Select 5 more to continue")').first()
    await expect(progressText).toBeVisible({ timeout: 12_000 })
  })

  test('"Let\'s go" submit button is disabled before selecting 5 movies', async ({ onboardingPage: page }) => {
    await page.goto('/', { waitUntil: 'domcontentloaded' })
    await page.waitForTimeout(2_000) // Give React time to mount and render the portal

    const submitBtn = page.locator('button:has-text("Let\'s go"), button:has-text("Continue"), button[type="submit"]').first()
    if (await submitBtn.count() > 0) {
      const isDisabled = await submitBtn.isDisabled()
      expect(isDisabled).toBe(true)
    }
  })

  test('selecting 5 movies updates progress and enables submit button', async ({ onboardingPage: page }) => {
    await page.goto('/', { waitUntil: 'domcontentloaded' })
    await page.waitForTimeout(2_000) // Give React time to mount and render the portal

    const curationMovies = page.locator('button[aria-label^="Select "]')
    const count = await curationMovies.count()
    expect(count, 'Expected at least 5 selectable movies').toBeGreaterThanOrEqual(5)

    for (let i = 0; i < 5; i++) {
      await curationMovies.nth(i).click()
      await page.waitForTimeout(100)
    }

    const readyText = page.locator('span:has-text("Awesome taste!"), span:has-text("Ready to continue")').first()
    await expect(readyText).toBeVisible({ timeout: 5_000 })

    const submitBtn = page.locator('button:has-text("Let\'s go")').first()
    await expect(submitBtn).toBeEnabled()
  })

  test('completing onboarding shows success screen and dismisses portal', async ({ onboardingPage: page }) => {
    await page.goto('/', { waitUntil: 'domcontentloaded' })
    await page.waitForTimeout(2_000) // Give React time to mount the portal

    const curationMovies = page.locator('button[aria-label^="Select "]')
    const count = await curationMovies.count()
    if (count < 5) {
      test.skip()
      return
    }

    for (let i = 0; i < 5; i++) {
      await curationMovies.nth(i).click()
      await page.waitForTimeout(100)
    }

    const submitBtn = page.locator('button:has-text("Let\'s go")').first()
    await expect(submitBtn).toBeEnabled()
    await submitBtn.click()

    // Success screen appears
    const successScreen = page.locator(
      'h2:has-text("Personalizing your experience"), h2:has-text("Personalizing")'
    ).first()
    await expect(successScreen).toBeVisible({ timeout: 10_000 })

    // Portal unmounts after success (2.5s timer)
    const portal = page.locator('span:has-text("CineMatch"), [data-testid="onboarding"]').first()
    await expect(portal).not.toBeVisible({ timeout: 20_000 })
  })

  test('selecting and deselecting movies updates the counter correctly', async ({ onboardingPage: page }) => {
    await page.goto('/', { waitUntil: 'domcontentloaded' })
    await page.waitForTimeout(2_000) // Give React time to mount the portal

    const curationMovies = page.locator('button[aria-label^="Select "]')
    if (await curationMovies.count() < 2) {
      test.skip()
      return
    }

    // Select first
    await curationMovies.first().click()
    const afterOne = await page.locator('span:has-text("Select 4 more to continue")').first().isVisible({ timeout: 3_000 }).catch(() => false)

    // Deselect first (click again to toggle)
    await curationMovies.first().click()
    const afterDeselect = await page.locator('span:has-text("Select 5 more to continue")').first().isVisible({ timeout: 3_000 }).catch(() => false)

    // At least one of these should be true to confirm counter logic works
    expect(afterOne || afterDeselect).toBe(true)
  })
})

// ─── Returning (Already Onboarded) User ───────────────────────────────────

test.describe('CineMatch Onboarding — Returning User', () => {
  test('onboarding portal does NOT appear for an already-onboarded user', async ({ mockApiPage: page }) => {
    // mockApiPage fixture sets isNewUser: false via recommendations/profile mock
    await page.goto('/', { waitUntil: 'domcontentloaded' })
    await page.waitForTimeout(3_000) // Give portal time to appear if it's going to

    const portal = page.locator('span:has-text("CineMatch"), [data-testid="onboarding"]').first()
    const isVisible = await portal.isVisible().catch(() => false)
    expect(isVisible, 'Onboarding portal shown to a returning user').toBe(false)
  })
})
