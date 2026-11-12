/**
 * The "Premium is paused for a few days" popup: shown once per visit on the
 * home page, closes by itself after 7 seconds, and asks for a donation or a
 * GitHub star.
 */

import type { Page } from '@playwright/test'
import { test, expect } from '../fixtures/test'
import { PREMIUM_PAUSED } from '../../src/lib/premiumPause'

test.use({ pausedNotice: true })
test.skip(!PREMIUM_PAUSED, 'Premium is running — no pause notice')

const notice = (page: Page) => page.getByRole('dialog', { name: 'Premium is paused for a few days' })

/**
 * Not `home.goto()`: that waits for the hero carousel, which the open popup
 * hides from the accessibility tree (it's modal) until it closes itself.
 */
async function openHome(page: Page) {
  await page.goto('/')
  await expect(notice(page)).toBeVisible()
}

test.beforeEach(async ({ page }) => {
  await page.clock.install()
})

test('explains the pause, points to the free servers and asks for support', async ({ page }) => {
  await openHome(page)

  await expect(notice(page)).toContainText('back in 3–4 days')
  await expect(notice(page)).toContainText('free servers work as usual')
  await expect(notice(page).getByRole('button', { name: 'Donate' })).toBeVisible()
  await expect(notice(page).getByRole('link', { name: 'Star on GitHub' })).toHaveAttribute(
    'href',
    'https://github.com/BurhanRajkot/StreamVault'
  )
})

test('closes by itself after 7 seconds and stays closed for the visit', async ({ page, home }) => {
  await openHome(page)

  await page.clock.runFor(7_000)
  await expect(notice(page)).toBeHidden()

  await page.reload()
  await expect(home.featured).toBeVisible()
  await expect(notice(page)).toHaveCount(0)
})

test('Donate shows the UPI QR code and keeps the popup open', async ({ page }) => {
  await openHome(page)
  await notice(page).getByRole('button', { name: 'Donate' }).click()

  const qr = page.getByRole('dialog').getByRole('img', { name: 'UPI QR code to donate to StreamVault' })
  await expect(qr).toBeVisible()
  await page.clock.runFor(10_000)
  await expect(qr).toBeVisible()

  await page.getByRole('dialog').getByRole('button', { name: 'Done' }).click()
  await expect(page.getByRole('dialog')).toHaveCount(0)
})

test('the ✕ closes it', async ({ page }) => {
  await openHome(page)
  await notice(page).getByRole('button', { name: 'Close' }).click()
  await expect(notice(page)).toHaveCount(0)
})
