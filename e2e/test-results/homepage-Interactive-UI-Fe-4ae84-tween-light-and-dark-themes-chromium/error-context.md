# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: homepage.spec.ts >> Interactive UI Features >> should switch between light and dark themes
- Location: e2e/homepage.spec.ts:210:3

# Error details

```
Error: expect(received).not.toBe(expected) // Object.is equality

Expected: not "lenis lenis-smooth light"
```

# Page snapshot

```yaml
- generic [ref=e2]:
  - generic [ref=e3]:
    - banner [ref=e4]:
      - generic [ref=e5]:
        - link "StreamVault" [ref=e7] [cursor=pointer]:
          - /url: /
          - img [ref=e8]
          - generic [ref=e13]: StreamVault
        - navigation [ref=e14]:
          - button "Home" [ref=e15]: Home
          - button "Movies" [ref=e17]
          - button "TV Shows" [ref=e18]
          - button "Docs" [ref=e19]
          - button "Downloads" [ref=e20]
        - generic [ref=e21]:
          - button "Open search" [ref=e24]:
            - img [ref=e25]
          - link "Favorites" [ref=e28] [cursor=pointer]:
            - /url: /favorites
            - img [ref=e29]
          - link "Upgrade" [ref=e31] [cursor=pointer]:
            - /url: /pricing
            - button "Upgrade" [ref=e32]:
              - img
              - text: Upgrade
          - button "Switch to light mode" [active] [ref=e34]
          - generic [ref=e46]:
            - link "Login" [ref=e47] [cursor=pointer]:
              - /url: /login
              - button "Login" [ref=e48]
            - link "Sign Up" [ref=e49] [cursor=pointer]:
              - /url: /signup
              - button "Sign Up" [ref=e50]
    - main [ref=e51]:
      - region "Featured content loading" [ref=e53]
      - generic [ref=e55]:
        - heading "Stream By Provider" [level=2] [ref=e57]:
          - img [ref=e59]
          - text: Stream By Provider
        - generic [ref=e62]:
          - button "Show all providers" [ref=e63] [cursor=pointer]:
            - generic [ref=e66]: ALL
            - generic [ref=e69]: All Content
          - button "Filter by Netflix" [ref=e72] [cursor=pointer]:
            - img [ref=e74]
            - generic [ref=e76]: Netflix
          - button "Filter by Prime Video" [ref=e77] [cursor=pointer]:
            - img [ref=e79]
            - generic [ref=e81]: Prime Video
          - button "Filter by HBO Max" [ref=e82] [cursor=pointer]:
            - img [ref=e84]
            - generic [ref=e86]: HBO Max
          - button "Filter by Apple TV+" [ref=e87] [cursor=pointer]:
            - img [ref=e89]
            - generic [ref=e91]: Apple TV+
      - generic [ref=e92]:
        - generic [ref=e93]:
          - heading "▶ Continue Watching" [level=2] [ref=e94]
          - generic [ref=e95]: Pick up where you left off
        - paragraph [ref=e96]: You haven't started watching anything yet.
      - generic [ref=e98]:
        - generic [ref=e99]:
          - heading "👑 Author's Choice" [level=2] [ref=e100]
          - paragraph [ref=e101]: Hand-picked recommendations by the creator of StreamVault
        - button "Scroll left" [ref=e102]:
          - img [ref=e103]
        - button "Scroll right" [ref=e105]:
          - img [ref=e106]
      - generic [ref=e111]:
        - paragraph [ref=e112]: No results found
        - paragraph [ref=e113]: Try a different search term
      - generic [ref=e114]:
        - heading "StreamVault — Watch Movies, TV Shows & Anime Online Free" [level=1] [ref=e115]
        - generic [ref=e116]:
          - paragraph [ref=e117]:
            - text: Welcome to
            - strong [ref=e118]: StreamVault
            - text: ", your premier destination to stream the latest and most popular entertainment. Whether you are looking to watch movies, binge trending TV shows, or discover new anime series, our extensive library powered by TMDB ensures you always have high-quality content at your fingertips."
          - heading "Why Choose StreamVault for Streaming?" [level=2] [ref=e119]
          - paragraph [ref=e120]: Our platform is designed for an optimal viewing experience. Enjoy fast loading times, a sleek user interface, and intelligent AI-driven recommendations that tailor content specifically to your taste. With StreamVault, watching movies and TV shows online has never been easier or more reliable.
          - heading "Unlimited Content, Zero Hassle" [level=2] [ref=e121]
          - paragraph [ref=e122]: Discover thousands of titles across diverse genres—from action, romance, and comedy documentaries, to thrilling sci-fi adventures. Our catalog is updated daily so you never miss out on the latest releases. Stay tuned, grab your popcorn, and start streaming your favorite movies, TV shows, and anime today on StreamVault.
    - contentinfo [ref=e123]:
      - generic [ref=e124]:
        - generic [ref=e125]:
          - generic [ref=e126]:
            - heading "StreamVault" [level=3] [ref=e127]
            - generic [ref=e128]:
              - paragraph [ref=e129]: 123 Streaming Blvd, Suite 400
              - paragraph [ref=e130]: Los Angeles, CA 90028
              - paragraph [ref=e131]: "Phone: +1 (555) 123-4567"
          - generic [ref=e132]:
            - heading "Connect with us" [level=3] [ref=e133]
            - generic [ref=e134]:
              - link "Facebook" [ref=e135] [cursor=pointer]:
                - /url: https://facebook.com/streamvault
                - img [ref=e136]
              - link "Instagram" [ref=e138] [cursor=pointer]:
                - /url: https://instagram.com/streamvault
                - img [ref=e139]
              - link "LinkedIn" [ref=e142] [cursor=pointer]:
                - /url: https://linkedin.com/company/streamvault
                - img [ref=e143]
              - link "YouTube" [ref=e147] [cursor=pointer]:
                - /url: https://youtube.com/c/streamvault
                - img [ref=e148]
        - generic [ref=e151]:
          - paragraph [ref=e152]: © 2025 StreamVault. All rights reserved.
          - paragraph [ref=e153]:
            - text: Developed with
            - img [ref=e154]
            - text: by Burhanuddin Rajkotwala
  - region "Notifications alt+T"
```

