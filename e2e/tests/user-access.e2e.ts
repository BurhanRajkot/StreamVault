/**
 * The admin decides who gets ⚡ Premium: the dashboard's Users panel gives,
 * pauses or takes back an account's access and suspends accounts, and a
 * site-wide switch pauses Premium for everyone but the admin. Per account,
 * the admin can also pause Premium's downloads: the film still streams, the
 * player just stops offering its file (magnet links stay). A signed-in
 * account then plays Premium, or sees why it can't. Deterministic: no agent
 * steps.
 */

import { expect, type Screen } from 'e2e'
import type { Browser } from '@e2e-dev/web'
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

adminTest('the admin pauses an account’s Premium downloads, and allows them again', async ({ app, screen, mockApi }) => {
  await app.open('/admin/dashboard')
  const users = screen.getByRole('region', 'Users')
  const downloads = users.getByRole('combobox', `Premium downloads for ${SIGNED_IN.email}`)
  await expect(downloads).toContainText('Allowed')

  await downloads.tap()
  await screen.getByRole('option', 'Paused').tap()
  await expect(downloads).toContainText('Paused')
  expect(account(mockApi, SIGNED_IN.sub).debridDownloads).toBe(false)
  expect(account(mockApi, SIGNED_IN.sub).premiumAccess, 'Premium itself is untouched').toBe('none')

  await downloads.tap()
  await screen.getByRole('option', 'Allowed').tap()
  await expect(downloads).toContainText('Allowed')
  expect(mockApi.calls('PATCH', '/admin/users/:id').map((c) => c.body)).toEqual([{ debridDownloads: false }, { debridDownloads: true }])
})

/** Start Premium for the signed-in account and wait for the film. */
async function playPremium(app: { open(path: string): Promise<unknown> }, screen: Screen) {
  await app.open(watchPath(MOVIE))
  await screen.getByRole('combobox', 'Server').tap()
  await screen.getByRole('option', /^Premium/).tap()
  await screen.getByRole('button', /^Play( Now)?$/).first().tap()
  await expect(screen.getByTestId('debrid-video')).toBeVisible()
  // The first frame is up (pausing before it would keep the loading screen, and no controls).
  await expect(screen.getByTestId('debrid-starting')).toBeHidden()
}

/** Pause the film (so the controls stay up) and open the player's settings. */
async function openPlayerSettings(screen: Screen, browser: Browser) {
  await browser.evaluate(() => {
    document.querySelector('video')?.pause()
    return null
  })
  await screen.getByRole('button', /^Settings/).first().tap()
  const settings = screen.getByRole('dialog', 'Player settings')
  await expect(settings).toBeVisible()
  return settings
}

signedInTest('an approved account is offered the Premium file', async ({ app, screen, browser, mockApi }) => {
  account(mockApi, SIGNED_IN.sub).premiumAccess = 'granted'
  await playPremium(app, screen)

  const settings = await openPlayerSettings(screen, browser)
  await expect(settings.getByRole('link', /^Download/)).toBeVisible()
  await expect(settings.getByText('Open in another player')).toBeVisible()
})

signedInTest('an account whose downloads are paused still streams Premium, but isn’t offered the file', async ({ app, screen, browser, mockApi }) => {
  const user = account(mockApi, SIGNED_IN.sub)
  user.premiumAccess = 'granted'
  user.debridDownloads = false
  await playPremium(app, screen)

  // Not in the player's settings, nor under the player (desktop).
  const settings = await openPlayerSettings(screen, browser)
  await expect(settings.getByRole('link', /^Download/)).toHaveCount(0)
  await expect(settings.getByText('Open in another player')).toHaveCount(0)
  await settings.press('Escape')
  await expect(screen.getByRole('link', /^Download/)).toHaveCount(0)

  // The magnet links are a different thing, and still on offer.
  await screen.getByRole('button', /^Download/).first().tap()
  await expect(screen.getByRole('dialog', 'Download').getByRole('link', 'Open 1080p in torrent app')).toBeVisible()
})
