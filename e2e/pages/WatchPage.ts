import { expect, type FrameLocator, type Locator, type Page } from '@playwright/test'
import { type MediaFixture, titleOf, watchPath } from '../fixtures/data'

/**
 * The title page (/watch/:type/:id): details, server picker, and the player
 * — either ⚡ Premium's own <video> or an embed server's iframe.
 *
 * Desktop and mobile render different pre-play layouts ("Play Now" vs
 * "Play"), so locators here match both. Everything is scoped to the title
 * page's root: opened from another page it's an overlay, and that page —
 * its own Play buttons and headings — is still in the DOM underneath.
 */
export class WatchPage {
  readonly root: Locator
  readonly playButton: Locator
  readonly serverPicker: Locator
  readonly premiumVideo: Locator
  /** The Premium player's seek bar; its value text is the position shown, e.g. "1:00 of 1:30". */
  readonly seekBar: Locator
  readonly premiumLoading: Locator
  readonly embed: Locator
  readonly embedFrame: FrameLocator

  constructor(readonly page: Page) {
    this.root = page.getByTestId('title-page')
    this.playButton = this.root.getByRole('button', { name: /^Play( Now)?$/ })
    this.serverPicker = this.root.getByRole('combobox', { name: 'Server' })
    this.premiumVideo = this.root.getByTestId('debrid-video')
    this.seekBar = this.root.getByRole('slider', { name: 'Seek' })
    this.premiumLoading = this.root.getByTestId('debrid-loading')
    this.embed = this.root.locator('.player-frame iframe')
    this.embedFrame = this.root.frameLocator('.player-frame iframe')
  }

  heading(media: MediaFixture): Locator {
    return this.root.getByRole('heading', { level: 1, name: titleOf(media), exact: true })
  }

  async goto(media: MediaFixture): Promise<void> {
    await this.page.goto(watchPath(media))
    await expect(this.heading(media)).toBeVisible()
  }

  async play(): Promise<void> {
    await this.playButton.click()
  }

  async chooseServer(name: string | RegExp): Promise<void> {
    await this.serverPicker.click()
    await this.page.getByRole('option', { name }).click()
  }

  /** The video is decoding and its clock is moving — not just mounted. */
  async expectPremiumPlaying(): Promise<void> {
    await expect(this.premiumVideo).toBeVisible()
    await expect
      .poll(() => this.premiumVideo.evaluate((v: HTMLVideoElement) => !v.paused && v.currentTime > 0.5), {
        message: 'Premium video should be playing',
        timeout: 15_000,
      })
      .toBe(true)
  }
}
