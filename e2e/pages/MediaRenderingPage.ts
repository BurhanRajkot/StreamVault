/**
 * StreamVault E2E — MediaRenderingPage
 *
 * Page-object with deep media rendering assertion helpers:
 *   - Poster image decode verification (naturalWidth > 0)
 *   - Backdrop image rendering checks
 *   - HoverVideoPlayer container validation
 *   - Embed iframe validation
 *   - QuickViewModal trigger & inspection
 *   - Global broken image scanning
 *   - Screenshot blank-detection
 */

import { expect } from '@playwright/test'
import type { Page, Locator } from '@playwright/test'
import { BasePage } from './BasePage'

const TMDB_IMG_DOMAIN = 'image.tmdb.org'

const STREAMING_DOMAINS = [
  'vidsrc.to', 'vidfast.pro', 'vidsrc.icu',
  'vidlink.pro', 'vidsrc.cc', 'player.videasy.net',
]

export interface ImageReport {
  src: string
  naturalWidth: number
  naturalHeight: number
  complete: boolean
  /** true = element has non-zero bounding rect */
  rendered: boolean
}

export interface BrokenImageReport {
  count: number
  srcs: string[]
}

export class MediaRenderingPage extends BasePage {
  constructor(page: Page) {
    super(page)
  }

  // ─── Image Scanning ────────────────────────────────────────────────────────

  /**
   * Returns details about every <img> on the page.
   * Includes naturalWidth (0 = broken), complete flag, and bounding-rect visibility.
   */
  async getAllImageReports(): Promise<ImageReport[]> {
    return this.page.evaluate((): ImageReport[] => {
      return [...document.querySelectorAll('img') as NodeListOf<HTMLImageElement>].map(img => {
        const rect = img.getBoundingClientRect()
        return {
          src: img.src,
          naturalWidth: img.naturalWidth,
          naturalHeight: img.naturalHeight,
          complete: img.complete,
          rendered: rect.width > 0 && rect.height > 0,
        }
      })
    })
  }

  /**
   * Returns images that are definitively broken:
   *   complete = true  AND  naturalWidth = 0  AND  src is not empty.
   * These show as grey broken-image icons in the browser.
   */
  async getBrokenImages(): Promise<BrokenImageReport> {
    return this.page.evaluate((): BrokenImageReport => {
      const all = [...document.querySelectorAll('img') as NodeListOf<HTMLImageElement>]
      const broken = all.filter(
        img =>
          img.complete &&
          img.naturalWidth === 0 &&
          img.src !== '' &&
          !img.src.startsWith('data:')
      )
      return { count: broken.length, srcs: broken.map(i => i.src) }
    })
  }

  /**
   * Wait for all images currently in the DOM to finish loading (complete = true).
   */
  async waitForAllImagesToLoad(timeoutMs = 10_000) {
    await this.page.waitForFunction(
      () =>
        [...document.querySelectorAll('img') as NodeListOf<HTMLImageElement>].every(
          img => img.complete
        ),
      { timeout: timeoutMs }
    )
  }

  /**
   * Assert zero broken images on the page.
   * Throws with a detailed URL list if any are found.
   */
  async assertNoBrokenImages(label = 'Page') {
    await this.page.waitForTimeout(2000)
    const { count, srcs } = await this.getBrokenImages()
    expect(
      count,
      `[${label}] ${count} broken image(s) (complete=true, naturalWidth=0):\n` +
      srcs.map(s => `  • ${s}`).join('\n')
    ).toBe(0)
  }

  // ─── TMDB Image Validation ────────────────────────────────────────────────

  /** Returns all TMDB image URLs currently in <img> src attributes on the page. */
  async getTMDBImageSrcs(): Promise<string[]> {
    return this.page.evaluate((domain: string): string[] =>
      [...document.querySelectorAll('img') as NodeListOf<HTMLImageElement>]
        .map(img => img.src)
        .filter(src => src.includes(domain))
      , TMDB_IMG_DOMAIN)
  }

