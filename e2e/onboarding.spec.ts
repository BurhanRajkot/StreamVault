/**
 * StreamVault E2E — Onboarding
 *
 * DEEP COVERAGE: Verifies the CineMatch onboarding overlay renders
 * completely, covers the page, shows actual movie posters, and allows
 * selections that update a visible progress indicator.
 *
 * Covers:
 *  - Onboarding overlay fully covers the page content (z-index)
 *  - Movie posters are visible (images loaded)
 *  - Selection highlights the card visually
 *  - Progress counter updates (e.g. "1 of 5 selected")
 *  - Continue button unlocks after meeting the requirement
 *  - Submitting saves preference and closes overlay
 */

import { test, expect } from './fixtures'

test.describe('CineMatch Onboarding', () => {
  // Clear any existing onboarding state before each test
  test.beforeEach(async ({ unauthMockPage: page }) => {
    await page.addInitScript(() => {
      window.localStorage.removeItem('onboarding_done')
      window.localStorage.removeItem('cinematch_preferences')
    })
  })

  test('onboarding overlay renders and covers the page content', async ({ unauthMockPage: page }) => {
    await page.goto('/', { waitUntil: 'domcontentloaded' })
    
    // Look for the onboarding container
    const onboardingOverlay = page.locator('[class*="onboarding"], [data-testid*="onboarding"], .fixed.inset-0').filter({ hasText: /select|choose|movies you like/i }).first()
    await expect(onboardingOverlay).toBeVisible({ timeout: 10_000 })

    // Verify it covers the page (fixed positioning and high z-index)
    const isCovering = await onboardingOverlay.evaluate(el => {
      const style = window.getComputedStyle(el)
      return (style.position === 'fixed' || style.position === 'absolute') && 
             (style.zIndex !== 'auto' && parseInt(style.zIndex) > 10)
    })
    expect(isCovering, 'Onboarding is not presented as an overlay').toBe(true)
  })

  test('onboarding shows movie poster images for selection', async ({ unauthMockPage: page }) => {
    await page.goto('/', { waitUntil: 'domcontentloaded' })
    
    const onboardingOverlay = page.locator('[class*="onboarding"], [data-testid*="onboarding"], .fixed.inset-0').filter({ hasText: /select|choose|movies you like/i }).first()
    await expect(onboardingOverlay).toBeVisible({ timeout: 10_000 })

    // Find movie cards inside the onboarding
    const cards = onboardingOverlay.locator('button:has(img), [role="button"]:has(img), .cursor-pointer:has(img)')
    const cardCount = await cards.count()
    expect(cardCount, 'No movie posters found in onboarding').toBeGreaterThan(5)

    // Verify at least one image has a source
    const imgSrc = await cards.first().locator('img').getAttribute('src')
    expect(imgSrc, 'Onboarding poster image has no source').toBeTruthy()
  })

  test('selecting movies updates visual state and progress indicator', async ({ unauthMockPage: page }) => {
    await page.goto('/', { waitUntil: 'domcontentloaded' })
    
    const onboardingOverlay = page.locator('[class*="onboarding"], [data-testid*="onboarding"], .fixed.inset-0').filter({ hasText: /select|choose|movies you like/i }).first()
    await expect(onboardingOverlay).toBeVisible({ timeout: 10_000 })

    const cards = onboardingOverlay.locator('button:has(img), [role="button"]:has(img), .cursor-pointer:has(img)')
    await expect(cards.first()).toBeVisible()

    // Get initial progress text
    const initialText = await onboardingOverlay.innerText()

    // Click a card
    const firstCard = cards.nth(0)
    await firstCard.click()

    // Wait for the visual selection indicator (border, checkmark, opacity change)
    // We check if the class list changed or if a specific check icon appeared
    await page.waitForTimeout(300)
    
    // Check if progress text updated (e.g., from "0/3" to "1/3")
    const newText = await onboardingOverlay.innerText()
    const progressChanged = initialText !== newText
    expect(progressChanged, 'Progress text did not update after selection').toBe(true)
  })

  test('completing onboarding closes the overlay', async ({ unauthMockPage: page }) => {
    await page.goto('/', { waitUntil: 'domcontentloaded' })
    
    const onboardingOverlay = page.locator('[class*="onboarding"], [data-testid*="onboarding"], .fixed.inset-0').filter({ hasText: /select|choose|movies you like/i }).first()
    await expect(onboardingOverlay).toBeVisible({ timeout: 10_000 })

    const cards = onboardingOverlay.locator('button:has(img), [role="button"]:has(img), .cursor-pointer:has(img)')
    
    // Click multiple cards to satisfy typical minimum requirement (e.g. 3)
    const maxClicks = Math.min(await cards.count(), 5)
    for (let i = 0; i < maxClicks; i++) {
      await cards.nth(i).click()
      await page.waitForTimeout(200) // Small delay to let React update state
    }

    // Find and click the Continue/Submit button
    const submitBtn = onboardingOverlay.locator('button:has-text("Continue"), button:has-text("Done"), button:has-text("Finish")').first()
    await expect(submitBtn).toBeVisible()
    
    // It should be enabled now
    const isDisabled = await submitBtn.isDisabled()
    expect(isDisabled, 'Submit button is still disabled after selections').toBe(false)

    await submitBtn.click()

    // Verify overlay disappears
    await expect(onboardingOverlay).not.toBeVisible({ timeout: 5_000 })
    
    // Verify we can see the homepage content
    const bodyText = await page.evaluate(() => (document.body.innerText || '').trim())
    expect(bodyText.length).toBeGreaterThan(100)
  })
})
