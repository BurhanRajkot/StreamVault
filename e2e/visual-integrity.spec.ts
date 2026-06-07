/**
 * StreamVault E2E — Visual Integrity (Hardened)
 *
 * Covers:
 *  - Homepage content height (not blank)
 *  - Screenshot is not a solid color
 *  - Media card posters actually decoded (naturalWidth > 0)
 *  - No broken image icons on load
 *  - CSS applied (elements have expected computed styles)
 *  - First poster is visible and decoded
 *  - Hero section image visible and decoded
 */

import { test, expect } from './fixtures'
import { HomePage } from './pages/HomePage'
import { MediaRenderingPage } from './pages/MediaRenderingPage'
import { assertNotBlank, assertImageRendered, assertNotStillLoading } from './fixtures/visual'

test.describe('Visual Integrity', () => {

  test('homepage has significant content height (not blank)', async ({ unauthMockPage: page }) => {
    await page.goto('/')
    const home = new HomePage(page)
    await home.waitForAppReady()

    const scrollHeight = await page.evaluate(() => document.documentElement.scrollHeight)
    const viewportHeight = await page.evaluate(() => window.innerHeight)

    expect(
      scrollHeight,
      'Page is too short — content may not have rendered'
    ).toBeGreaterThan(viewportHeight * 1.5)
  })

  test('homepage screenshot is not a solid blank color', async ({ unauthMockPage: page }) => {
    await page.goto('/', { waitUntil: 'networkidle' })
    const home = new HomePage(page)
    await home.waitForAppReady()

    const screenshot = await page.screenshot()
    const sizeKB = screenshot.length / 1024

    // A solid white/black page compresses to < 5 KB.
    // A real StreamVault page with posters is typically > 80 KB.
    expect(
      sizeKB,
      `Screenshot is only ${sizeKB.toFixed(1)} KB — page appears blank`
    ).toBeGreaterThan(50)

    // STRONG CHECK: file size alone is fooled by a text-heavy page sitting on
    // top of a blank media area. Verify the rendered pixels are actually
    // diverse (not a solid color block).
    await assertNotBlank(page, 'Homepage full-page screenshot', 12)
  })

  test('media card poster images are decoded (naturalWidth > 0)', async ({ mockApiPage: page }) => {
    const home = new HomePage(page)
    const media = new MediaRenderingPage(page)
    await home.gotoAndWaitForContent()

    // Give images time to decode
    await page.waitForTimeout(2000)

    await media.assertTMDBImagesPresent(1)
    await media.assertAllVisibleTMDBImagesDecoded(8)
  })

  test('no broken image icons on page load (naturalWidth=0)', async ({ mockApiPage: page }) => {
    const home = new HomePage(page)
    await home.gotoAndWaitForContent()
    await page.waitForTimeout(2500)

    const media = new MediaRenderingPage(page)
    await media.assertNoBrokenImages('Homepage initial load')
  })

  test('CSS applied correctly (root not display:none, flex containers work)', async ({ unauthMockPage: page }) => {
    await page.goto('/')
    const home = new HomePage(page)
    await home.waitForAppMount()

    const rootDisplay = await page.evaluate(
      () => window.getComputedStyle(document.getElementById('root')!).display
    )
    expect(rootDisplay).not.toBe('none')

    // At least one flex container exists
    const flexEl = page.locator('.flex').first()
    if (await flexEl.count() > 0) {
      const display = await flexEl.evaluate(el => window.getComputedStyle(el).display)
      expect(display).toBe('flex')
    }
  })

  test('first media card poster is visible and decoded by browser', async ({ mockApiPage: page }) => {
    const home = new HomePage(page)
    await home.gotoAndWaitForContent()

    const firstImg = home.mediaCards.first().locator('img').first()
    await expect(firstImg).toBeVisible({ timeout: 12_000 })

    const box = await firstImg.boundingBox()
    expect(box, 'First poster has no bounding box').not.toBeNull()
    if (box) {
      expect(box.width, 'Poster width is 0').toBeGreaterThan(10)
      expect(box.height, 'Poster height is 0').toBeGreaterThan(10)
    }

    // STRONG CHECK: naturalWidth must be > 0 (browser actually decoded the image)
    const naturalWidth = await firstImg.evaluate((img: HTMLImageElement) => img.naturalWidth)
    const src = await firstImg.getAttribute('src')
    expect(
      naturalWidth,
      `First poster has naturalWidth=${naturalWidth} — renders as broken icon or white pixel.\nsrc: ${src}`
    ).toBeGreaterThan(10)

    // STRONGER CHECK: a decoded-but-blank fallback image (e.g. a grey "no
    // poster" placeholder) still has naturalWidth > 0. Verify the poster
    // actually contains varied pixels.
    await assertNotBlank(firstImg, 'First media card poster')
  })

  test('hero section image is visible and decoded', async ({ mockApiPage: page }) => {
    const home = new HomePage(page)
    await home.gotoAndWaitForContent()

    const topImage = page.locator('img[src*="image.tmdb.org"]').first()
    const hasImg = await topImage.count() > 0

    if (!hasImg) {
      // May use CSS background-image — check for styled containers
      const bgContainer = page.locator(
        '[style*="background-image"], [class*="backdrop"], [class*="hero"]'
      ).first()
      const hasBackground = await bgContainer.count() > 0
      expect(hasBackground, 'No hero image or backdrop container found').toBe(true)
      return
    }

    await expect(topImage).toBeVisible({ timeout: 10_000 })

    const nw = await topImage.evaluate((img: HTMLImageElement) => img.naturalWidth)
    const src = await topImage.getAttribute('src')
    expect(
      nw,
      `Hero image naturalWidth=${nw} — image is broken/white.\nsrc: ${src}`
    ).toBeGreaterThan(10)

    // STRONGER CHECK: hero/backdrop must not be a solid blank block.
    await assertNotBlank(topImage, 'Hero/backdrop image')
  })

  test('homepage finishes loading — no spinner left and posters are decoded', async ({ mockApiPage: page }) => {
    const home = new HomePage(page)
    await home.gotoAndWaitForContent()
    await page.waitForTimeout(1500)

    // Catches the "test passed but screen was still loading" bug.
    await assertNotStillLoading(page)

    // And confirm at least the first poster is genuinely rendered, not blank.
    const firstImg = home.mediaCards.first().locator('img').first()
    await assertImageRendered(firstImg, 'First poster after load settle')
  })

  test('all TMDB images use correct base domain (no malformed URLs)', async ({ mockApiPage: page }) => {
    const home = new HomePage(page)
    await home.gotoAndWaitForContent()

    const srcs = await page.evaluate((): string[] =>
      [...document.querySelectorAll('img') as NodeListOf<HTMLImageElement>]
        .map(img => img.src)
        .filter(s => s.includes('tmdb'))
    )

    const malformed = srcs.filter(s => !s.startsWith('https://image.tmdb.org/t/p/'))
    expect(
      malformed.length,
      `Malformed TMDB image URLs:\n${malformed.map(s => `  ${s}`).join('\n')}`
    ).toBe(0)
  })
})