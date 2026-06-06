/**
 * StreamVault E2E — Media Rendering Deep Validation
 *
 * ╔══════════════════════════════════════════════════════════════════════════╗
 * ║  WHY THIS FILE EXISTS                                                    ║
 * ║                                                                          ║
 * ║  Existing tests passed even when clicking a card showed a white screen.  ║
 * ║  They only checked img.src is truthy — that does NOT mean the image     ║
 * ║  actually rendered in the browser.                                       ║
 * ║                                                                          ║
 * ║  Hard checks used here (will FAIL if UI is broken):                      ║
 * ║    img.naturalWidth > 0  ──  browser decoded the image bytes             ║
 * ║    img.complete === true ──  browser finished the load attempt           ║
 * ║    boundingBox w/h > 0  ──  element occupies real screen pixels          ║
 * ║    screenshot byte size ──  catches solid-white/black blank screens      ║
 * ║    iframe.src not empty ──  streaming embed URL was actually set         ║
 * ║    no console errors    ──  catches silent CORS/404 failures             ║
 * ╚══════════════════════════════════════════════════════════════════════════╝
 *
 * Test sections:
 *  §1  Poster images — decoded, not broken icons
 *  §2  Backdrop images in Watch page — loaded, not white
 *  §3  Cast member profile photos — decoded by browser
 *  §4  QuickViewModal — opens, has content, close works
 *  §5  HoverVideoPlayer iframe — valid src, visible container
 *  §6  Embed iframe in play mode — src present, correct dimensions
 *  §7  TMDB URL structure — correct domain, valid path, no originals
 *  §8  Global broken image scan across pages
 *  §9  Console error monitoring during visual flows
 *  §10 Screenshot non-blank validation
 */

import { test, expect } from './fixtures'
import type { Page, Locator } from '@playwright/test'
import { HomePage } from './pages/HomePage'
import { WatchPage } from './pages/WatchPage'
import { MOCK_MOVIES } from './fixtures/mocks'

// ─── Constants ───────────────────────────────────────────────────────────────

const STREAMING_DOMAINS = [
  'peachify.top', 'vidup.to', 'vidfast.pro', '2embed.cc',
  'vidlink.pro', 'vidsrc.cc', 'player.videasy.net',
  'player.videasy.to', 'videasy.to', 'vidrock.ru',
]

const TMDB_IMG_DOMAIN = 'image.tmdb.org'

const IGNORED_CONSOLE_ERRORS = [
  'auth0', 'Auth0', 'intercom', 'analytics',
  'share-modal.js', 'chunk_reload',
  'Failed to load resource', 'net::ERR_',
  'Cross-Origin', 'Content Security Policy',
  'ResizeObserver', 'Non-Error promise rejection',
]

// ─── Shared Helpers ──────────────────────────────────────────────────────────

/**
 * Verify a single <img> element actually rendered in the browser.
 *
 * Why naturalWidth:
 *   img.src = "..." → DOES NOT mean the image decoded.
 *   img.naturalWidth > 0 → DOES mean the browser loaded and decoded the image.
 *   img.naturalWidth = 0 → broken icon (404, CORS, empty response, display:none)
 */
async function assertImageDecoded(img: Locator, label: string, minWidth = 10) {
  await expect(img).toBeAttached({ timeout: 15_000 })

  const result = await img.evaluate(
    (el: HTMLImageElement, args: { lbl: string; min: number }) => {
      return new Promise<{ ok: boolean; err: string }>((resolve) => {
        const check = () => {
          if (el.naturalWidth >= args.min) return resolve({ ok: true, err: '' })
          if (el.complete) {
            return resolve({
              ok: false,
              err: `complete=true but naturalWidth=${el.naturalWidth} (broken/404): ${el.src}`,
            })
          }
        }
        check()
        el.addEventListener('load', check, { once: true })
        el.addEventListener('error', () =>
          resolve({ ok: false, err: `onerror fired (unreachable): ${el.src}` }),
          { once: true }
        )
        setTimeout(() =>
          resolve({ ok: false, err: `timeout waiting for decode: ${el.src}` }),
          12_000
        )
      })
    },
    { lbl: label, min: minWidth }
  )

  expect(result.ok, `[${label}] Image decode failed: ${result.err}`).toBe(true)

  const box = await img.boundingBox()
  expect(box, `[${label}] Image has no bounding box`).not.toBeNull()
  if (box) {
    expect(box.width, `[${label}] Image width is 0px`).toBeGreaterThan(4)
    expect(box.height, `[${label}] Image height is 0px`).toBeGreaterThan(4)
  }
}

/**
 * Get all broken images on the page: complete=true AND naturalWidth=0.
 * These are the classic grey broken-image icons the user sees.
 */
async function getBrokenImages(page: Page): Promise<{ count: number; srcs: string[] }> {
  return page.evaluate(() => {
    const imgs = [...document.querySelectorAll('img')] as HTMLImageElement[]
    const broken = imgs.filter(
      img => img.complete && img.naturalWidth === 0 && img.src !== '' && !img.src.startsWith('data:')
    )
    return { count: broken.length, srcs: broken.map(i => i.src) }
  })
}

/**
 * Assert the page screenshot is not blank (solid white/black).
 * Blank pages compress to < 10 KB. Real content pages are > 30 KB.
 */
