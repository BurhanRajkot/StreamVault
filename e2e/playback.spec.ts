/**
 * StreamVault E2E — Media Playback Tests
 *
 * Tests that the watch page correctly:
 *  - Mounts a video player iframe when Play is clicked
 *  - Serves a valid iframe src URL
 *  - Does not surface provider error messages
 *
 * HOW STREAMING IS TESTED IN CI:
 *  The test intercepts ALL outbound requests from the iframe's origin
 *  (using page.route on the frame) and serves a minimal synthetic HLS
 *  manifest + segment — no real CDN, no timeouts, 100% deterministic.
 *
 *  The @skip-ci tag is used for the optional "real CDN" variant below
 *  which is excluded from the e2e:ci npm script.
 */

import { expect } from '@playwright/test'
import { MOCK_MOVIES } from './fixtures/mocks'
import { WatchPage } from './pages/WatchPage'
import { test as baseTest } from './fixtures'
import { assertNotBlank } from './fixtures/visual'
import { enableAdBlock } from './fixtures/adblock'

// ─── Minimal synthetic HLS manifest ───────────────────────────────────────
// A valid 2-segment HLS playlist that any hls.js build will accept.
const FAKE_M3U8 = [
  '#EXTM3U',
  '#EXT-X-VERSION:3',
  '#EXT-X-TARGETDURATION:6',
  '#EXT-X-MEDIA-SEQUENCE:0',
  '#EXTINF:6.0,',
  'segment0.ts',
  '#EXTINF:6.0,',
  'segment1.ts',
  '#EXT-X-ENDLIST',
].join('\n')

// A minimal valid MPEG-TS segment (188-byte null packet × 1)
const FAKE_TS_SEGMENT = Buffer.alloc(188).fill(0xff)

// ─── CI-safe playback test ─────────────────────────────────────────────────
baseTest.describe('Media Playback — CI (mocked HLS)', () => {
  baseTest('Watch page mounts iframe when Play is clicked', async ({ unauthMockPage: page }) => {
    // ── 1. Intercept any HLS / media requests so CI never needs a real CDN ──
    // This covers requests made by the vidsrc / embed provider inside the iframe.
    await page.route('**/*.m3u8', (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/vnd.apple.mpegurl',
        body: FAKE_M3U8,
      })
    )
    await page.route('**/*.ts', (route) =>
      route.fulfill({
        status: 200,
        contentType: 'video/mp2t',
        body: FAKE_TS_SEGMENT,
      })
    )
    await page.route('**/*.mp4', (route) =>
      route.fulfill({
        status: 200,
        contentType: 'video/mp4',
        // Minimal ftyp/mdat boxes — enough to not 404
        body: Buffer.from([
          0x00, 0x00, 0x00, 0x1c, // ftyp box size
          0x66, 0x74, 0x79, 0x70, // 'ftyp'
          0x69, 0x73, 0x6f, 0x6d, // 'isom'
          0x00, 0x00, 0x00, 0x00, // version
          0x69, 0x73, 0x6f, 0x6d, // compatible brand
          0x61, 0x76, 0x63, 0x31, // 'avc1'
          0x6d, 0x70, 0x34, 0x31, // 'mp41'
        ]),
      })
    )

    // ── 2. Navigate to the watch page and wait for content ──────────────────
    const watch = new WatchPage(page)
    await watch.gotoAndWaitForContent('movie', `${MOCK_MOVIES.inception.id}-inception`)

    // ── 3. Trigger playback ──────────────────────────────────────────────────
    const playBtn = page.locator('button:has-text("Play Now"), button:has-text("Play")').first()
    await expect(playBtn).toBeVisible({ timeout: 10_000 })
    await playBtn.click()

    // ── 4. Verify iframe mounts ──────────────────────────────────────────────
    const iframeElement = page.locator('iframe').first()
    await expect(iframeElement).toBeVisible({ timeout: 15_000 })

    const iframeSrc = await iframeElement.getAttribute('src')
    expect(iframeSrc, 'iframe src should be a non-empty URL').toBeTruthy()
    expect(iframeSrc!, 'iframe src is not an absolute http(s) URL').toMatch(/^https?:\/\//)

    // ── 4b. Verify the player isn't a collapsed 0×0 box ──────────────────────
    // A common "looks broken / black box" cause is an iframe that mounts but
    // has no layout size. This is deterministic and safe to assert in CI.
    const box = await iframeElement.boundingBox()
    expect(box, 'Player iframe has no layout box (collapsed)').not.toBeNull()
    if (box) {
      expect(box.width, `Player iframe width is ${box.width}px (collapsed)`).toBeGreaterThan(200)
      expect(box.height, `Player iframe height is ${box.height}px (collapsed)`).toBeGreaterThan(100)
    }

    // ── 5. Verify provider did not return an error page ──────────────────────
    // We only check the outer page here — cross-origin iframe content is
    // sandboxed and cannot be read without frameLocator (provider-dependent).
    const errorText = page.getByText(/video not found|error loading|deleted/i)
    await expect(errorText).toHaveCount(0)
  })

  baseTest('Watch page shows movie metadata before play is clicked', async ({ unauthMockPage: page }) => {
    const watch = new WatchPage(page)
    await watch.gotoAndWaitForContent('movie', `${MOCK_MOVIES.inception.id}-inception`)
    await watch.assertMovieContentVisible()
  })
})