  /**
   * Assert at least `minCount` TMDB images are present and none use /original/.
   */
  async assertTMDBImagesPresent(minCount = 1) {
    const srcs = await this.getTMDBImageSrcs()
    expect(
      srcs.length,
      `Expected ≥ ${minCount} TMDB images, found ${srcs.length}`
    ).toBeGreaterThanOrEqual(minCount)

    const originals = srcs.filter(s => s.includes('/original/'))
    expect(
      originals.length,
      `Found ${originals.length} /original/ TMDB images (unoptimized):\n` +
      originals.map(s => `  ${s}`).join('\n')
    ).toBe(0)
  }

  /**
   * Assert a specific TMDB image path fragment is present in some img src.
   */
  async assertTMDBPathOnPage(tmdbPath: string) {
    const srcs = await this.getTMDBImageSrcs()
    const found = srcs.some(s => s.includes(tmdbPath))
    expect(
      found,
      `TMDB path "${tmdbPath}" not found on page.\nActual srcs:\n${srcs.map(s => `  ${s}`).join('\n')}`
    ).toBe(true)
  }

  // ─── Image Decode Verification ────────────────────────────────────────────

  /**
   * Assert a specific <img> has actually decoded in the browser (naturalWidth > 0).
   * This is the only reliable way to confirm rendering — not just src presence.
   */
  async assertImageDecoded(imgLocator: Locator, label: string, minWidth = 10) {
    await expect(imgLocator).toBeAttached({ timeout: 15_000 })

    const result = await imgLocator.evaluate(
      (img: HTMLImageElement, args: { lbl: string; min: number }) =>
        new Promise<{ ok: boolean; err: string }>(resolve => {
          const check = () => {
            if (img.naturalWidth >= args.min) return resolve({ ok: true, err: '' })
            if (img.complete) {
              return resolve({
                ok: false,
                err: `naturalWidth=${img.naturalWidth} after complete (broken/404): ${img.src}`,
              })
            }
          }
          check()
          img.addEventListener('load', check, { once: true })
          img.addEventListener('error', () =>
            resolve({ ok: false, err: `onerror fired: ${img.src}` }),
            { once: true }
          )
          setTimeout(() => resolve({ ok: false, err: `timeout: ${img.src}` }), 12_000)
        })
      ,
      { lbl: label, min: minWidth }
    )

    expect(result.ok, `[${label}] Image decode failed: ${result.err}`).toBe(true)

    const box = await imgLocator.boundingBox()
    expect(box, `[${label}] Image has no bounding box`).not.toBeNull()
    if (box) {
      expect(box.width, `[${label}] Image width is 0`).toBeGreaterThan(4)
      expect(box.height, `[${label}] Image height is 0`).toBeGreaterThan(4)
    }
  }

  /**
   * Check all visible TMDB images are decoded (up to `limit`).
   */
  async assertAllVisibleTMDBImagesDecoded(limit = 8) {
    const imgs = this.page.locator(`img[src*="${TMDB_IMG_DOMAIN}"]`)
    const count = await imgs.count()
    const checkCount = Math.min(count, limit)

    const failures: string[] = []
    for (let i = 0; i < checkCount; i++) {
      const img = imgs.nth(i)
      const visible = await img.isVisible().catch(() => false)
      if (!visible) continue

      const info = await img.evaluate((el: HTMLImageElement) => ({
        src: el.src,
        naturalWidth: el.naturalWidth,
        complete: el.complete,
      }))

      if (info.complete && info.naturalWidth === 0) {
        failures.push(`img #${i + 1}: naturalWidth=0 — ${info.src}`)
      }
    }

    expect(
      failures.length,
      `${failures.length} TMDB image(s) failed to decode:\n${failures.join('\n')}`
    ).toBe(0)
  }

  // ─── Iframe / Video Player ────────────────────────────────────────────────