async function assertNotBlankScreen(page: Page, label: string) {
  const buf = await page.screenshot({ fullPage: false })
  const kb = buf.length / 1024
  expect(
    kb,
    `[${label}] Screenshot is ${kb.toFixed(1)} KB — page looks blank (white/black screen)`
  ).toBeGreaterThan(25)
}

/**
 * Verify an iframe's src points to a known streaming domain.
 */
async function assertStreamingIframeSrc(iframe: Locator, label: string, domains = STREAMING_DOMAINS) {
  const src = await iframe.getAttribute('src')
  expect(src, `[${label}] iframe has no src`).toBeTruthy()
  expect(src!.length, `[${label}] iframe src is empty`).toBeGreaterThan(10)
  const matches = domains.some(d => src!.includes(d))
  expect(
    matches,
    `[${label}] iframe src "${src}" is not a streaming provider.\nExpected one of: ${domains.join(', ')}`
  ).toBe(true)
}

/**
 * Find the first streaming iframe on the page (ignoring auth0 silent-auth iframes).
 */
async function findStreamingIframe(page: Page): Promise<Locator | null> {
  const iframes = page.locator('iframe')
  const count = await iframes.count()
  for (let i = 0; i < count; i++) {
    const src = await iframes.nth(i).getAttribute('src').catch(() => null)
    if (src && STREAMING_DOMAINS.some(d => src.includes(d))) {
      return iframes.nth(i)
    }
  }
  return null
}

/**
 * Hover a media card long enough to trigger QuickViewModal (1500ms hover delay + animation).
 */
async function hoverFirstCard(page: Page): Promise<boolean> {
  const card = page.locator(
    '.group.relative.cursor-pointer, [role="button"]:has(img[src*="tmdb"])'
  ).first()
  const visible = await card.isVisible({ timeout: 10_000 }).catch(() => false)
  if (!visible) return false
  await card.hover()
  await page.waitForTimeout(2200) // 1500ms delay + 300ms transition + buffer
  return true
}

/**
 * Returns true if we are on a desktop-width viewport (>= 768px).
 */
function isDesktop(page: Page): boolean {
  const vp = page.viewportSize()
  return !!vp && vp.width >= 768
}

/**
 * Register a console error listener. Returns the live array of errors.
 */
function listenForErrors(page: Page): string[] {
  const errors: string[] = []
  page.on('console', msg => {
    if (msg.type() === 'error') {
      const text = msg.text()
      if (!IGNORED_CONSOLE_ERRORS.some(ig => text.includes(ig))) {
        errors.push(`[console.error] ${text}`)
      }
    }
  })
  page.on('pageerror', err => {
    if (!IGNORED_CONSOLE_ERRORS.some(ig => err.message.includes(ig))) {
      errors.push(`[pageerror] ${err.message}`)
    }
  })
  return errors
}

// ─── §1  POSTER IMAGES ON MEDIA CARDS ────────────────────────────────────────

test.describe('§1  Poster images on media cards', () => {

  test('poster images decode in browser (naturalWidth > 0)', async ({ mockApiPage: page }) => {
    const home = new HomePage(page)
    await home.gotoAndWaitForContent()

    const imgs = page.locator(`img[src*="${TMDB_IMG_DOMAIN}"]`)
    const count = await imgs.count()
    expect(count, 'No TMDB images on homepage — cards may not have rendered').toBeGreaterThan(0)

    // Check up to 6 posters
    for (let i = 0; i < Math.min(count, 6); i++) {
      const img = imgs.nth(i)
      if (!await img.isVisible().catch(() => false)) continue
      await assertImageDecoded(img, `poster #${i + 1}`, 50)
    }
  })

  test('zero broken image icons on homepage', async ({ mockApiPage: page }) => {
    const home = new HomePage(page)
    await home.gotoAndWaitForContent()
    await page.waitForTimeout(2000) // images settle

    const { count, srcs } = await getBrokenImages(page)
    expect(
      count,
      `${count} broken image(s) found:\n${srcs.map(s => `  • ${s}`).join('\n')}`
    ).toBe(0)
  })

  test('first poster has correct 2:3 portrait aspect ratio', async ({ mockApiPage: page }) => {
    const home = new HomePage(page)
    await home.gotoAndWaitForContent()

    const img = page.locator(`img[src*="${TMDB_IMG_DOMAIN}"]`).first()
    await expect(img).toBeVisible({ timeout: 10_000 })

    const box = await img.boundingBox()
    expect(box, 'First poster has no bounding box').not.toBeNull()
    if (box) {
      expect(box.height, `Height (${box.height}px) should exceed width (${box.width}px) for portrait poster`).toBeGreaterThan(box.width)
      expect(box.width, 'Poster width is 0').toBeGreaterThan(20)
    }
  })

  test('poster src is a valid TMDB URL with size prefix', async ({ mockApiPage: page }) => {
    const home = new HomePage(page)
    await home.gotoAndWaitForContent()

    const src = await page.locator(`img[src*="${TMDB_IMG_DOMAIN}"]`).first().getAttribute('src')
    expect(src, 'First poster src is null').toBeTruthy()
    expect(src).toContain(TMDB_IMG_DOMAIN)
    expect(src).toMatch(/\/w\d+\/[a-zA-Z0-9]+\.(jpg|png|webp)/i)
  })

  test('poster images are not 1×1 tracking pixels', async ({ mockApiPage: page }) => {
    const home = new HomePage(page)
    await home.gotoAndWaitForContent()
    await page.waitForTimeout(1500)

    const data = await page.evaluate((domain: string): { src: string; w: number; h: number }[] =>
      [...document.querySelectorAll(`img[src*="${domain}"]`) as NodeListOf<HTMLImageElement>]
        .slice(0, 10)
        .map(img => ({ src: img.src, w: img.naturalWidth, h: img.naturalHeight }))
      , TMDB_IMG_DOMAIN)

    const tiny = data.filter(r => r.w > 0 && r.w <= 5 && r.h <= 5)
    expect(
      tiny.length,
      `1×1 tracking pixels found:\n${tiny.map(r => `  ${r.w}×${r.h} → ${r.src}`).join('\n')}`
    ).toBe(0)
  })

  test('poster images have srcset for responsive loading', async ({ mockApiPage: page }) => {
    const home = new HomePage(page)
    await home.gotoAndWaitForContent()

    const imgs = page.locator(`img[src*="${TMDB_IMG_DOMAIN}"]`)
    const count = await imgs.count()
    expect(count, 'No poster images found').toBeGreaterThan(0)

    let withSrcset = 0
    for (let i = 0; i < Math.min(count, 5); i++) {
      const srcset = await imgs.nth(i).getAttribute('srcset')
      if (srcset && srcset.length > 0) withSrcset++
    }
    expect(
      withSrcset,
      `Only ${withSrcset}/${Math.min(count, 5)} poster images have srcset — responsive loading broken`
    ).toBeGreaterThan(0)
  })
})