# Test source

```ts
  125 |         return !hasLabel && !ariaLabel && !ariaLabelledBy
  126 |       }).length
  127 |     )
  128 |     expect(unlabelledInputs).toBe(0)
  129 |   })
  130 | 
  131 |   test('interactive elements should have visible focus outlines', async ({ page }) => {
  132 |     await page.goto('/')
  133 |     // Press Tab and check that :focus-visible is used or focus styling is applied
  134 |     await page.keyboard.press('Tab')
  135 |     const hasFocusVisible = await page.evaluate(() => {
  136 |       const el = document.activeElement
  137 |       if (!el) return false
  138 |       const style = window.getComputedStyle(el)
  139 |       return style.outlineStyle !== 'none' || style.boxShadow !== 'none'
  140 |     })
  141 |     expect(hasFocusVisible).toBe(true)
  142 |   })
  143 | })
  144 | 
  145 | test.describe('Performance Budget', () => {
  146 |   test('page should paint within 3 seconds', async ({ page }) => {
  147 |     const startTime = Date.now()
  148 |     await page.goto('/', { waitUntil: 'domcontentloaded' })
  149 |     const elapsed = Date.now() - startTime
  150 |     expect(elapsed).toBeLessThan(3000)
  151 |   })
  152 | 
  153 |   test('bundle should not include obviously large un-lazy-loaded chunks', async ({ page }) => {
  154 |     // Collect a Promise for each JS response body so we can await them all
  155 |     // AFTER navigation. Using an async listener directly is fire-and-forget:
  156 |     // page.goto resolves before the body reads finish, leaving the array empty.
  157 |     const bodyPromises: Promise<void>[] = []
  158 |     const oversizedChunks: string[] = []
  159 | 
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
> 225 |     expect(newClass).not.toBe(initialClass)
      |                          ^ Error: expect(received).not.toBe(expected) // Object.is equality
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
  260 |       await expect(closeBtn).toBeVisible({ timeout: 15000 })
  261 |       
  262 |       // Close details modal
  263 |       await closeBtn.click()
  264 |       await expect(closeBtn).not.toBeVisible()
  265 |     }
  266 |   })
  267 | })
  268 | 
```