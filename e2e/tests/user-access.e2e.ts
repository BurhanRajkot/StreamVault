/**
 * The admin decides who gets ⚡ Premium: the dashboard's Users panel gives,
 * pauses or takes back an account's access and suspends accounts, and a
 * site-wide switch pauses Premium for everyone but the admin. Per account,
 * the admin can also pause Premium's downloads: the film still streams, the
 * player just stops offering its file (magnet links stay). Accounts ask for
 * Premium from the app, and the dashboard approves or deletes the request. A
 * signed-in account then plays Premium — in the app; the website points it
 * there — or sees why it can't. Deterministic: no agent steps.
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

signedInTest('an account the admin approved plays Premium in the app', async ({ app, screen, mockApi }) => {
  account(mockApi, SIGNED_IN.sub).premiumAccess = 'granted'
  mockApi.state.asApp = true

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

signedInTest('on the website, an approved account is sent to the app instead', async ({ app, screen, mockApi }) => {
  account(mockApi, SIGNED_IN.sub).premiumAccess = 'granted'

  await app.open(watchPath(MOVIE))
  await screen.getByRole('combobox', 'Server').tap()
  await screen.getByRole('option', /^Premium/).tap()
  await screen.getByRole('button', /^Play( Now)?$/).first().tap()

  await expect(screen.getByText('Your Premium is in the app')).toBeVisible()
  await expect(screen.getByRole('link', 'Get the app')).toBeVisible()
  expect(mockApi.calls('POST', '/debrid/play')).toHaveLength(0)
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

adminTest('the admin approves one Premium request and deletes another', async ({ app, screen, mockApi }) => {
  const request = { name: null, note: null, reviewedAt: null, status: 'pending' as const }
  mockApi.state.accessRequests = [
    { ...request, userId: SIGNED_IN.sub, email: SIGNED_IN.email, github: 'octocat', starred: true, createdAt: '2026-11-17T09:00:00.000Z' },
    { ...request, userId: 'google-oauth2|e2e-other', email: OTHER, github: null, starred: null, note: 'Please!', createdAt: '2026-11-17T08:00:00.000Z' },
  ]

  await app.open('/admin/dashboard')
  const panel = screen.getByRole('region', 'Premium access requests')
  await expect(panel.getByText('2 pending')).toBeVisible()
  await expect(panel.getByText('Starred')).toBeVisible()

  await panel.getByRole('button', 'Approve').first().tap()
  await expect(panel.getByText('1 pending')).toBeVisible()
  expect(account(mockApi, SIGNED_IN.sub).premiumAccess).toBe('granted')

  // Deleting asks once more before it goes.
  const other = panel.getByRole('listitem', `Request from ${OTHER}`)
  await other.getByRole('button', 'Delete').tap()
  await other.getByRole('button', 'Confirm').tap()
  await expect(panel.getByText(OTHER)).toBeHidden()
  expect(mockApi.state.accessRequests.map((r) => r.userId)).toEqual([SIGNED_IN.sub])
  expect(account(mockApi, 'google-oauth2|e2e-other').premiumAccess, 'deleting a request gives nothing').toBe('none')
})

adminTest('Premium downloads are off for an account until the admin allows them, and can be switched off again', async ({ app, screen, mockApi }) => {
  await app.open('/admin/dashboard')
  const users = screen.getByRole('region', 'Users')
  const downloads = users.getByRole('combobox', `Premium downloads for ${SIGNED_IN.email}`)
  await expect(downloads).toContainText('Off')

  await downloads.tap()
  await screen.getByRole('option', 'Allowed').tap()
  await expect(downloads).toContainText('Allowed')
  expect(account(mockApi, SIGNED_IN.sub).debridDownloads).toBe(true)
  expect(account(mockApi, SIGNED_IN.sub).premiumAccess, 'Premium itself is untouched').toBe('none')

  await downloads.tap()
  await screen.getByRole('option', 'Off').tap()
  await expect(downloads).toContainText('Off')
  expect(mockApi.calls('PATCH', '/admin/users/:id').map((c) => c.body)).toEqual([{ debridDownloads: true }, { debridDownloads: false }])
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

signedInTest('an approved account the admin allowed downloads is offered the Premium file', async ({ app, screen, browser, mockApi }) => {
  const user = account(mockApi, SIGNED_IN.sub)
  user.premiumAccess = 'granted'
  user.debridDownloads = true
  mockApi.state.asApp = true
  await playPremium(app, screen)

  const settings = await openPlayerSettings(screen, browser)
  await expect(settings.getByRole('link', /^Download/)).toBeVisible()
  await expect(settings.getByText('Open in another player')).toBeVisible()
})

signedInTest('an approved account streams Premium but isn’t offered the file until the admin allows it', async ({ app, screen, browser, mockApi }) => {
  account(mockApi, SIGNED_IN.sub).premiumAccess = 'granted'
  mockApi.state.asApp = true
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