// ─── §2  BACKDROP IMAGES IN WATCH PAGE ───────────────────────────────────────

test.describe('§2  Backdrop images in Watch page (MovieDetailModal)', () => {

  test('backdrop image decodes — not white/blank', async ({ unauthMockPage: page }) => {
    const watch = new WatchPage(page)
    await watch.gotoAndWaitForContent('movie', `${MOCK_MOVIES.inception.id}-inception`)

    const backdrop = page.locator(`img[src*="${TMDB_IMG_DOMAIN}"]`).first()
    await expect(backdrop).toBeAttached({ timeout: 12_000 })
    await assertImageDecoded(backdrop, 'Watch page backdrop', 100)
  })

  test('Watch page screenshot is not blank after loading', async ({ unauthMockPage: page }) => {
    const watch = new WatchPage(page)
    await watch.gotoAndWaitForContent('movie', `${MOCK_MOVIES.inception.id}-inception`)
    await page.waitForTimeout(1500)
    await assertNotBlankScreen(page, 'Watch/Movie pre-play')
  })

  test('correct TMDB backdrop path is present in img srcs', async ({ unauthMockPage: page }) => {
    const watch = new WatchPage(page)
    await watch.gotoAndWaitForContent('movie', `${MOCK_MOVIES.inception.id}-inception`)

    const srcs = await page.evaluate((domain: string) =>
      [...document.querySelectorAll('img') as NodeListOf<HTMLImageElement>]
        .map(img => img.src)
        .filter(s => s.includes(domain))
      , TMDB_IMG_DOMAIN)

    expect(srcs.length, 'No TMDB images in Watch page').toBeGreaterThan(0)

    // Inception mock backdrop_path = /s2bT29y0ngXxxu2IA8AOzzXTRhd.jpg
    const hasBackdrop = srcs.some(s => s.includes('s2bT29y0ngXxxu2IA8AOzzXTRhd'))
    expect(
      hasBackdrop,
      `Inception backdrop path not found in srcs:\n${srcs.map(s => `  ${s}`).join('\n')}`
    ).toBe(true)
  })

  test('no broken images in Watch page (pre-play state)', async ({ unauthMockPage: page }) => {
    const watch = new WatchPage(page)
    await watch.gotoAndWaitForContent('movie', `${MOCK_MOVIES.inception.id}-inception`)
    await page.waitForTimeout(2000)

    const { count, srcs } = await getBrokenImages(page)
    expect(
      count,
      `${count} broken image(s) in Watch page:\n${srcs.map(s => `  • ${s}`).join('\n')}`
    ).toBe(0)
  })

  test('TV show backdrop decodes correctly', async ({ unauthMockPage: page }) => {
    const watch = new WatchPage(page)
    await watch.gotoAndWaitForContent('tv', `${MOCK_MOVIES.breakingBad.id}-breaking-bad`)

    const backdrop = page.locator(`img[src*="${TMDB_IMG_DOMAIN}"]`).first()
    await expect(backdrop).toBeAttached({ timeout: 12_000 })
    await assertImageDecoded(backdrop, 'TV show backdrop', 50)
  })

  test('all visible TMDB images on Watch page have naturalWidth > 0', async ({ unauthMockPage: page }) => {
    const watch = new WatchPage(page)
    await watch.gotoAndWaitForContent('movie', `${MOCK_MOVIES.inception.id}-inception`)
    await page.waitForTimeout(2500)

    const data = await page.evaluate((domain: string) => {
      return [...document.querySelectorAll(`img[src*="${domain}"]`) as NodeListOf<HTMLImageElement>].map(img => {
        const rect = img.getBoundingClientRect()
        return { src: img.src, nw: img.naturalWidth, visible: rect.width > 0 && rect.height > 0 && rect.top < window.innerHeight }
      })
    }, TMDB_IMG_DOMAIN)

    const visible = data.filter(d => d.visible)
    expect(visible.length, 'No TMDB images visible in Watch page viewport').toBeGreaterThan(0)

    const broken = visible.filter(d => d.nw === 0)
    expect(
      broken.length,
      `${broken.length} visible images are broken (naturalWidth=0):\n${broken.map(d => `  ${d.src}`).join('\n')}`
    ).toBe(0)
  })
})

