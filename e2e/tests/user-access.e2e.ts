/**
 * The admin decides who gets ⚡ Premium: the dashboard's Users panel gives,
 * pauses or takes back an account's access and suspends accounts, and a
 * site-wide switch pauses Premium for everyone but the admin. A signed-in
 * account then plays Premium, or sees why it can't. Deterministic: no agent
 * steps.
 */

import { expect } from 'e2e'
import { adminTest, signedInTest, SIGNED_IN } from './fixtures'
import { MOVIE, watchPath } from '../fixtures/data'
import type { MockApi } from '../fixtures/mock-api'

const OTHER = 'sam@streamvault.test'

function account(mockApi: MockApi, id: string) {
  const user = mockApi.state.users.find((u) => u.id === id)
  if (!user) throw new Error(`no mock account ${id}`)
  return user
}

adminTest('the admin gives an account Premium and suspends another', async ({ app, screen, mockApi }) => {
  await app.open('/admin/dashboard')
  const users = screen.getByRole('region', 'Users')
  await expect(users.getByRole('row', /Riley Tester/)).toBeVisible()
  await expect(users.getByRole('row', /Sam Other/)).toBeVisible()

  await users.getByRole('combobox', `Premium access for ${SIGNED_IN.email}`).tap()
  await screen.getByRole('option', 'Allowed').tap()
  await expect(users.getByRole('combobox', `Premium access for ${SIGNED_IN.email}`)).toContainText('Allowed')
  expect(account(mockApi, SIGNED_IN.sub).premiumAccess).toBe('granted')

  await users.getByRole('button', `Suspend ${OTHER}`).tap()
  const restore = users.getByRole('button', `Restore ${OTHER}`)
  await expect(restore).toBeVisible()
  await expect(users.getByRole('row', /Sam Other/)).toContainText('Suspended')

  const patches = mockApi.calls('PATCH', '/admin/users/:id').map((c) => c.body)
  expect(patches).toEqual([{ premiumAccess: 'granted' }, { suspended: true }])

  await restore.tap()
  await expect(users.getByRole('button', `Suspend ${OTHER}`)).toBeVisible()
  expect(account(mockApi, 'google-oauth2|e2e-other').suspendedAt).toBe(null)
})

adminTest('the admin finds an account by searching', async ({ app, screen }) => {
  await app.open('/admin/dashboard')
  const users = screen.getByRole('region', 'Users')
  await expect(users.getByRole('row', /Sam Other/)).toBeVisible()

  await users.getByRole('searchbox', 'Search users').fill('riley')
  await expect(users.getByRole('row', /Sam Other/)).toHaveCount(0)
  await expect(users.getByRole('row', /Riley Tester/)).toBeVisible()
})

adminTest('the admin pauses Premium for everyone, and turns it back on', async ({ app, screen, mockApi }) => {
  await app.open('/admin/dashboard')
  const card = screen.getByRole('region', 'Premium for approved accounts')
  await expect(card.getByRole('status')).toHaveText('On')

  await card.getByRole('button', 'Pause Premium for everyone').tap()
  await expect(card.getByRole('status')).toHaveText('Paused for everyone but you')
  expect(mockApi.state.premiumPausedForAll).toBe(true)

  await card.getByRole('button', 'Turn Premium back on').tap()
  await expect(card.getByRole('status')).toHaveText('On')
  expect(mockApi.state.premiumPausedForAll).toBe(false)
})

signedInTest('an account without Premium sees it locked, and never reaches the Premium backend', async ({ app, screen, mockApi }) => {
  await app.open(watchPath(MOVIE))
  await screen.getByRole('combobox', 'Server').tap()
  await expect(screen.getByRole('option').last()).toContainText('Invite only')
  await screen.getByRole('option', /^Premium/).tap()
  await screen.getByRole('button', /^Play( Now)?$/).first().tap()

  await expect(screen.getByText("Your account doesn't have Premium access.", { exact: false })).toBeVisible()
  expect(mockApi.calls('GET', '/debrid/media-search')).toHaveLength(0)
})

signedInTest('an account the admin approved plays Premium', async ({ app, screen, mockApi }) => {
  account(mockApi, SIGNED_IN.sub).premiumAccess = 'granted'

  await app.open(watchPath(MOVIE))
  await screen.getByRole('combobox', 'Server').tap()
  const premium = screen.getByRole('option').last()
  await expect(premium).not.toContainText('Invite only')
  await premium.tap()
  await screen.getByRole('button', /^Play( Now)?$/).first().tap()

  await expect(screen.getByTestId('debrid-video')).toBeVisible()
  const [play] = mockApi.calls('POST', '/debrid/play')
  expect(play.authenticated && !play.admin, "the play request carries the account's own token").toBe(true)
})

signedInTest('an approved account sees why while Premium is paused for everyone', async ({ app, screen, mockApi }) => {
  account(mockApi, SIGNED_IN.sub).premiumAccess = 'granted'
  mockApi.state.premiumPausedForAll = true

  await app.open(watchPath(MOVIE))
  await screen.getByRole('combobox', 'Server').tap()
  await screen.getByRole('option', /^Premium/).tap()
  await screen.getByRole('button', /^Play( Now)?$/).first().tap()

  await expect(screen.getByText('Premium is paused right now')).toBeVisible()
  expect(mockApi.calls('POST', '/debrid/play')).toHaveLength(0)
})
