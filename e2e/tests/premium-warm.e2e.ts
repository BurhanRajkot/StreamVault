/**
 * ⚡ Premium is ready before Play: while the admin is on a title's page with
 * Premium picked, the release the player would start is got ready
 * (POST /debrid/warm), and Play takes that answer — the film starts without
 * asking POST /debrid/play at all. A warm-up that fails changes nothing:
 * Play asks for the release itself. Deterministic: no agent steps.
 *
 * The mock refuses warm-ups by default (see mock-api.ts); these tests turn them on.
 */

import { expect } from 'e2e'
import { adminTest } from './fixtures'
import { MOVIE, readyPlayback, watchPath } from '../fixtures/data'

adminTest('the release is ready before Play, so Play starts the film without asking again', async ({ app, screen, mockApi }) => {
  mockApi.on('POST', '/debrid/warm', { json: readyPlayback() })
  await app.open(watchPath(MOVIE))
  await screen.getByRole('combobox', 'Server').tap()
  await screen.getByRole('option', /^Premium/).tap()

  await expect.poll(() => mockApi.calls('POST', '/debrid/warm').length).toBe(1)
  const [warm] = mockApi.calls('POST', '/debrid/warm')
  expect((warm.body as { instantOnly?: boolean }).instantOnly, 'a warm-up never leaves a download running').toBe(true)

  await screen.getByRole('button', /^Play( Now)?$/).first().tap()
  await expect(screen.getByTestId('debrid-video')).toBeVisible()
  expect(mockApi.calls('POST', '/debrid/play')).toHaveLength(0)
})

adminTest('a warm-up that failed leaves Play to start the release itself', async ({ app, screen, mockApi }) => {
  mockApi.on('POST', '/debrid/warm', { status: 502, json: { error: 'Real-Debrid is unavailable' } })
  await app.open(watchPath(MOVIE))
  await screen.getByRole('combobox', 'Server').tap()
  await screen.getByRole('option', /^Premium/).tap()
  await expect.poll(() => mockApi.calls('POST', '/debrid/warm').length).toBe(1)

  await screen.getByRole('button', /^Play( Now)?$/).first().tap()
  await expect(screen.getByTestId('debrid-video')).toBeVisible()
  expect(mockApi.calls('POST', '/debrid/play')).toHaveLength(1)
})
