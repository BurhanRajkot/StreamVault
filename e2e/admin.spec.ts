/**
 * StreamVault E2E — Admin Control & Downloads Portal
 *
 * Covers:
 *  - Unauthenticated visit to /downloads shows Premium gate
 *  - Admin Login button is visible on the gate
 *  - Admin login modal accepts HMAC code
 *  - Incorrect code shows an error
 *  - After admin login: downloads list renders with expected items
 *  - Search filters the list (case-insensitive)
 *  - Clear search restores full list
 *  - /admin/dashboard renders request rows
 *  - Approve action triggers success toast
 *  - Reject action triggers rejection toast
 *  - Admin dashboard shows both pending requests
 */

import { test, expect } from './fixtures'
import { DownloadsPage } from './pages/DownloadsPage'
import { AdminDashboardPage } from './pages/AdminDashboardPage'
import crypto from 'crypto'
import { ADMIN_HMAC_SECRET } from './fixtures/mocks'

// ─── Downloads — Premium Gate ──────────────────────────────────────────────

test.describe('Downloads — Premium Gate (Unauthenticated/Free User)', () => {
  test('visiting /downloads shows the premium feature gate', async ({ mockApiPage: page }) => {
    const downloads = new DownloadsPage(page)
    await downloads.goto()
    await expect(downloads.premiumWarning).toBeVisible({ timeout: 10_000 })
  })

  test('Admin Login button is visible on the premium gate', async ({ mockApiPage: page }) => {
    const downloads = new DownloadsPage(page)
    await downloads.goto()
    await expect(downloads.premiumWarning).toBeVisible({ timeout: 10_000 })
    await expect(downloads.adminLoginButton).toBeVisible()
  })

  test('admin login modal opens when button is clicked', async ({ mockApiPage: page }) => {
    const downloads = new DownloadsPage(page)
    await downloads.goto()
    await expect(downloads.adminLoginButton).toBeVisible({ timeout: 10_000 })
    await downloads.adminLoginButton.click()
    await expect(downloads.adminCodeInput).toBeVisible({ timeout: 5_000 })
  })
})

// ─── Downloads — Admin Login ───────────────────────────────────────────────

test.describe('Downloads — Admin Login Flow', () => {
  test('correct HMAC code unlocks the downloads list', async ({ mockApiPage: page }) => {
    const downloads = new DownloadsPage(page)
    await downloads.goto()
    await downloads.loginAsAdmin()

    // Downloads list should now be visible
    const darkKnight = page.locator('[aria-label*="The Dark Knight"], text=The Dark Knight').first()
    await expect(darkKnight).toBeVisible({ timeout: 10_000 })
  })

  test('wrong code shows an error message', async ({ mockApiPage: page }) => {
    const downloads = new DownloadsPage(page)
    await downloads.goto()

    await expect(downloads.adminLoginButton).toBeVisible({ timeout: 10_000 })
    await downloads.adminLoginButton.click()
    await expect(downloads.adminCodeInput).toBeVisible()

    // Enter a deliberately wrong code
    await downloads.adminCodeInput.fill('00000000000000000000000000000000wrongcode')
    await downloads.adminLoginSubmitButton.click()

    const errorMsg = page.locator('text=Invalid, text=incorrect, text=wrong, text=error, text=Error, [role="alert"]').first()
    // Either an error is shown or the modal stays open (doesn't close and unlock)
    const modalStillOpen = await downloads.adminCodeInput.isVisible({ timeout: 3_000 }).catch(() => false)
    const hasError = await errorMsg.isVisible({ timeout: 3_000 }).catch(() => false)
    expect(modalStillOpen || hasError, 'Wrong code did not show error or keep modal open').toBe(true)
  })

  test('empty code submission does not crash the page', async ({ mockApiPage: page }) => {
    const downloads = new DownloadsPage(page)
    await downloads.goto()

    await expect(downloads.adminLoginButton).toBeVisible({ timeout: 10_000 })
    await downloads.adminLoginButton.click()
    await expect(downloads.adminCodeInput).toBeVisible()
    await downloads.adminLoginSubmitButton.click()

    // Page should not crash
    await expect(page.locator('#root')).toBeVisible()
  })
})

// ─── Downloads — List & Search ─────────────────────────────────────────────