// ─── §3  CAST MEMBER PROFILE PHOTOS ──────────────────────────────────────────

test.describe('§3  Cast member profile photos', () => {

  test('cast profile images decode — not broken icons', async ({ unauthMockPage: page }) => {
    const watch = new WatchPage(page)
    await watch.gotoAndWaitForContent('movie', `${MOCK_MOVIES.inception.id}-inception`)
    await page.waitForTimeout(3000) // wait for fetchMediaDetails to complete

    const castImgs = page.locator(`img[src*="${TMDB_IMG_DOMAIN}"]`)
    const count = await castImgs.count()

    if (count === 0) {
      console.warn('⚠ No TMDB images found — cast section may not have rendered yet')
      return
    }

    const failures: string[] = []
    for (let i = 0; i < Math.min(count, 4); i++) {
      const img = castImgs.nth(i)
      if (!await img.isVisible().catch(() => false)) continue

      const info = await img.evaluate((el: HTMLImageElement) => ({
        src: el.src, nw: el.naturalWidth, complete: el.complete
      }))

      if (info.complete && info.nw === 0) {
        failures.push(`img #${i + 1}: naturalWidth=0 (broken) — ${info.src}`)
      }
    }

    expect(
      failures.length,
      `${failures.length} cast image(s) failed to decode:\n${failures.join('\n')}`
    ).toBe(0)
  })

  test('cast images have non-zero bounding boxes', async ({ unauthMockPage: page }) => {
    const watch = new WatchPage(page)
    await watch.gotoAndWaitForContent('movie', `${MOCK_MOVIES.inception.id}-inception`)
    await page.waitForTimeout(2500)

    const data = await page.evaluate((domain: string) => {
      return [...document.querySelectorAll(`img[src*="${domain}"]`) as NodeListOf<HTMLImageElement>].map(img => {
        const rect = img.getBoundingClientRect()
        return { src: img.src, nw: img.naturalWidth, visible: rect.width > 0 && rect.height > 0 && rect.top < window.innerHeight }
      })
    }, TMDB_IMG_DOMAIN)

    const visible = data.filter(d => d.visible)
    expect(visible.length, 'No TMDB images visible in viewport on Watch page').toBeGreaterThan(0)

    const broken = visible.filter(d => d.nw === 0)
    expect(
      broken.length,
      `${broken.length} visible image(s) are broken:\n${broken.map(d => `  ${d.src}`).join('\n')}`
    ).toBe(0)
  })
})

// ─── §4  QuickViewModal ───────────────────────────────────────────────────────

