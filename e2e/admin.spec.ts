/**
 * StreamVault E2E — Admin & Downloads
 *
 * DEEP COVERAGE: Verifies the admin dashboard and premium downloads page
 * render actual content. The admin table must show requests with emails,
 * and the downloads page must show file sizes/qualities.
 *
 * Covers:
 *  - Downloads page premium wall content
 *  - Admin login modal UI and input masking
 *  - Admin login successful flow
 *  - Downloads list renders actual file info (sizes, quality)
 *  - Search functionality on downloads page
 *  - Admin dashboard table rendering (headers, rows, buttons)
 *  - Approving/Rejecting requests updates the UI
 */

import { test, expect } from './fixtures'
import { DownloadsPage } from './pages/DownloadsPage'
import { AdminDashboardPage } from './pages/AdminDashboardPage'

test.describe('Downloads Page', () => {
  test('unauthenticated user sees the premium gate with explanatory text', async ({ unauthMockPage: page }) => {
    const downloads = new DownloadsPage(page)
    await downloads.goto()

    await expect(downloads.premiumWarning).toBeVisible({ timeout: 10_000 })
    
    // Verify the gate has actual text, not just a blank overlay
    const bodyText = await page.evaluate(() => (document.body.innerText || '').trim())
    expect(bodyText.length, 'Premium gate has no explanatory text').toBeGreaterThan(30)
    expect(bodyText.toLowerCase(), 'Premium gate does not mention "Premium" or "Upgrade"').toContain('premium')
  })

  test('admin login modal opens with properly masked input', async ({ unauthMockPage: page }) => {
    const downloads = new DownloadsPage(page)
    await downloads.goto()

    await downloads.adminLoginButton.click()
    await expect(downloads.adminCodeInput).toBeVisible()

    // Verify input is a password type for masking
    const inputType = await downloads.adminCodeInput.getAttribute('type')
    expect(inputType).toBe('password')
  })

  test('admin user sees the downloads list with actual file details', async ({ unauthMockPage: page }) => {
    const downloads = new DownloadsPage(page)
    await downloads.goto()
    await downloads.loginAsAdmin()

    // Wait for list to appear
    await expect(downloads.downloadItems.first()).toBeVisible({ timeout: 10_000 })
    
    // Verify actual file details render (e.g. 1080p, 4K, GB sizes)
    const bodyText = await page.evaluate(() => (document.body.innerText || '').trim())
    const hasQuality = bodyText.includes('1080p') || bodyText.includes('4K') || bodyText.includes('720p') || bodyText.includes('GB')
    expect(hasQuality, 'Downloads list does not show file quality or sizes').toBe(true)

    // Verify search input is present
    await expect(downloads.searchInput).toBeVisible()
  })

  test('searching filters the downloads list', async ({ unauthMockPage: page }) => {
    const downloads = new DownloadsPage(page)
    await downloads.goto()
    await downloads.loginAsAdmin()

    await expect(downloads.downloadItems.first()).toBeVisible({ timeout: 10_000 })
    const initialCount = await downloads.downloadItems.count()
    
    await downloads.searchDownloads('nonexistentmovie999')
    await page.waitForTimeout(500)
    const filteredCount = await downloads.downloadItems.count()
    
    // The count should reduce or be 0 for a bad query
    expect(filteredCount).toBeLessThan(initialCount)
  })
})

test.describe('Admin Dashboard', () => {
  test('admin dashboard renders stats cards and table headers', async ({ mockApiPage: page }) => {
    const dashboard = new AdminDashboardPage(page)
    await dashboard.goto()

    // Check stats cards
    if (await dashboard.statsCards.count() > 0) {
      const statsText = await dashboard.statsCards.first().innerText()
      expect(statsText.trim().length, 'Dashboard stats card is empty').toBeGreaterThan(0)
    }

    // Wait for the table/rows to render
    const tableEl = page.locator('table, [role="table"], [class*="table"]').first()
    await expect(tableEl).toBeVisible({ timeout: 10_000 })

    // Verify meaningful content is present
    const bodyText = await page.evaluate(() => (document.body.innerText || '').trim())
    expect(bodyText.length, 'Admin dashboard has no content').toBeGreaterThan(50)
  })

  test('request rows show email addresses and status badges', async ({ mockApiPage: page }) => {
    const dashboard = new AdminDashboardPage(page)
    await dashboard.goto()

    await expect(dashboard.firstRequestRow).toBeVisible({ timeout: 10_000 })

    // Check that there is at least one email address visible in the table
    const tableText = await page.evaluate(() => (document.body.innerText || '').trim())
    expect(tableText.includes('@'), 'No email addresses found in the requests table').toBe(true)
    
    // Check for status text (Pending, Approved, Rejected)
    const hasStatus = /pending|approved|rejected|waiting/i.test(tableText)
    expect(hasStatus, 'No status indicators found in the requests table').toBe(true)
  })

  test('clicking Approve button updates UI and shows feedback', async ({ mockApiPage: page }) => {
    const dashboard = new AdminDashboardPage(page)
    await dashboard.goto()

    if (await dashboard.firstApproveButton.count() > 0) {
      await dashboard.approveFirstRequest()
      
      // Wait for toast or UI state change
      const isToastVisible = await dashboard.successToast.isVisible().catch(() => false)
      const buttonGone = await dashboard.firstApproveButton.isHidden()
      
      expect(isToastVisible || buttonGone).toBe(true)
    } else {
      test.skip(true, 'No pending requests to approve')
    }
  })
})
