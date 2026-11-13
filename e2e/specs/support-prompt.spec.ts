/**
 * The "StreamVault isn't free to run" prompt — on the 5th Premium play, then
 * 10, 20 and 10 plays later, then every 15 — asking for a GitHub star or a
 * coffee before the video starts.
 */

import type { Page } from '@playwright/test'
import { test, expect } from '../fixtures/test'
import { MOVIE } from '../fixtures/data'

const PLAYS_KEY = 'sv:premium-plays'

/** Pretend this device has already played `count` titles on Premium. */
async function seedPlays(page: Page, count: number) {
  await page.addInitScript(([key, value]) => localStorage.setItem(key, value), [PLAYS_KEY, String(count)] as const)
}

const prompt = (page: Page) => page.getByRole('region', { name: 'StreamVault isn’t free to run' })

test.describe('Support prompt', () => {
  test('stays out of the way on a play that isn’t due one', async ({ page, watch }) => {
    await seedPlays(page, 5) // this play is the 6th
    await watch.gotoOnPremium(MOVIE)
    await watch.play()

    await watch.expectPremiumPlaying()
    await expect(prompt(page)).toHaveCount(0)
  })

  test('on the 5th play, asks first, and "Not now" plays the video', async ({ page, watch }) => {
    await seedPlays(page, 4)
    await watch.gotoOnPremium(MOVIE)
    await watch.play()

    await expect(prompt(page)).toBeVisible()
    await expect(watch.premiumVideo).toHaveCount(0)
    await expect(page.getByRole('link', { name: 'Star on GitHub' })).toHaveAttribute(
      'href',
      'https://github.com/BurhanRajkot/StreamVault'
    )

    await page.getByRole('button', { name: 'Not now' }).click()
    await watch.expectPremiumPlaying()
    expect(await page.evaluate((key) => localStorage.getItem(key), PLAYS_KEY)).toBe('5')
  })

  test('"Buy me a coffee" shows the UPI QR, then carries on to the video', async ({ page, watch }) => {
    await seedPlays(page, 14) // the 15th play is due one too
    await watch.gotoOnPremium(MOVIE)
    await watch.play()

    await page.getByRole('button', { name: 'Buy me a coffee' }).click()
    await expect(page.getByRole('img', { name: 'UPI QR code to buy me a coffee' })).toBeVisible()
    await expect(page.getByText('UPI: streamvault@upi')).toBeVisible()

    await page.getByRole('button', { name: 'Continue watching' }).click()
    await watch.expectPremiumPlaying()
  })
})
