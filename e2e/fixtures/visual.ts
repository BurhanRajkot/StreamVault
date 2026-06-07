/**
 * StreamVault E2E — Visual Pixel Verification
 * Location: e2e/fixtures/visual.ts
 *
 * DOM presence (an <img> exists, an <iframe> has a src) does NOT prove that
 * anything was painted. A blank poster, a "no image" placeholder, a black
 * video-error box and a still-loading spinner all satisfy the usual locator
 * assertions — which is exactly why your tests pass while the screen is empty.
 *
 * These helpers screenshot a region, decode the PNG, and measure how many
 * distinct colors are present. A solid / near-solid block collapses to a
 * handful of colors; real content has many. This is the one check that
 * actually fails on a black or white box — and it works on cross-origin
 * iframes too, because Playwright's compositor screenshot captures their
 * rendered pixels even though the DOM cannot read them.
 *
 * Requires: npm i -D pngjs @types/pngjs
 */

import { PNG } from 'pngjs'
import { expect, type Locator, type Page } from '@playwright/test'

/** Count distinct (4-bit-quantized) colors sampled across a PNG buffer. */
function countColors(buffer: Buffer): number {
  const png = PNG.sync.read(buffer)
  const { data } = png
  const totalPx = Math.floor(data.length / 4)
  if (totalPx === 0) return 0

  // Sample ~4000 evenly spaced pixels regardless of region size (fast + stable).
  const targetSamples = 4000
  const stridePx = Math.max(1, Math.floor(totalPx / targetSamples))
  const seen = new Set<number>()

  for (let px = 0; px < totalPx; px += stridePx) {
    const i = px * 4
    if (data[i + 3] === 0) continue // skip fully transparent pixels
    const r = data[i] >> 4
    const g = data[i + 1] >> 4
    const b = data[i + 2] >> 4
    seen.add((r << 8) | (g << 4) | b)
  }
  return seen.size
}

/** Number of distinct colors visible in a region (for custom assertions). */
export async function regionColorCount(target: Locator | Page): Promise<number> {
  const buffer = await target.screenshot()
  return countColors(buffer)
}

/**
 * Fail if a region is a solid / near-solid block of color.
 *
 * @param target     Locator (image, iframe, card) or full Page.
 * @param label      Human-readable name used in the failure message.
 * @param minColors  Minimum distinct colors to count as "real content".
 *                   Posters/frames easily exceed 20+. Default 8 is a safe floor.
 */
export async function assertNotBlank(
  target: Locator | Page,
  label: string,
  minColors = 8,
): Promise<void> {
  const colors = await regionColorCount(target)
  expect(
    colors,
    `${label}: only ${colors} distinct colors — region looks like a blank/black/white box, not real content`,
  ).toBeGreaterThan(minColors)
}

/**
 * Assert an <img> locator was actually decoded by the browser AND is not a
 * blank placeholder. Combines naturalWidth (catches 404 / broken images) with
 * the pixel check (catches decoded-but-blank fallback images that naturalWidth
 * happily passes).
 */
export async function assertImageRendered(img: Locator, label: string): Promise<void> {
  await expect(img, `${label}: image not visible`).toBeVisible({ timeout: 12_000 })

  const naturalWidth = await img.evaluate((el: HTMLImageElement) => el.naturalWidth)
  const src = await img.getAttribute('src')
  expect(
    naturalWidth,
    `${label}: naturalWidth=${naturalWidth} (broken/undecoded image)\n  src: ${src}`,
  ).toBeGreaterThan(10)

  await assertNotBlank(img, label)
}

/**
 * Assert that no loading spinner / skeleton remains visible on the page.
 * Catches the "test passed but the screen was still loading" class of bug.
 */
export async function assertNotStillLoading(page: Page, timeout = 10_000): Promise<void> {
  const spinner = page
    .locator(
      '[role="progressbar"], [aria-busy="true"], [class*="spinner" i], [class*="skeleton" i], [data-loading="true"]',
    )
    .first()
  await expect(
    spinner,
    'A loading spinner/skeleton is still visible — content did not finish rendering',
  ).toBeHidden({ timeout })
}