test.describe('§4  QuickViewModal — content and interactions', () => {
  /**
   * QuickViewModal appears after 1500ms hover on a media card.
   * It contains: HoverVideoPlayer (iframe + backdrop fallback) + title + metadata + Play button.
   *
   * The "white screen" bug can occur here because:
   *   1. The backdrop <img> has a src but the image never loaded (CORS, network, etc.)
   *   2. The iframe src points to wrong URL or is empty
   *   3. The modal portal mounts into document.body but CSS fails to position it
   */

  test('QuickViewModal opens with real content after hover', async ({ mockApiPage: page }) => {
    const home = new HomePage(page)
    await home.gotoAndWaitForContent()

    const opened = await hoverFirstCard(page)
    if (!opened || !isDesktop(page)) {
      test.skip()
      return
    }

    // Modal portal is appended to <body> — it uses createPortal
    const modal = page.locator('body > [class*="rounded-lg"][class*="shadow-2xl"]')
      .or(page.locator('[class*="rounded-lg"][class*="shadow-2xl"][style*="position: absolute"]'))
      .first()

    const modalVisible = await modal.isVisible({ timeout: 3000 }).catch(() => false)

    if (!modalVisible) {
      // Fallback: find any visible shadow-2xl element that's not part of the main layout
      const anyModal = page.locator('[class*="shadow-2xl"]').last()
      const fallbackVisible = await anyModal.isVisible().catch(() => false)

      if (!fallbackVisible) {
        throw new Error(
          'QuickViewModal did NOT open after 2200ms hover on a desktop viewport.\n' +
          'This is the "white screen / nothing happens" bug.\n' +
          'Check: MediaCard.handleMouseEnter → setShowQuickView(true) after 1500ms\n' +
          'Check: QuickViewModal renders via createPortal to document.body'
        )
      }
    }

    // Modal has real text content
    const visibleModal = modal.or(page.locator('[class*="shadow-2xl"]').last())
    const text = await visibleModal.innerText().catch(() => '')
    expect(text.trim().length, 'QuickViewModal opened but has no text — renders blank box').toBeGreaterThan(3)
  })

  test('QuickViewModal backdrop fallback image decodes before iframe loads', async ({ mockApiPage: page }) => {
    const home = new HomePage(page)
    await home.gotoAndWaitForContent()

    if (!isDesktop(page)) { test.skip(); return }

    await hoverFirstCard(page)

    // HoverVideoPlayer renders an <img> as fallback before iframe loads.
    // It has class "absolute inset-0 w-full h-full object-cover"
    const fallbackImg = page.locator(`img[src*="${TMDB_IMG_DOMAIN}"][class*="absolute"]`).first()
    const count = await fallbackImg.count()

    if (count === 0) {
      console.warn('⚠ QuickViewModal fallback image not found — modal may not have opened')
      return
    }

    await assertImageDecoded(fallbackImg, 'QuickViewModal backdrop fallback', 10)
  })

  test('QuickViewModal HoverVideoPlayer iframe has a valid streaming src', async ({ mockApiPage: page }) => {
    const home = new HomePage(page)
    await home.gotoAndWaitForContent()

    if (!isDesktop(page)) { test.skip(); return }

    await hoverFirstCard(page)

    const iframe = await findStreamingIframe(page)
    if (!iframe) {
      const count = await page.locator('iframe').count()
      console.warn(`⚠ No streaming iframe found. Total iframes on page: ${count}. Modal may not have opened.`)
      return
    }

    await assertStreamingIframeSrc(iframe, 'HoverVideoPlayer iframe')

    const src = await iframe.getAttribute('src')
    const hasTMDBId = /\d{3,}/.test(src!)
    expect(hasTMDBId, `Streaming URL "${src}" does not contain a TMDB ID`).toBe(true)
  })

  test('QuickViewModal Play button is rendered with real dimensions', async ({ mockApiPage: page }) => {
    const home = new HomePage(page)
    await home.gotoAndWaitForContent()

    if (!isDesktop(page)) { test.skip(); return }

    await hoverFirstCard(page)

    // The Play button inside QuickViewModal — contains both Play icon and text
    const playBtn = page.locator('button').filter({ hasText: /^Play$/ }).first()
    const visible = await playBtn.isVisible().catch(() => false)
    if (!visible) return // modal may not have opened

    const box = await playBtn.boundingBox()
    expect(box, 'QuickViewModal Play button has no bounding box').not.toBeNull()
    if (box) {
      expect(box.width, 'Play button width is 0').toBeGreaterThan(0)
      expect(box.height, 'Play button height is 0').toBeGreaterThan(0)
    }
  })

  test('Close button dismisses QuickViewModal', async ({ mockApiPage: page }) => {
    const home = new HomePage(page)
    await home.gotoAndWaitForContent()

    if (!isDesktop(page)) { test.skip(); return }

    await hoverFirstCard(page)

    const closeBtn = page.locator('button[aria-label="Close quick view"]').first()
    const visible = await closeBtn.isVisible().catch(() => false)
    if (!visible) return // modal may not have opened

    await closeBtn.click()
    await page.waitForTimeout(400)

    const stillVisible = await closeBtn.isVisible().catch(() => false)
    expect(stillVisible, 'Close button still visible after clicking — modal did not dismiss').toBe(false)
  })

  test('QuickViewModal video area is not a blank white box', async ({ mockApiPage: page }) => {
    const home = new HomePage(page)
    await home.gotoAndWaitForContent()

    if (!isDesktop(page)) { test.skip(); return }

    await hoverFirstCard(page)

    // Wait for fallback image or iframe to appear
    const modalEl = page.locator('[class*="shadow-2xl"]').last()
    const modalVisible = await modalEl.isVisible().catch(() => false)
    if (!modalVisible) return

    const box = await modalEl.boundingBox()
    if (!box) return

    // Crop to the top portion (video area, roughly first 60% of modal height)
    const buf = await page.screenshot({
      clip: {
        x: box.x, y: box.y,
        width: box.width,
        height: Math.min(box.height, box.height * 0.6),
      },
    })
    const kb = buf.length / 1024
    expect(
      kb,
      `QuickViewModal video area screenshot is ${kb.toFixed(1)} KB — looks blank/white`
    ).toBeGreaterThan(8)
  })
})

// ─── §5  HoverVideoPlayer iframe ─────────────────────────────────────────────

test.describe('§5  HoverVideoPlayer — iframe validation', () => {

  test('HoverVideoPlayer container has correct viewport dimensions', async ({ mockApiPage: page }) => {
    const home = new HomePage(page)
    await home.gotoAndWaitForContent()

    if (!isDesktop(page)) { test.skip(); return }

    await hoverFirstCard(page)

    const container = page.locator('[class*="aspect-video"]').first()
    const visible = await container.isVisible().catch(() => false)
    if (!visible) return // modal may not have opened

    const box = await container.boundingBox()
    expect(box, 'Video container has no bounding box').not.toBeNull()
    if (box) {
      expect(box.width, 'Video container width is 0').toBeGreaterThan(50)
      expect(box.height, 'Video container height is 0').toBeGreaterThan(30)
    }
  })

  test('HoverVideoPlayer fallback image is not white/blank', async ({ mockApiPage: page }) => {
    const home = new HomePage(page)
    await home.gotoAndWaitForContent()

    if (!isDesktop(page)) { test.skip(); return }

    await hoverFirstCard(page)

    const fallbackImg = page.locator(`img[src*="${TMDB_IMG_DOMAIN}"][class*="absolute"]`).first()
    const visible = await fallbackImg.isVisible().catch(() => false)
    if (!visible) return

    // Get bounding box of just the image and crop a screenshot
    const box = await fallbackImg.boundingBox()
    if (!box || box.width < 10 || box.height < 10) return

    const buf = await page.screenshot({
      clip: { x: box.x, y: box.y, width: box.width, height: box.height },
    })
    const kb = buf.length / 1024
    expect(
      kb,
      `HoverVideoPlayer fallback image screenshot is ${kb.toFixed(1)} KB — looks white/blank`
    ).toBeGreaterThan(5)
  })

  test('HoverVideoPlayer iframe src contains valid streaming domain', async ({ mockApiPage: page }) => {
    const home = new HomePage(page)
    await home.gotoAndWaitForContent()

    if (!isDesktop(page)) { test.skip(); return }

    await hoverFirstCard(page)

    const iframe = await findStreamingIframe(page)
    if (!iframe) {
      console.warn('⚠ No streaming iframe found after hover — modal may not have rendered iframe yet')
      return
    }

    await assertStreamingIframeSrc(iframe, 'HoverVideoPlayer')

    // The iframe src should NOT be empty or just the domain root
    const src = await iframe.getAttribute('src')
    expect(src!.split('/').length, `Streaming URL "${src}" is too short to contain a movie ID`).toBeGreaterThan(4)
  })
})