  /** Finds first streaming provider iframe. Returns null if none found. */
  async findStreamingIframe(): Promise<Locator | null> {
    const iframes = this.page.locator('iframe')
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
   * Assert a streaming iframe is present and has a valid src containing the TMDB ID.
   */
  async assertStreamingIframePresent(expectedTMDBId?: number) {
    const iframe = await this.findStreamingIframe()
    expect(
      iframe,
      `No streaming iframe found. Expected src to contain one of: ${STREAMING_DOMAINS.join(', ')}`
    ).not.toBeNull()
    if (!iframe) return

    const src = await iframe.getAttribute('src')
    expect(src, 'Streaming iframe src is null').toBeTruthy()
    expect(src!.length, 'Streaming iframe src is empty').toBeGreaterThan(10)

    if (expectedTMDBId !== undefined) {
      expect(
        src!.includes(String(expectedTMDBId)),
        `Streaming src "${src}" does not contain TMDB ID ${expectedTMDBId}`
      ).toBe(true)
    }

    const box = await iframe.boundingBox()
    expect(box, 'Streaming iframe has no bounding box').not.toBeNull()
    if (box) {
      expect(box.width, 'Streaming iframe width is 0').toBeGreaterThan(50)
      expect(box.height, 'Streaming iframe height is 0').toBeGreaterThan(30)
    }
  }

  // ─── QuickViewModal ───────────────────────────────────────────────────────

  get quickViewModal(): Locator {
    return this.page
      .locator('body > [class*="rounded-lg"][class*="shadow-2xl"]')
      .or(this.page.locator('[class*="rounded-lg"][class*="shadow-2xl"][style*="position: absolute"]'))
      .first()
  }

  get quickViewCloseBtn(): Locator {
    return this.page.locator('button[aria-label="Close quick view"]').first()
  }

  /**
   * Hover the first media card for long enough to trigger the QuickViewModal.
   * Returns true if a card was found and hovered.
   */
  async triggerQuickViewOnFirstCard(): Promise<boolean> {
    const card = this.page.locator(
      '.group.relative.cursor-pointer, [role="button"]:has(img[src*="tmdb"])'
    ).first()
    const visible = await card.isVisible({ timeout: 10_000 }).catch(() => false)
    if (!visible) return false
    await card.hover()
    await this.page.waitForTimeout(2200)
    return true
  }

  /**
   * Assert the QuickViewModal opened and contains real content.
   * Throws with a diagnostic message if it didn't open on desktop.
   */
  async assertQuickViewModalOpen() {
    const modal = this.quickViewModal
    const visible = await modal.isVisible().catch(() => false)

    if (!visible) {
      const vp = this.page.viewportSize()
      if (vp && vp.width < 768) return // expected on mobile — QuickView is desktop-only

      throw new Error(
        'QuickViewModal is NOT visible after hover trigger.\n' +
        'Expected: modal appears 1500ms after hover on desktop.\n' +
        'This is the "click image → white screen" bug — modal failed to mount.\n' +
        'Debug: check MediaCard.handleMouseEnter() → setTimeout(setShowQuickView, 1500)'
      )
    }

    const text = await modal.innerText().catch(() => '')
    expect(
      text.trim().length,
      'QuickViewModal opened but has no text content — renders blank box'
    ).toBeGreaterThan(3)
  }

  // ─── Screenshot Blank Detection ───────────────────────────────────────────

  /**
   * Take a viewport screenshot and assert it is not blank (< 25 KB = blank).
   */
  async assertNotBlankViewport(label: string) {
    const buf = await this.page.screenshot({ fullPage: false })
    const kb = buf.length / 1024
    expect(
      kb,
      `[${label}] Viewport screenshot is ${kb.toFixed(1)} KB — page appears blank`
    ).toBeGreaterThan(25)
  }

  /**
   * Crop screenshot to a specific element and assert it is not blank.
   */
  async assertElementNotBlank(locator: Locator, label: string, minKB = 5) {
    const box = await locator.boundingBox()
    if (!box) throw new Error(`[${label}] Element has no bounding box — not rendered`)

    const buf = await this.page.screenshot({
      clip: { x: box.x, y: box.y, width: box.width, height: box.height },
    })
    const kb = buf.length / 1024
    expect(
      kb,
      `[${label}] Element screenshot is ${kb.toFixed(1)} KB — renders blank`
    ).toBeGreaterThan(minKB)
  }
}
