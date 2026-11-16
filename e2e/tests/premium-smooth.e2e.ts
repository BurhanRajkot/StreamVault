/**
 * ⚡ A release that doesn't play smoothly is swapped for one that does, the
 * way the viewer would from the Quality menu — found in the background
 * while the film plays on, started where the viewer was, and said so with
 * an Undo. Deterministic: no agent steps.
 *
 * No headless browser drops frames on cue, so the device's frame counter
 * (getVideoPlaybackQuality) is stood in for: a third of the frames of the
 * converted stream never reach the screen.
 *
 * Which stalls and dropped frames count, and which release to move to, is
 * unit-tested: src/lib/streamRecovery.test.ts and releasePlayback.test.ts.
 */

import { expect } from 'e2e'
import { adminTest } from './fixtures'
import { MOVIE, convertedPlayback, release, watchPath } from '../fixtures/data'

/** Settling after the start (8 s), a full window of judder (10 s) read every 2 s, then the new release. */
const SWITCH_WAIT_MS = 35_000

adminTest('a release that judders is swapped for a lighter one, and Undo goes back', async ({ app, screen, browser, mockApi }) => {
  await browser.addInitScript(() => {
    const since = performance.now()
    HTMLVideoElement.prototype.getVideoPlaybackQuality = function (this: HTMLVideoElement) {
      const total = Math.floor(((performance.now() - since) / 1000) * 24)
      // Real-Debrid's converted stream plays through hls.js, from a blob: address.
      const dropped = this.currentSrc.startsWith('blob:') ? Math.floor(total / 3) : 0
      return { totalVideoFrames: total, droppedVideoFrames: dropped, corruptedVideoFrames: 0, creationTime: performance.now() }
    }
  })
  const big = release({ name: 'Inception.2010.1080p.BluRay.x264.AAC-BIG', size: String(9_000_000_000) })
  const small = release({ name: 'Inception.2010.720p.BluRay.x264.AAC-SMALL', size: String(1_500_000_000) })
  mockApi.on('GET', '/debrid/media-search', { json: { data: [big, small] } })
  mockApi.on('POST', '/debrid/play', { json: convertedPlayback() })
  const played = () => mockApi.calls('POST', '/debrid/play').map((c) => (c.body as { hash: string }).hash)

  await app.open(watchPath(MOVIE))
  await screen.getByRole('combobox', 'Server').tap()
  await screen.getByRole('option', /^Premium/).tap()
  await screen.getByRole('button', /^Play( Now)?$/).first().tap()
  await expect(screen.getByTestId('debrid-video')).toBeVisible()
  // The 720p one is asked about too, in case it played from its file (it doesn't: both convert).
  const atStart = played()
  expect(atStart[0], 'starts on the 1080p release').toBe(big.info_hash)

  const notice = screen.getByText(/^Switched to 720p · 1\.4 GB — the last copy wasn’t playing smoothly on this device\.$/)
  await expect(notice).toBeVisible({ timeout: SWITCH_WAIT_MS })
  expect(played().slice(atStart.length), 'moved to the lighter release').toEqual([small.info_hash])
  await expect(screen.getByTestId('debrid-video')).toBeVisible()

  await screen.getByRole('button', 'Undo').tap()
  await expect(notice).toBeHidden()
  await expect(screen.getByTestId('debrid-video')).toBeVisible()
  expect(played().slice(atStart.length), 'back on the release the viewer had').toEqual([small.info_hash, big.info_hash])
})