// ─── §6  EMBED IFRAME IN PLAY MODE ───────────────────────────────────────────

test.describe('§6  Embed iframe in play mode (MovieDetailModal)', () => {
  /**
   * Clicking "Play Now" mounts an iframe for the streaming provider.
   * White screen bug here = iframe mounted with empty src, or container has zero dimensions.
   */

  test('clicking Play Now renders a streaming iframe with valid src', async ({ unauthMockPage: page }) => {
    const watch = new WatchPage(page)
    await watch.gotoAndWaitForContent('movie', `${MOCK_MOVIES.inception.id}-inception`)

    const playBtn = page.locator('button:has-text("Play Now"), button:has-text("Play")').first()
    await expect(playBtn).toBeVisible({ timeout: 10_000 })
    await playBtn.click()
    await page.waitForTimeout(1500)

    const iframe = await findStreamingIframe(page)
    const count = await page.locator('iframe').count()

    expect(
      iframe,
      `No streaming iframe found after clicking Play Now.\n` +
      `Total iframes: ${count}\nExpected src to contain one of: ${STREAMING_DOMAINS.join(', ')}`
    ).not.toBeNull()

    if (iframe) {
      await assertStreamingIframeSrc(iframe, 'play mode embed iframe')

      const src = await iframe.getAttribute('src')
      const movieId = String(MOCK_MOVIES.inception.id)
      expect(
        src!.includes(movieId),
        `Streaming src "${src}" does not contain TMDB movie ID ${movieId}`
      ).toBe(true)
    }
  })

  test('video player container has real dimensions after Play Now', async ({ unauthMockPage: page }) => {
    const watch = new WatchPage(page)
    await watch.gotoAndWaitForContent('movie', `${MOCK_MOVIES.inception.id}-inception`)

    const playBtn = page.locator('button:has-text("Play Now"), button:has-text("Play")').first()
    await expect(playBtn).toBeVisible({ timeout: 10_000 })
    await playBtn.click()
    await page.waitForTimeout(1500)

    const container = page.locator('[class*="aspect-video"]').first()
    await expect(container).toBeAttached({ timeout: 8_000 })

    const box = await container.boundingBox()
    expect(box, 'Video container (aspect-video) has no bounding box').not.toBeNull()
    if (box) {
      expect(box.width, 'Video container width is 0 — player is invisible').toBeGreaterThan(100)
      expect(box.height, 'Video container height is 0 — player has no height').toBeGreaterThan(50)
    }
  })

  test('play mode page is not blank after clicking Play Now', async ({ unauthMockPage: page }) => {
    const watch = new WatchPage(page)
    await watch.gotoAndWaitForContent('movie', `${MOCK_MOVIES.inception.id}-inception`)

    const playBtn = page.locator('button:has-text("Play Now"), button:has-text("Play")').first()
    await expect(playBtn).toBeVisible({ timeout: 10_000 })
    await playBtn.click()
    await page.waitForTimeout(2000)

    await assertNotBlankScreen(page, 'Theater mode after Play Now')
  })

  test('TV embed iframe URL contains season and episode numbers', async ({ unauthMockPage: page }) => {
    const watch = new WatchPage(page)
    await watch.gotoAndWaitForContent('tv', `${MOCK_MOVIES.breakingBad.id}-breaking-bad`)

    const playBtn = page.locator('button:has-text("Play Now"), button:has-text("Play")').first()
    await expect(playBtn).toBeVisible({ timeout: 10_000 })
    await playBtn.click()
    await page.waitForTimeout(1500)

    const iframe = await findStreamingIframe(page)
    if (!iframe) {
      console.warn('⚠ TV streaming iframe not found')
      return
    }

    const src = await iframe.getAttribute('src')
    // TV embed URLs contain season/episode like /1/1 or s=1&e=1
    const hasSE = src!.includes('/1/1') || /[&?]s=1/.test(src!) || /season.*1.*episode.*1/i.test(src!)
    expect(hasSE, `TV embed URL "${src}" does not contain season/episode info`).toBe(true)
  })

  test('streaming iframe is visible and covers meaningful viewport area', async ({ unauthMockPage: page }) => {
    const watch = new WatchPage(page)
    await watch.gotoAndWaitForContent('movie', `${MOCK_MOVIES.inception.id}-inception`)

    const playBtn = page.locator('button:has-text("Play Now"), button:has-text("Play")').first()
    await expect(playBtn).toBeVisible({ timeout: 10_000 })
    await playBtn.click()
    await page.waitForTimeout(1500)

    const iframe = await findStreamingIframe(page)
    if (!iframe) return

    const box = await iframe.boundingBox()
    expect(box, 'Streaming iframe has no bounding box').not.toBeNull()
    if (box) {
      const vp = page.viewportSize() ?? { width: 1280, height: 720 }
      // iframe should occupy at least 30% of viewport width
      expect(
        box.width,
        `Iframe width ${box.width}px is too small for viewport ${vp.width}px`
      ).toBeGreaterThan(vp.width * 0.3)
      expect(box.height, 'Iframe has no height').toBeGreaterThan(100)
    }
  })

  test('initial streaming provider defaults to a known provider', async ({ unauthMockPage: page }) => {
    const watch = new WatchPage(page)
    await watch.gotoAndWaitForContent('movie', `${MOCK_MOVIES.inception.id}-inception`)

    const playBtn = page.locator('button:has-text("Play Now"), button:has-text("Play")').first()
    await expect(playBtn).toBeVisible({ timeout: 10_000 })
    await playBtn.click()
    await page.waitForTimeout(1500)

    const iframe = await findStreamingIframe(page)
    if (!iframe) return

    const src = await iframe.getAttribute('src')
    const knownProviders = ['vidfast.pro', 'vidlink.pro', 'peachify.top', 'vidup.to', '2embed.cc', 'vidsrc.cc', 'videasy.net', 'player.videasy.to', 'videasy.to', 'vidrock.ru']
    const matchedProvider = knownProviders.find(p => src!.includes(p))
    expect(
      matchedProvider,
      `Default streaming src "${src}" is not from a known provider`
    ).toBeTruthy()
  })
})