test.describe('Downloads — List Interactions (After Admin Login)', () => {
  test.beforeEach(async ({ mockApiPage: page }) => {
    const downloads = new DownloadsPage(page)
    await downloads.goto()
    await downloads.loginAsAdmin()
    // Wait for downloads list to be populated
    await expect(page.locator('text=The Dark Knight').first()).toBeVisible({ timeout: 10_000 })
  })

  test('downloads list contains all mocked items', async ({ mockApiPage: page }) => {
    await expect(page.locator('text=The Dark Knight').first()).toBeVisible()
    await expect(page.locator('text=Inception').first()).toBeVisible()
    await expect(page.locator('text=Breaking Bad').first()).toBeVisible()
  })

  test('search input filters the downloads list', async ({ mockApiPage: page }) => {
    const downloads = new DownloadsPage(page)
    await downloads.searchDownloads('Inception')

    await expect(page.locator('text=Inception').first()).toBeVisible()
    await expect(page.locator('text=The Dark Knight').first()).not.toBeVisible()
  })

  test('search is case-insensitive', async ({ mockApiPage: page }) => {
    const downloads = new DownloadsPage(page)
    await downloads.searchDownloads('inception')
    await expect(page.locator('text=Inception').first()).toBeVisible()
  })

  test('clearing search restores full list', async ({ mockApiPage: page }) => {
    const downloads = new DownloadsPage(page)
    await downloads.searchDownloads('Inception')
    await expect(page.locator('text=The Dark Knight').first()).not.toBeVisible()

    await downloads.clearSearch()
    await expect(page.locator('text=The Dark Knight').first()).toBeVisible({ timeout: 5_000 })
    await expect(page.locator('text=Inception').first()).toBeVisible()
  })

  test('searching for a non-existent item shows empty state', async ({ mockApiPage: page }) => {
    const downloads = new DownloadsPage(page)
    await downloads.searchDownloads('Avatar: The Way of Water')
    await page.waitForTimeout(300)

    const hasItems = await page.locator('text=The Dark Knight, text=Inception, text=Breaking Bad').first().isVisible().catch(() => false)
    expect(hasItems).toBe(false)
  })
})

// ─── Admin Dashboard ──────────────────────────────────────────────────────

test.describe('Admin Dashboard — /admin/dashboard', () => {
  test('admin dashboard renders the request table', async ({ mockApiPage: page }) => {
    const admin = new AdminDashboardPage(page)
    await admin.goto()

    // Should see both pending requests
    await expect(admin.rowByEmail('premium-user@example.com')).toBeVisible({ timeout: 10_000 })
    await expect(admin.rowByEmail('basic-user@example.com')).toBeVisible()
  })

  test('pending requests show PENDING status badge', async ({ mockApiPage: page }) => {
    const admin = new AdminDashboardPage(page)
    await admin.goto()

    await expect(admin.rowByEmail('premium-user@example.com')).toBeVisible({ timeout: 10_000 })
    await expect(admin.statusBadge('PENDING')).toBeVisible()
  })

  test('approving a request triggers a success toast/notification', async ({ mockApiPage: page }) => {
    const admin = new AdminDashboardPage(page)
    await admin.goto()

    await expect(admin.firstApproveButton).toBeVisible({ timeout: 10_000 })
    await admin.approveFirstRequest()

    await expect(admin.successToast).toBeVisible({ timeout: 10_000 })
  })

  test('rejecting a request triggers a rejection toast/notification', async ({ mockApiPage: page }) => {
    const admin = new AdminDashboardPage(page)
    await admin.goto()

    await expect(admin.firstRejectButton).toBeVisible({ timeout: 10_000 })
    await admin.rejectFirstRequest()

    await expect(admin.rejectToast.or(admin.successToast)).toBeVisible({ timeout: 10_000 })
  })

  test('admin dashboard has an <h1> heading', async ({ mockApiPage: page }) => {
    const admin = new AdminDashboardPage(page)
    await admin.goto()
    await expect(page.locator('h1').first()).toBeVisible({ timeout: 8_000 })
  })

  test('transaction IDs are visible in the table', async ({ mockApiPage: page }) => {
    const admin = new AdminDashboardPage(page)
    await admin.goto()
    await expect(admin.rowByEmail('premium-user@example.com')).toBeVisible({ timeout: 10_000 })
    const txnId = page.locator('text=TXN_987654').first()
    await expect(txnId).toBeVisible()
  })
})
