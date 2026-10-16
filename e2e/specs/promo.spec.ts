/**
 * The "Premium is free" announcement a first-time visitor sees on the home
 * page while the promotion runs.
 */

import { test, expect } from '../fixtures/test'

test.use({ firstVisit: true })

test.beforeEach(async ({ page }) => {
  // Past the one-time disclaimer — this spec is about the announcement.
  await page.addInitScript(() => sessionStorage.setItem('disclaimerAccepted', 'true'))
})

test('tells visitors Premium is free with no sign-in needed', async ({ home }) => {
  await home.goto()

  await expect(home.promoAnnouncement).toBeVisible()
  await expect(home.promoAnnouncement).toContainText('Premium servers are free for 6 months')
  await expect(home.promoAnnouncement).toContainText('no sign-in needed')
  await expect(home.promoAnnouncement).toContainText('Apr 11, 2027')
  await expect(home.promoAnnouncement.getByRole('link', { name: /sign in/i })).toHaveCount(0)
})

test('stays dismissed once closed', async ({ page, home }) => {
  await home.goto()
  await home.promoAnnouncement.getByRole('button', { name: 'Start watching' }).click()
  await expect(home.promoAnnouncement).toBeHidden()

  await page.reload()
  await expect(home.featured).toBeVisible()
  await expect(home.promoAnnouncement).toBeHidden()
})

test('is not shown once the promotion is over', async ({ home, mockApi }) => {
  mockApi.state.promoFreeUntil = null
  await home.goto()
  await expect.poll(() => mockApi.calls('GET', '/debrid/promo').length).toBeGreaterThan(0)

  await expect(home.promoAnnouncement).toBeHidden()
})