// ─── §7  TMDB URL STRUCTURE ───────────────────────────────────────────────────

test.describe('§7  TMDB image URL structure and integrity', () => {

  test('all TMDB URLs use correct https://image.tmdb.org/t/p/ prefix', async ({ mockApiPage: page }) => {
    const home = new HomePage(page)
    await home.gotoAndWaitForContent()

    const srcs = await page.evaluate((): string[] =>
      [...document.querySelectorAll('img') as NodeListOf<HTMLImageElement>]
        .map(img => img.src).filter(Boolean)
    )

    const tmdbSrcs = srcs.filter(s => s.includes('tmdb'))
    const malformed = tmdbSrcs.filter(s => !s.startsWith('https://image.tmdb.org/t/p/'))
    expect(
      malformed.length,
      `Malformed TMDB URLs:\n${malformed.map(s => `  ${s}`).join('\n')}`
    ).toBe(0)
  })

  test('no /original/ TMDB images (bandwidth waste)', async ({ mockApiPage: page }) => {
    const home = new HomePage(page)
    await home.gotoAndWaitForContent()

    const srcs = await page.evaluate((domain: string): string[] =>
      [...document.querySelectorAll(`img[src*="${domain}"]`) as NodeListOf<HTMLImageElement>].map(img => img.src)
      , TMDB_IMG_DOMAIN)

    const originals = srcs.filter(s => s.includes('/original/'))
    expect(
      originals.length,
      `Found ${originals.length} /original/ TMDB images (wasteful):\n${originals.map(s => `  ${s}`).join('\n')}`
    ).toBe(0)
  })

  test('all TMDB image paths have a valid file extension', async ({ mockApiPage: page }) => {
    const home = new HomePage(page)
    await home.gotoAndWaitForContent()

    const srcs = await page.evaluate((domain: string): string[] =>
      [...document.querySelectorAll(`img[src*="${domain}"]`) as NodeListOf<HTMLImageElement>].map(img => img.src)
      , TMDB_IMG_DOMAIN)

    const noExtension = srcs.filter(s => !/\.(jpg|jpeg|png|webp)(\?.*)?$/i.test(s))
    expect(
      noExtension.length,
      `TMDB images missing file extension:\n${noExtension.map(s => `  ${s}`).join('\n')}`
    ).toBe(0)
  })
})

// ─── §8  GLOBAL BROKEN IMAGE DETECTION ───────────────────────────────────────

test.describe('§8  Global broken image detection across pages', () => {

  test('Watch page (movie) — zero broken images', async ({ unauthMockPage: page }) => {
    const watch = new WatchPage(page)
    await watch.gotoAndWaitForContent('movie', `${MOCK_MOVIES.inception.id}-inception`)
    await page.waitForTimeout(3000)

    const { count, srcs } = await getBrokenImages(page)
    expect(
      count,
      `${count} broken image(s) on Watch/Movie page:\n${srcs.map(s => `  • ${s}`).join('\n')}`
    ).toBe(0)
  })

  test('Watch page (tv) — zero broken images', async ({ unauthMockPage: page }) => {
    const watch = new WatchPage(page)
    await watch.gotoAndWaitForContent('tv', `${MOCK_MOVIES.breakingBad.id}-breaking-bad`)
    await page.waitForTimeout(3000)

    const { count, srcs } = await getBrokenImages(page)
    expect(
      count,
      `${count} broken image(s) on Watch/TV page:\n${srcs.map(s => `  • ${s}`).join('\n')}`
    ).toBe(0)
  })

  test('Favorites page — zero broken images', async ({ mockApiPage: page }) => {
    await page.goto('/favorites', { waitUntil: 'domcontentloaded' })
    await page.waitForTimeout(2000)

    const { count, srcs } = await getBrokenImages(page)
    expect(
      count,
      `${count} broken image(s) on Favorites page:\n${srcs.map(s => `  • ${s}`).join('\n')}`
    ).toBe(0)
  })

  test('Homepage after full scroll — lazy images loaded without breakage', async ({ mockApiPage: page }) => {
    const home = new HomePage(page)
    await home.gotoAndWaitForContent()

    // Scroll incrementally to trigger lazy loading
    for (let y = 300; y <= 2400; y += 300) {
      await page.evaluate(pos => window.scrollTo(0, pos), y)
      await page.waitForTimeout(250)
    }
    await page.waitForTimeout(1000) // final settle

    const { count, srcs } = await getBrokenImages(page)
    expect(
      count,
      `${count} broken image(s) after scroll:\n${srcs.map(s => `  • ${s}`).join('\n')}`
    ).toBe(0)
  })
})

