# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: homepage.spec.ts >> Interactive UI Features >> should open movie details modal when clicking a media card
- Location: e2e/homepage.spec.ts:248:3

# Error details

```
Error: expect(locator).toBeVisible() failed

Locator: locator('button[aria-label="Close modal"], button:has-text("Close")').first()
Expected: visible
Timeout: 15000ms
Error: element(s) not found

Call log:
  - Expect "toBeVisible" with timeout 15000ms
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
  - region "Featured content loading"
  - heading "Stream By Provider" [level=2]
  - button "Show all providers": ALL All Content
  - button "Filter by Netflix": Netflix
  - button "Filter by Prime Video": Prime Video
  - button "Filter by HBO Max": HBO Max
  - button "Filter by Apple TV+": Apple TV+
  - heading "▶ Continue Watching" [level=2]
  - text: Pick up where you left off
  - paragraph: You haven't started watching anything yet.
  - heading "👑 Author's Choice" [level=2]
  - paragraph: Hand-picked recommendations by the creator of StreamVault
  - button "Scroll left"
  - button "Scroll right"
  - paragraph: No results found
  - paragraph: Try a different search term
  - heading "StreamVault — Watch Movies, TV Shows & Anime Online Free" [level=1]
  - paragraph:
    - text: Welcome to
    - strong: StreamVault
    - text: ", your premier destination to stream the latest and most popular entertainment. Whether you are looking to watch movies, binge trending TV shows, or discover new anime series, our extensive library powered by TMDB ensures you always have high-quality content at your fingertips."
  - heading "Why Choose StreamVault for Streaming?" [level=2]
  - paragraph: Our platform is designed for an optimal viewing experience. Enjoy fast loading times, a sleek user interface, and intelligent AI-driven recommendations that tailor content specifically to your taste. With StreamVault, watching movies and TV shows online has never been easier or more reliable.
  - heading "Unlimited Content, Zero Hassle" [level=2]
  - paragraph: Discover thousands of titles across diverse genres—from action, romance, and comedy documentaries, to thrilling sci-fi adventures. Our catalog is updated daily so you never miss out on the latest releases. Stay tuned, grab your popcorn, and start streaming your favorite movies, TV shows, and anime today on StreamVault.
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
```

# Test source

```ts
  160 |     page.on('response', res => {
  161 |       if (!res.url().includes('.js') || res.status() !== 200) return
  162 | 
  163 |       // Try content-length header first (zero allocation, synchronous)
  164 |       const contentLength = res.headers()['content-length']
  165 |       if (contentLength) {
  166 |         const bytes = parseInt(contentLength, 10)
  167 |         if (bytes > 2 * 1024 * 1024) {
  168 |           oversizedChunks.push(`${res.url()} (${(bytes / 1024).toFixed(0)} KB via header)`)
  169 |         }
  170 |         return
  171 |       }
  172 | 
  173 |       // Fall back to reading the body (async — collect the Promise)
  174 |       bodyPromises.push(
  175 |         res.body()
  176 |           .then(buf => {
  177 |             if (buf.length > 2 * 1024 * 1024) {
  178 |               oversizedChunks.push(`${res.url()} (${(buf.length / 1024).toFixed(0)} KB)`)
  179 |             }
  180 |           })
  181 |           .catch(() => { /* response already consumed or redirected — skip */ }),
  182 |       )
  183 |     })
  184 | 
  185 |     await page.goto('/', { waitUntil: 'networkidle' })
  186 | 
  187 |     // Wait for every pending body-read to complete before asserting
  188 |     await Promise.all(bodyPromises)
  189 | 
  190 |     if (oversizedChunks.length > 0) {
  191 |       console.warn('Oversized JS chunks detected:', oversizedChunks)
  192 |     }
  193 |     expect(oversizedChunks).toHaveLength(0)
  194 |   })
  195 | })
  196 | 
  197 | test.describe('Not Found Page', () => {
  198 |   test('should render a 404 page for unknown routes', async ({ page }) => {
  199 |     await page.goto('/this-page-definitely-does-not-exist-xyz')
  200 |     // Wait for the 404 heading/text or layout code to appear (auto-waiting)
  201 |     const errText = page.locator('h1:has-text("404")')
  202 |       .or(page.locator('text=404 Error'))
  203 |       .or(page.locator('text=The Missing Reel'))
  204 |       .first()
  205 |     await expect(errText).toBeVisible({ timeout: 10_000 })
  206 |   })
  207 | })
  208 | 
  209 | test.describe('Interactive UI Features', () => {
  210 |   test('should switch between light and dark themes', async ({ page }) => {
  211 |     await page.goto('/')
  212 |     await page.waitForLoadState('domcontentloaded')
  213 |     
  214 |     const themeBtn = page.locator('button[aria-label*="Switch to"]').first()
  215 |     await expect(themeBtn).toBeVisible()
  216 |     
  217 |     // Get the current theme class on <html>
  218 |     const initialClass = await page.locator('html').getAttribute('class')
  219 |     
  220 |     // Click theme button
  221 |     await themeBtn.click()
  222 |     
  223 |     // Verify theme class changed
  224 |     const newClass = await page.locator('html').getAttribute('class')
  225 |     expect(newClass).not.toBe(initialClass)
  226 |   })
  227 | 
  228 |   test('should filter content when clicking on an OTT provider', async ({ page }) => {
  229 |     await page.goto('/')
  230 |     await page.waitForLoadState('networkidle')
  231 |     
  232 |     const providerBtn = page.locator('button[aria-label^="Filter by"]').first()
  233 |     if (await providerBtn.count() > 0) {
  234 |       await expect(providerBtn).toBeVisible()
  235 |       await providerBtn.click()
  236 |       
  237 |       // Check that it gets selected (has a Check icon inside it or gets visual active state)
  238 |       const checkIcon = providerBtn.locator('svg')
  239 |       await expect(checkIcon).toBeVisible()
  240 |       
  241 |       // Clicking "Show all providers" should reset it
  242 |       const showAllBtn = page.locator('button[aria-label="Show all providers"]')
  243 |       await showAllBtn.click()
  244 |       await expect(checkIcon).not.toBeVisible()
  245 |     }
  246 |   })
  247 | 
  248 |   test('should open movie details modal when clicking a media card', async ({ page }) => {
  249 |     await page.goto('/')
  250 |     await page.waitForLoadState('networkidle')
  251 |     
  252 |     // Find a media card in the popular grid or recently added
  253 |     const mediaCard = page.locator('.group.relative.cursor-pointer, [role="button"]:has(img)').first()
  254 |     if (await mediaCard.count() > 0) {
  255 |       await mediaCard.click()
  256 |       
  257 |       // Modal or watch details should become visible
  258 |       // In StreamVault, media detail modal is rendered on the page, let's verify a details modal or overlay opens
  259 |       const closeBtn = page.locator('button[aria-label="Close modal"], button:has-text("Close")').first()
> 260 |       await expect(closeBtn).toBeVisible({ timeout: 15000 })
      |                              ^ Error: expect(locator).toBeVisible() failed
  261 |       
  262 |       // Close details modal
  263 |       await closeBtn.click()
  264 |       await expect(closeBtn).not.toBeVisible()
  265 |     }
  266 |   })
  267 | })
  268 | 
```