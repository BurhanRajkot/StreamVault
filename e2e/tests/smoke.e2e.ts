/**
 * Every top-level route renders — the fast "is the build alive" layer, on
 * the e2e framework. Deterministic: no agent steps, so no model is needed.
 * Port of e2e/specs/smoke.spec.ts (Playwright), which still runs in CI.
 */

import { expect } from 'e2e'
import { firstVisitTest, test } from './fixtures'
import { MOVIE, watchPath } from '../fixtures/data'

const ROUTES: { path: string; heading: string | RegExp }[] = [
  { path: watchPath(MOVIE), heading: 'Inception' },
  { path: '/pricing', heading: 'Unlock Premium Streaming' },
  { path: '/login', heading: 'Welcome back' },
  { path: '/signup', heading: /.+/ },
  { path: '/favorites', heading: /.+/ },
  { path: '/this-page-does-not-exist', heading: '404' },
]

const FEATURED = 'Featured content carousel'

test('home', { tags: ['smoke'] }, async ({ app, screen }) => {
  await app.open('/')
  await expect(screen.getByRole('region', FEATURED)).toBeVisible()
  await expect(screen.getByRole('banner').getByRole('link', /^StreamVault( home)?$/).first()).toBeVisible()
})

for (const { path, heading } of ROUTES) {
  test(path, { tags: ['smoke'] }, async ({ app, screen }) => {
    await app.open(path)
    await expect(screen.getByRole('heading', heading, { level: 1 }).first()).toBeVisible()
  })
}

firstVisitTest(
  'the disclaimer is shown once, and accepting it reveals the site',
  { tags: ['smoke'] },
  async ({ app, browser, screen }) => {
    await app.open('/')
    const accept = screen.getByRole('button', 'I Understand & Accept')
    await accept.tap()
    await expect(accept).toBeHidden()
    await expect(screen.getByRole('region', FEATURED)).toBeVisible()

    await browser.reload()
    await expect(screen.getByRole('region', FEATURED)).toBeVisible()
    await expect(accept).toBeHidden()
  }
)