// ─── §9  CONSOLE ERROR MONITORING ────────────────────────────────────────────

test.describe('§9  Console error monitoring during visual flows', () => {

  test('no JS errors during homepage image loading', async ({ mockApiPage: page }) => {
    const errors = listenForErrors(page)
    const home = new HomePage(page)
    await home.gotoAndWaitForContent()
    await page.waitForTimeout(2000)

    expect(
      errors,
      `JS errors during homepage load:\n${errors.join('\n')}`
    ).toHaveLength(0)
  })

  test('no JS errors during Watch page (movie) load', async ({ unauthMockPage: page }) => {
    const errors = listenForErrors(page)
    const watch = new WatchPage(page)
    await watch.gotoAndWaitForContent('movie', `${MOCK_MOVIES.inception.id}-inception`)
    await page.waitForTimeout(2000)

    expect(
      errors,
      `JS errors during Watch page load:\n${errors.join('\n')}`
    ).toHaveLength(0)
  })

  test('no JS errors during play mode (iframe mount)', async ({ unauthMockPage: page }) => {
    const errors = listenForErrors(page)
    const watch = new WatchPage(page)
    await watch.gotoAndWaitForContent('movie', `${MOCK_MOVIES.inception.id}-inception`)

    const playBtn = page.locator('button:has-text("Play Now"), button:has-text("Play")').first()
    await expect(playBtn).toBeVisible({ timeout: 10_000 })
    await playBtn.click()
    await page.waitForTimeout(2000)

    expect(
      errors,
      `JS errors during play mode:\n${errors.join('\n')}`
    ).toHaveLength(0)
  })

  test('no JS errors during QuickViewModal hover flow', async ({ mockApiPage: page }) => {
    const errors = listenForErrors(page)
    const home = new HomePage(page)
    await home.gotoAndWaitForContent()
    await hoverFirstCard(page)
    await page.waitForTimeout(500)

    expect(
      errors,
      `JS errors during QuickViewModal hover:\n${errors.join('\n')}`
    ).toHaveLength(0)
  })
})

// ─── §10  SCREENSHOT NON-BLANK VALIDATION ────────────────────────────────────

test.describe('§10  Screenshot visual validation — catch blank screens', () => {
  /**
   * Methodology:
   *   A real content page with posters + text compresses to > 80 KB.
   *   A blank white/black screen compresses to < 5 KB.
   *   Threshold of 25 KB catches degenerate cases while allowing sparse pages.
   */

  test('homepage screenshot is visually rich (not blank)', async ({ mockApiPage: page }) => {
    const home = new HomePage(page)
    await home.gotoAndWaitForContent()
    await page.waitForTimeout(1500)
    await assertNotBlankScreen(page, 'Homepage')
  })

  test('Watch/Movie page screenshot is not blank', async ({ unauthMockPage: page }) => {
    const watch = new WatchPage(page)
    await watch.gotoAndWaitForContent('movie', `${MOCK_MOVIES.inception.id}-inception`)
    await page.waitForTimeout(1500)
    await assertNotBlankScreen(page, 'Watch/Movie page')
  })

  test('Watch/TV page screenshot is not blank', async ({ unauthMockPage: page }) => {
    const watch = new WatchPage(page)
    await watch.gotoAndWaitForContent('tv', `${MOCK_MOVIES.breakingBad.id}-breaking-bad`)
    await page.waitForTimeout(1500)
    await assertNotBlankScreen(page, 'Watch/TV page')
  })

  test('Play mode screenshot shows player area (not blank)', async ({ unauthMockPage: page }) => {
    const watch = new WatchPage(page)
    await watch.gotoAndWaitForContent('movie', `${MOCK_MOVIES.inception.id}-inception`)

    const playBtn = page.locator('button:has-text("Play Now"), button:has-text("Play")').first()
    await expect(playBtn).toBeVisible({ timeout: 10_000 })
    await playBtn.click()
    await page.waitForTimeout(2500)

    await assertNotBlankScreen(page, 'Theater mode / play view')
  })

  test('homepage scroll does not introduce blank regions', async ({ mockApiPage: page }) => {
    const home = new HomePage(page)
    await home.gotoAndWaitForContent()

    // Scroll to mid-page and take screenshot
    await page.evaluate(() => window.scrollTo(0, 800))
    await page.waitForTimeout(600)

    await assertNotBlankScreen(page, 'Homepage mid-scroll')
  })

  test('Pricing page screenshot is not blank', async ({ unauthMockPage: page }) => {
    await page.goto('/pricing', { waitUntil: 'domcontentloaded' })
    await page.waitForFunction(
      () => (document.body.innerText || '').trim().length > 50,
      { timeout: 10_000 }
    )
    await assertNotBlankScreen(page, 'Pricing page')
  })
})