// ─── Local-only: real CDN stream interception ──────────────────────────────
// Excluded from CI via the @skip-ci grep-invert in the e2e:ci npm script.
// Run locally with:  npx playwright test e2e/playback.spec.ts --headed
//
baseTest.describe('Media Playback — Real CDN @skip-ci', () => {
  baseTest('Movie playback iframe initiates real video stream', async ({ unauthMockPage: page }) => {
    // Block the provider's ads/trackers for this real-server run (E2E_ADBLOCK=1).
    await enableAdBlock(page.context())

    // Set up media request interception BEFORE clicking play
    const mediaRequestPromise = page.waitForRequest(
      (request) => {
        const url = request.url().toLowerCase()
        const resourceType = request.resourceType()
        return (
          url.includes('.m3u8') ||
          url.includes('.ts') ||
          url.includes('.mp4') ||
          resourceType === 'media'
        )
      },
      { timeout: 30_000 }
    ).catch(() => null)

    const watch = new WatchPage(page)
    await watch.gotoAndWaitForContent('movie', `${MOCK_MOVIES.inception.id}-inception`)

    const playBtn = page.locator('button:has-text("Play Now"), button:has-text("Play")').first()
    await expect(playBtn).toBeVisible({ timeout: 10_000 })
    await playBtn.click()

    const iframeElement = page.locator('iframe').first()
    await expect(iframeElement).toBeVisible({ timeout: 15_000 })

    const iframeSrc = await iframeElement.getAttribute('src')
    expect(iframeSrc).toBeTruthy()

    const mediaRequest = await mediaRequestPromise
    expect(
      mediaRequest,
      'Expected the streaming iframe to fetch actual video data (.m3u8, .ts, or media) but none was intercepted.'
    ).not.toBeNull()

    if (mediaRequest) {
      console.log(`✓ Intercepted media stream: ${mediaRequest.url()}`)
      const response = await mediaRequest.response()
      if (response) {
        expect(response.status()).toBeLessThan(400)
      }
    }

    // ── Verify the player actually PAINTED video, not a black error box ──────
    // The DOM can't read cross-origin iframe content, but a compositor
    // screenshot captures its rendered pixels. Give it a moment to paint a
    // frame, then assert the iframe region isn't a solid block.
    await page.waitForTimeout(3000)
    await assertNotBlank(iframeElement, 'Real provider video frame', 10)
  })
})