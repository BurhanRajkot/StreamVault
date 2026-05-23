# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: favorites.spec.ts >> Favorites Watchlist Flow >> should redirect unauthenticated users to login and then show empty favorites
- Location: e2e/favorites.spec.ts:101:3

# Error details

```
Error: expect(locator).toBeVisible() failed

Locator: locator('h3:has-text("Nothing saved yet")')
Expected: visible
Timeout: 15000ms
Error: element(s) not found

Call log:
  - Expect "toBeVisible" with timeout 15000ms
  - waiting for locator('h3:has-text("Nothing saved yet")')

```

```yaml
- text: "[]"
```

# Test source

```ts
  7   |     mockFavorites = []
  8   | 
  9   |     // Dismiss the disclaimer modal globally
  10  |     await context.addInitScript(() => {
  11  |       window.sessionStorage.setItem('disclaimerAccepted', 'true')
  12  |       window.localStorage.removeItem('e2e_mock_authenticated')
  13  |       window.localStorage.removeItem('e2e_mock_user')
  14  |     })
  15  | 
  16  |     // Mock favorites database endpoint
  17  |     await page.route('**/favorites', async route => {
  18  |       if (route.request().method() === 'GET') {
  19  |         await route.fulfill({
  20  |           status: 200,
  21  |           contentType: 'application/json',
  22  |           body: JSON.stringify(mockFavorites)
  23  |         })
  24  |       } else if (route.request().method() === 'POST') {
  25  |         const payload = JSON.parse(route.request().postData() || '{}')
  26  |         const item = { id: `fav-${payload.tmdbId}`, tmdbId: payload.tmdbId, mediaType: payload.mediaType }
  27  |         mockFavorites.push(item)
  28  |         await route.fulfill({
  29  |           status: 200,
  30  |           contentType: 'application/json',
  31  |           body: JSON.stringify(item)
  32  |         })
  33  |       }
  34  |     })
  35  | 
  36  |     await page.route('**/favorites/*', async route => {
  37  |       if (route.request().method() === 'DELETE') {
  38  |         const url = route.request().url()
  39  |         const id = url.split('/').pop()
  40  |         mockFavorites = mockFavorites.filter(f => f.id !== id)
  41  |         await route.fulfill({
  42  |           status: 200,
  43  |           contentType: 'application/json',
  44  |           body: JSON.stringify({ success: true })
  45  |         })
  46  |       }
  47  |     })
  48  | 
  49  |     // Mock recommendations profile to avoid onboarding popup interfering
  50  |     await page.route('**/recommendations/profile', async route => {
  51  |       await route.fulfill({
  52  |         status: 200,
  53  |         contentType: 'application/json',
  54  |         body: JSON.stringify({ isNewUser: false })
  55  |       })
  56  |     })
  57  | 
  58  |     // Mock TMDB discover/trending and details
  59  |     await page.route('**/tmdb/discover/movie*', async route => {
  60  |       await route.fulfill({
  61  |         status: 200,
  62  |         contentType: 'application/json',
  63  |         body: JSON.stringify({
  64  |           results: [
  65  |             { id: 27205, title: 'Inception', media_type: 'movie', poster_path: '/ljsZTbVsrQSqZgWeep2B1QiDKuh.jpg', vote_average: 8.4 }
  66  |           ],
  67  |           total_pages: 1
  68  |         })
  69  |       })
  70  |     })
  71  | 
  72  |     await page.route('**/tmdb/trending/*', async route => {
  73  |       await route.fulfill({
  74  |         status: 200,
  75  |         contentType: 'application/json',
  76  |         body: JSON.stringify({
  77  |           results: [
  78  |             { id: 27205, title: 'Inception', media_type: 'movie', poster_path: '/ljsZTbVsrQSqZgWeep2B1QiDKuh.jpg', vote_average: 8.4 }
  79  |           ]
  80  |         })
  81  |       })
  82  |     })
  83  | 
  84  |     await page.route('**/tmdb/movie/27205*', async route => {
  85  |       await route.fulfill({
  86  |         status: 200,
  87  |         contentType: 'application/json',
  88  |         body: JSON.stringify({
  89  |           id: 27205,
  90  |           title: 'Inception',
  91  |           overview: 'Cobb steals information from targets by entering their dreams.',
  92  |           poster_path: '/ljsZTbVsrQSqZgWeep2B1QiDKuh.jpg',
  93  |           vote_average: 8.4,
  94  |           release_date: '2010-07-15',
  95  |           genres: [{ id: 28, name: 'Action' }]
  96  |         })
  97  |       })
  98  |     })
  99  |   })
  100 | 
  101 |   test('should redirect unauthenticated users to login and then show empty favorites', async ({ page }) => {
  102 |     // Navigate to favorites unauthenticated
  103 |     await page.goto('/favorites')
  104 | 
  105 |     // Wait for the mock auto-login to trigger and redirect
  106 |     const emptyHeader = page.locator('h3:has-text("Nothing saved yet")')
> 107 |     await expect(emptyHeader).toBeVisible({ timeout: 15000 })
      |                               ^ Error: expect(locator).toBeVisible() failed
  108 |   })
  109 | 
  110 |   test('should allow user to add and remove a movie from favorites', async ({ page }) => {
  111 |     // Authenticate user directly beforehand
  112 |     await page.evaluate(() => {
  113 |       window.localStorage.setItem('e2e_mock_authenticated', 'true')
  114 |     })
  115 | 
  116 |     await page.goto('/')
  117 |     await page.waitForLoadState('networkidle')
  118 | 
  119 |     // Click on the movie card (Inception) to open details modal
  120 |     const movieCard = page.locator('.group.relative.cursor-pointer, [role="button"]:has(img)').first()
  121 |     await expect(movieCard).toBeVisible()
  122 |     await movieCard.click()
  123 | 
  124 |     // Add to favorites
  125 |     const favBtn = page.locator('button[aria-label="Add to favorites"]')
  126 |     await expect(favBtn).toBeVisible()
  127 |     await favBtn.click()
  128 | 
  129 |     // Verify button text changes to "Remove from favorites"
  130 |     const unfavBtn = page.locator('button[aria-label="Remove from favorites"]')
  131 |     await expect(unfavBtn).toBeVisible()
  132 | 
  133 |     // Navigate to /favorites and verify movie card is shown
  134 |     await page.goto('/favorites')
  135 |     const favCard = page.locator('.group.relative.cursor-pointer, [role="button"]:has(img)').first()
  136 |     await expect(favCard).toBeVisible({ timeout: 10000 })
  137 | 
  138 |     // Open detail modal from favorites page
  139 |     await favCard.click()
  140 | 
  141 |     // Remove from favorites
  142 |     const removeBtn = page.locator('button[aria-label="Remove from favorites"]')
  143 |     await expect(removeBtn).toBeVisible()
  144 |     await removeBtn.click()
  145 | 
  146 |     // Close details modal
  147 |     const closeBtn = page.locator('button[aria-label="Close modal"]').first()
  148 |     await closeBtn.click()
  149 | 
  150 |     // Verify page displays empty state again
  151 |     const emptyHeader = page.locator('h3:has-text("Nothing saved yet")')
  152 |     await expect(emptyHeader).toBeVisible({ timeout: 10000 })
  153 |   })
  154 | })
  155 | 
```