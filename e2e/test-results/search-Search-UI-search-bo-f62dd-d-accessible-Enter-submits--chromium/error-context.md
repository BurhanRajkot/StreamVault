# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: search.spec.ts >> Search UI >> search box should be keyboard accessible (Enter submits)
- Location: e2e/search.spec.ts:65:3

# Error details

```
Error: expect(locator).toBeVisible() failed

Locator: locator('button[aria-label="Close modal"], button:has-text("Close")').first()
Expected: visible
Timeout: 10000ms
Error: element(s) not found

Call log:
  - Expect "toBeVisible" with timeout 10000ms
  - waiting for locator('button[aria-label="Close modal"], button:has-text("Close")').first()

```

```yaml
- banner:
  - link "StreamVault":
    - /url: /
  - navigation:
    - button "Home"
    - button "Movies"
    - button "TV Shows"
    - button "Docs"
    - button "Downloads"
  - button "Open search"
  - link "Favorites":
    - /url: /favorites
  - link "Upgrade":
    - /url: /pricing
    - button "Upgrade"
  - button "Switch to dark mode"
  - link "Login":
    - /url: /login
    - button "Login"
  - link "Sign Up":
    - /url: /signup
    - button "Sign Up"
- main:
  - button "Open Inception":
    - img "Inception"
    - text: "8.4"
  - paragraph: You've reached the end!
- contentinfo:
  - heading "StreamVault" [level=3]
  - paragraph: 123 Streaming Blvd, Suite 400
  - paragraph: Los Angeles, CA 90028
  - paragraph: "Phone: +1 (555) 123-4567"
  - heading "Connect with us" [level=3]
  - link "Facebook":
    - /url: https://facebook.com/streamvault
  - link "Instagram":
    - /url: https://instagram.com/streamvault
  - link "LinkedIn":
    - /url: https://linkedin.com/company/streamvault
  - link "YouTube":
    - /url: https://youtube.com/c/streamvault
  - paragraph: © 2025 StreamVault. All rights reserved.
  - paragraph: Developed with by Burhanuddin Rajkotwala
- region "Notifications alt+T"
- img "Inception backdrop"
- iframe
- button
- button "Close quick view"
- heading "Inception" [level=3]
- text: 84% Match HD
- button "Play"
- combobox:
  - option "Prism HD"
  - option "Lumina Pro" [selected]
  - option "Vortex Streaming"
  - option "Solaris Source"
  - option "Pulse Player"
  - option "Horizon Select"
```

# Test source

```ts
  1   | /**
  2   |  * StreamVault E2E — Search Audit Tests
  3   |  *
  4   |  * Tests the autocomplete search experience without requiring auth.
  5   |  * All tests target the public-facing search widget.
  6   |  */
  7   | 
  8   | import { test, expect } from '@playwright/test'
  9   | 
  10  | test.describe('Search UI', () => {
  11  |   test.beforeEach(async ({ context, page }) => {
  12  |     // Dismiss the disclaimer modal globally
  13  |     await context.addInitScript(() => {
  14  |       window.sessionStorage.setItem('disclaimerAccepted', 'true')
  15  |     })
  16  |     await page.goto('/')
  17  |     await page.waitForLoadState('domcontentloaded')
  18  |   })
  19  | 
  20  |   test('should render a search input on the homepage', async ({ page }) => {
  21  |     // Open search first by clicking the search button
  22  |     const openSearchButton = page.locator('button[aria-label="Open search"]').first()
  23  |     await openSearchButton.click()
  24  | 
  25  |     const searchInput = page.locator('input[placeholder*="Search"]').first()
  26  |     await expect(searchInput).toBeVisible()
  27  |   })
  28  | 
  29  |   test('should accept typed text in the search box', async ({ page }) => {
  30  |     const openSearchButton = page.locator('button[aria-label="Open search"]').first()
  31  |     await openSearchButton.click()
  32  | 
  33  |     const searchInput = page.locator('input[placeholder*="Search"]').first()
  34  |     await searchInput.fill('inception')
  35  |     await expect(searchInput).toHaveValue('inception')
  36  |   })
  37  | 
  38  |   test('should show autocomplete suggestions after typing', async ({ page }) => {
  39  |     // Intercept search request to return mock predictable data
  40  |     await page.route('**/tmdb/search/hybrid*', async route => {
  41  |       await route.fulfill({
  42  |         status: 200,
  43  |         contentType: 'application/json',
  44  |         body: JSON.stringify({
  45  |           results: [
  46  |             { id: 27205, title: 'Inception', media_type: 'movie', poster_path: '/ljsZTbVsrQSqZgWeep2B1QiDKuh.jpg', vote_average: 8.4 }
  47  |           ],
  48  |           total_results: 1,
  49  |           total_pages: 1
  50  |         })
  51  |       })
  52  |     })
  53  | 
  54  |     const openSearchButton = page.locator('button[aria-label="Open search"]').first()
  55  |     await openSearchButton.click()
  56  | 
  57  |     const searchInput = page.locator('input[placeholder*="Search"]').first()
  58  |     await searchInput.fill('inc')
  59  | 
  60  |     // Suggestions or grid cards should appear
  61  |     const firstCard = page.locator('.group.relative.cursor-pointer, [role="button"]:has(img)').first()
  62  |     await expect(firstCard).toBeVisible({ timeout: 10_000 })
  63  |   })
  64  | 
  65  |   test('search box should be keyboard accessible (Enter submits)', async ({ page }) => {
  66  |     await page.route('**/tmdb/search/hybrid*', async route => {
  67  |       await route.fulfill({
  68  |         status: 200,
  69  |         contentType: 'application/json',
  70  |         body: JSON.stringify({
  71  |           results: [
  72  |             { id: 27205, title: 'Inception', media_type: 'movie', poster_path: '/ljsZTbVsrQSqZgWeep2B1QiDKuh.jpg', vote_average: 8.4 }
  73  |           ],
  74  |           total_results: 1,
  75  |           total_pages: 1
  76  |         })
  77  |       })
  78  |     })
  79  | 
  80  |     const openSearchButton = page.locator('button[aria-label="Open search"]').first()
  81  |     await openSearchButton.click()
  82  | 
  83  |     const searchInput = page.locator('input[placeholder*="Search"]').first()
  84  |     await searchInput.fill('inception')
  85  |     await page.keyboard.press('Enter')
  86  | 
  87  |     // Expect search results cards to render
  88  |     const card = page.locator('.group.relative.cursor-pointer, [role="button"]:has(img)').first()
  89  |     await expect(card).toBeVisible({ timeout: 10_000 })
  90  | 
  91  |     // Click on result card and make sure details modal opens
  92  |     await card.click()
  93  |     const closeBtn = page.locator('button[aria-label="Close modal"], button:has-text("Close")').first()
> 94  |     await expect(closeBtn).toBeVisible({ timeout: 10_000 })
      |                            ^ Error: expect(locator).toBeVisible() failed
  95  |     await closeBtn.click()
  96  | 
  97  |     // Clear search using the "Close search" or clear button
  98  |     const clearBtn = page.locator('button[aria-label="Close search"], button:has(svg)').first()
  99  |     await clearBtn.click()
  100 |     await expect(searchInput).not.toBeVisible()
  101 |   })
  102 | })
  103 | 
```