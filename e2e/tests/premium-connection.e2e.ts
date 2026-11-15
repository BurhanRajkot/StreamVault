/**
 * ⚡ Premium on a connection that drops. A request that doesn't get through
 * is asked again a couple of times; when it still can't, the player says
 * the connection is the problem — not that Premium has no copy — and starts
 * the film by itself once the browser is back online. Deterministic: no
 * agent steps.
 *
 * What the player does with a weak connection mid-film (reconnecting where
 * it stopped, waiting while offline, a lighter release for a line that
 * can't keep up) is unit-tested: src/lib/streamRecovery.test.ts,
 * connection.test.ts and releasePlayback.test.ts.
 */

import { expect } from 'e2e'
import { adminTest } from './fixtures'
import { MOVIE, watchPath } from '../fixtures/data'

/** The search and the retries before the message: ~3.5 s, past the default wait. */
const GIVE_UP_WAIT_MS = 15_000

adminTest('a search that can’t get through says so, and the film starts once the connection is back', async ({ app, screen, browser, mockApi }) => {
  // A dropped connection, as fetch sees it: the request fails without an answer.
  let connected = false
  await browser.route(/\/debrid\/media-search/, (route) => (connected ? route.fallback() : route.abort()))

  await app.open(watchPath(MOVIE))
  await screen.getByRole('combobox', 'Server').tap()
  await screen.getByRole('option', /^Premium/).tap()
  await screen.getByRole('button', /^Play( Now)?$/).first().tap()

  await expect(screen.getByText('Couldn’t reach Premium — check your connection, then try again.')).toBeVisible({
    timeout: GIVE_UP_WAIT_MS,
  })
  await expect(screen.getByText('No Premium stream available')).toBeHidden()
  expect(mockApi.calls('POST', '/debrid/play'), 'no release was started').toHaveLength(0)

  connected = true
  await browser.evaluate(() => window.dispatchEvent(new Event('online')))

  await expect(screen.getByTestId('debrid-video')).toBeVisible()
  expect(mockApi.calls('POST', '/debrid/play')).toHaveLength(1)
})

adminTest('offline as the film starts, the player waits for the connection instead of failing', async ({ app, screen, browser }) => {
  // The browser says it's offline and the file can't be fetched; the
  // backend is still reachable, so a release is found and started.
  await browser.addInitScript(() => {
    Object.defineProperty(Navigator.prototype, 'onLine', {
      configurable: true,
      get: () => (window as unknown as { __e2eOnline?: boolean }).__e2eOnline ?? false,
    })
  })
  let connected = false
  await browser.route(/media\.e2e\.test\/sample\.webm/, (route) => (connected ? route.fallback() : route.abort()))

  await app.open(watchPath(MOVIE))
  await screen.getByRole('combobox', 'Server').tap()
  await screen.getByRole('option', /^Premium/).tap()
  await screen.getByRole('button', /^Play( Now)?$/).first().tap()

  const starting = screen.getByTestId('debrid-starting')
  await expect(starting.getByText('You’re offline — playback starts when your connection is back…')).toBeVisible()
  await expect(screen.getByText('Playback stopped')).toBeHidden()

  connected = true
  await browser.evaluate(() => {
    ;(window as unknown as { __e2eOnline?: boolean }).__e2eOnline = true
    return window.dispatchEvent(new Event('online'))
  })

  // The loading screen gives way to the film's first frame.
  await expect(starting).toBeHidden()
  await expect(screen.getByTestId('debrid-video')).toBeVisible()
})
