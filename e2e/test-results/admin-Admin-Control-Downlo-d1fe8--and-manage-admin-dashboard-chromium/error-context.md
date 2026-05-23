# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: admin.spec.ts >> Admin Control & Downloads Portal >> should display admin login button, authorize using HMAC code, search downloads, and manage admin dashboard
- Location: e2e/admin.spec.ts:92:3

# Error details

```
Error: expect(locator).toBeVisible() failed

Locator: locator('h2:has-text("Premium Feature")')
Expected: visible
Timeout: 10000ms
Error: element(s) not found

Call log:
  - Expect "toBeVisible" with timeout 10000ms
  - waiting for locator('h2:has-text("Premium Feature")')

```

```yaml
- text: "{\"error\":\"Upgrade required. Premium feature.\"}"
```

# Test source

```ts
  1   | import { test, expect } from '@playwright/test'
  2   | import crypto from 'crypto'
  3   | 
  4   | test.describe('Admin Control & Downloads Portal', () => {
  5   |   test.beforeEach(async ({ context, page }) => {
  6   |     // Clear tokens and set regular user auth state
  7   |     await context.addInitScript(() => {
  8   |       window.sessionStorage.setItem('disclaimerAccepted', 'true')
  9   |       window.localStorage.setItem('e2e_mock_authenticated', 'true')
  10  |       window.localStorage.setItem('e2e_mock_user', JSON.stringify({
  11  |         sub: 'auth0|mock-user-123',
  12  |         name: 'Regular User',
  13  |         email: 'regular@example.com'
  14  |       }))
  15  |       window.localStorage.removeItem('adminToken')
  16  |     })
  17  | 
  18  |     // Mock downloads endpoint
  19  |     await page.route('**/downloads', async route => {
  20  |       const authHeader = route.request().headers()['authorization']
  21  |       if (authHeader && authHeader.includes('mock-admin-jwt-token')) {
  22  |         await route.fulfill({
  23  |           status: 200,
  24  |           contentType: 'application/json',
  25  |           body: JSON.stringify([
  26  |             { id: 'dl-1', title: 'The Dark Knight', quality: '1080p BluRay', filename: 'dark_knight.mp4' },
  27  |             { id: 'dl-2', title: 'Inception', quality: '2160p 4K HDR', filename: 'inception_4k.mkv' }
  28  |           ])
  29  |         })
  30  |       } else {
  31  |         await route.fulfill({
  32  |           status: 403,
  33  |           contentType: 'application/json',
  34  |           body: JSON.stringify({ error: 'Upgrade required. Premium feature.' })
  35  |         })
  36  |       }
  37  |     })
  38  | 
  39  |     // Mock admin login endpoint
  40  |     await page.route('**/admin/login', async route => {
  41  |       await route.fulfill({
  42  |         status: 200,
  43  |         contentType: 'application/json',
  44  |         body: JSON.stringify({
  45  |           success: true,
  46  |           token: 'mock-admin-jwt-token',
  47  |           expiresIn: '30m'
  48  |         })
  49  |       })
  50  |     })
  51  | 
  52  |     // Mock admin requests list
  53  |     await page.route('**/subscriptions/admin/requests', async route => {
  54  |       await route.fulfill({
  55  |         status: 200,
  56  |         contentType: 'application/json',
  57  |         body: JSON.stringify([
  58  |           {
  59  |             id: 'req-1',
  60  |             user_id: 'user-123',
  61  |             email: 'premium-user@example.com',
  62  |             plan_id: 'premium',
  63  |             amount: 499,
  64  |             currency: 'INR',
  65  |             transaction_id: 'TXN_987654',
  66  |             status: 'pending',
  67  |             created_at: new Date().toISOString()
  68  |           }
  69  |         ])
  70  |       })
  71  |     })
  72  | 
  73  |     // Mock approve/reject endpoints
  74  |     await page.route('**/subscriptions/admin/approve', async route => {
  75  |       await route.fulfill({
  76  |         status: 200,
  77  |         contentType: 'application/json',
  78  |         body: JSON.stringify({ success: true })
  79  |       })
  80  |     })
  81  | 
  82  |     // Mock recommendations profile
  83  |     await page.route('**/recommendations/profile', async route => {
  84  |       await route.fulfill({
  85  |         status: 200,
  86  |         contentType: 'application/json',
  87  |         body: JSON.stringify({ isNewUser: false })
  88  |       })
  89  |     })
  90  |   })
  91  | 
  92  |   test('should display admin login button, authorize using HMAC code, search downloads, and manage admin dashboard', async ({ page }) => {
  93  |     // 1. Visit Downloads page
  94  |     await page.goto('/downloads')
  95  | 
  96  |     // 2. Assert Premium upgrade warning screen is displayed (since we return 403 initially)
  97  |     const premiumWarning = page.locator('h2:has-text("Premium Feature")')
> 98  |     await expect(premiumWarning).toBeVisible({ timeout: 10000 })
      |                                  ^ Error: expect(locator).toBeVisible() failed
  99  | 
  100 |     // 3. Assert Admin Login button is visible and click it
  101 |     const adminLoginBtn = page.locator('button:has-text("Admin Login")')
  102 |     await expect(adminLoginBtn).toBeVisible()
  103 |     await adminLoginBtn.click()
  104 | 
  105 |     // 4. Calculate proper HMAC code in the test runner
  106 |     const date = new Date()
  107 |     const dateString = `${date.getFullYear()}-${date.getMonth() + 1}-${date.getDate()}`
  108 |     const calculatedCode = crypto.createHmac('sha256', '98677').update(dateString).digest('hex')
  109 | 
  110 |     // 5. Fill input and submit admin login modal
  111 |     const codeInput = page.locator('input[placeholder*="daily code"]')
  112 |     await expect(codeInput).toBeVisible()
  113 |     await codeInput.fill(calculatedCode)
  114 |     await page.locator('button[type="submit"]:has-text("Login")').click()
  115 | 
  116 |     // 6. Verify downloads list mounts and contains movie elements
  117 |     const darkKnightCard = page.locator('button[aria-label*="The Dark Knight"], div[aria-label*="The Dark Knight"]').first()
  118 |     await expect(darkKnightCard).toBeVisible({ timeout: 10000 })
  119 | 
  120 |     // 7. Verify search functionality filters items
  121 |     const searchInput = page.locator('input[placeholder*="Search downloads"]')
  122 |     await searchInput.fill('Inception')
  123 |     // Dark knight should be hidden, Inception should be visible
  124 |     await expect(page.locator('text=The Dark Knight')).not.toBeVisible()
  125 |     await expect(page.locator('text=Inception')).toBeVisible()
  126 | 
  127 |     // Clear search
  128 |     const clearBtn = page.locator('button[aria-label="Clear search"]')
  129 |     await clearBtn.click()
  130 |     await expect(page.locator('text=The Dark Knight')).toBeVisible()
  131 | 
  132 |     // 8. Navigate to Admin Dashboard /admin/dashboard
  133 |     await page.goto('/admin/dashboard')
  134 | 
  135 |     // 9. Verify Admin Dashboard requests list mounts
  136 |     const reqEmail = page.locator('td:has-text("premium-user@example.com")')
  137 |     await expect(reqEmail).toBeVisible({ timeout: 10000 })
  138 |     
  139 |     // Verify status badge is PENDING
  140 |     const pendingBadge = page.locator('span:has-text("PENDING")')
  141 |     await expect(pendingBadge).toBeVisible()
  142 | 
  143 |     // Click Approve button (the green Check button)
  144 |     const approveBtn = page.locator('button.bg-green-600').first()
  145 |     await approveBtn.click()
  146 | 
  147 |     // Once approved, verify it doesn't crash and triggers toast/action
  148 |     const toast = page.locator('text=Request Approved').or(page.locator('text=processed'))
  149 |     await expect(toast.first()).toBeVisible({ timeout: 10000 })
  150 |   })
  151 | })
  152 | 
```