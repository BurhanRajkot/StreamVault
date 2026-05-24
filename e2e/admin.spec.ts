import { test, expect } from '@playwright/test'
import crypto from 'crypto'

test.describe('Admin Control & Downloads Portal', () => {
  test.beforeEach(async ({ context, page }) => {
    // Clear tokens and set regular user auth state
    await context.addInitScript(() => {
      try {
        window.sessionStorage.setItem('disclaimerAccepted', 'true')
        window.localStorage.setItem('e2e_mock_authenticated', 'true')
        window.localStorage.setItem('e2e_mock_user', JSON.stringify({
          sub: 'auth0|mock-user-123',
          name: 'Regular User',
          email: 'regular@example.com'
        }))
      } catch (e) {}
    })

    // Mock downloads endpoint
    await page.route('**/downloads', async route => {
      if (route.request().resourceType() === 'document') {
        return route.continue()
      }
      const authHeader = route.request().headers()['authorization']
      if (authHeader && authHeader.includes('mock-admin-jwt-token')) {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify([
            { id: 'dl-1', title: 'The Dark Knight', quality: '1080p BluRay', filename: 'dark_knight.mp4' },
            { id: 'dl-2', title: 'Inception', quality: '2160p 4K HDR', filename: 'inception_4k.mkv' }
          ])
        })
      } else {
        await route.fulfill({
          status: 403,
          contentType: 'application/json',
          body: JSON.stringify({ error: 'upgrade required. premium feature.' })
        })
      }
    })

    // Mock admin login endpoint
    await page.route('**/admin/login', async route => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          success: true,
          token: 'mock-admin-jwt-token',
          expiresIn: '30m'
        })
      })
    })

    // Mock admin requests list
    await page.route('**/subscriptions/admin/requests', async route => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify([
          {
            id: 'req-1',
            user_id: 'user-123',
            email: 'premium-user@example.com',
            plan_id: 'premium',
            amount: 499,
            currency: 'INR',
            transaction_id: 'TXN_987654',
            status: 'pending',
            created_at: new Date().toISOString()
          }
        ])
      })
    })

    // Mock approve/reject endpoints
    await page.route('**/subscriptions/admin/approve', async route => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ success: true })
      })
    })

    // Mock recommendations profile
    await page.route('**/recommendations/profile', async route => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ isNewUser: false })
      })
    })
  })

  test('should display admin login button, authorize using HMAC code, search downloads, and manage admin dashboard', async ({ page }) => {
    // 1. Visit Downloads page
    await page.goto('/downloads')

    // 2. Assert Premium upgrade warning screen is displayed (since we return 403 initially)
    const premiumWarning = page.locator('h2:has-text("Premium Feature")')
    await expect(premiumWarning).toBeVisible({ timeout: 10000 })

    // 3. Assert Admin Login button is visible and click it
    const adminLoginBtn = page.locator('button:has-text("Admin Login")')
    await expect(adminLoginBtn).toBeVisible()
    await adminLoginBtn.click()

    // 4. Calculate proper HMAC code in the test runner
    const date = new Date()
    const dateString = `${date.getFullYear()}-${date.getMonth() + 1}-${date.getDate()}`
    const calculatedCode = crypto.createHmac('sha256', '98677').update(dateString).digest('hex')

    // 5. Fill input and submit admin login modal
    const codeInput = page.locator('input[placeholder*="daily code"]')
    await expect(codeInput).toBeVisible()
    await codeInput.fill(calculatedCode)
    await page.locator('button[type="submit"]:has-text("Login")').click()

    // 6. Verify downloads list mounts and contains movie elements
    const darkKnightCard = page.locator('button[aria-label*="The Dark Knight"], div[aria-label*="The Dark Knight"]').first()
    await expect(darkKnightCard).toBeVisible({ timeout: 10000 })

    // 7. Verify search functionality filters items
    const searchInput = page.locator('input[placeholder*="Search downloads"]')
    await searchInput.fill('Inception')
    // Dark knight should be hidden, Inception should be visible
    await expect(page.locator('text=The Dark Knight')).not.toBeVisible()
    await expect(page.locator('text=Inception')).toBeVisible()

    // Clear search
    const clearBtn = page.locator('button[aria-label="Clear search"]')
    await clearBtn.click()
    await expect(page.locator('text=The Dark Knight')).toBeVisible()

    // 8. Navigate to Admin Dashboard /admin/dashboard
    await page.goto('/admin/dashboard')

    // 9. Verify Admin Dashboard requests list mounts
    const reqEmail = page.locator('td:has-text("premium-user@example.com")')
    await expect(reqEmail).toBeVisible({ timeout: 10000 })
    
    // Verify status badge is PENDING
    const pendingBadge = page.locator('div:has-text("PENDING"), span:has-text("PENDING")').first()
    await expect(pendingBadge).toBeVisible()

    // Click Approve button (the green Check button)
    const approveBtn = page.locator('button.bg-green-600').first()
    await approveBtn.click()

    // Once approved, verify it doesn't crash and triggers toast/action
    const toast = page.locator('text=Request Approved').or(page.locator('text=processed'))
    await expect(toast.first()).toBeVisible({ timeout: 10000 })
  })
})
