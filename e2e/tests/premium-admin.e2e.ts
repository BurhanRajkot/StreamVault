/**
 * ⚡ Premium plays for the admin (and accounts the admin approved — see
 * user-access.e2e.ts). A visitor sees it in the server list, last and
 * locked; picking it explains why and offers the sign-ins, and the admin
 * sign-in there starts the film. Deterministic: no agent steps.
 *
 * What Premium does once it plays is e2e/specs/premium-player.spec.ts.
 */

import { expect } from 'e2e'
import { adminTest, test } from './fixtures'
import { ADMIN_CODE } from '../fixtures/users'
import { MOVIE, watchPath } from '../fixtures/data'

const SERVER = 'Server'

test('a visitor sees Premium locked, and is never sent to the Premium backend', async ({ app, screen, mockApi }) => {
  await app.open(watchPath(MOVIE))
  await expect(screen.getByRole('heading', 'Inception', { level: 1 }).first()).toBeVisible()

  await screen.getByRole('combobox', SERVER).tap()
  await expect(screen.getByRole('option').last()).toContainText('Invite only')
  await screen.getByRole('option', /^Premium/).tap()
  await screen.getByRole('button', /^Play( Now)?$/).first().tap()

  await expect(screen.getByText('Premium is invite-only')).toBeVisible()
  await expect(screen.getByRole('button', 'Admin sign-in')).toBeVisible()
  expect(mockApi.calls('GET', '/debrid/media-search')).toHaveLength(0)
  expect(mockApi.calls('POST', '/debrid/play')).toHaveLength(0)
})

test('a wrong code is refused, the right one signs the admin in and the film starts', async ({ app, screen, mockApi }) => {
  await app.open(watchPath(MOVIE))
  await screen.getByRole('combobox', SERVER).tap()
  await screen.getByRole('option', /^Premium/).tap()
  await screen.getByRole('button', /^Play( Now)?$/).first().tap()
  await screen.getByRole('button', 'Admin sign-in').tap()

  const dialog = screen.getByRole('dialog', 'Admin Access')
  const code = dialog.getByLabel('Authenticator Code')
  await code.fill('000000')
  await dialog.getByRole('button', 'Login').tap()
  await expect(dialog.getByRole('alert')).toContainText('Invalid authenticator code')

  await code.fill(ADMIN_CODE)
  await dialog.getByRole('button', 'Login').tap()

  await expect(screen.getByTestId('debrid-video')).toBeVisible()
  await expect(screen.getByText('Premium is invite-only')).toBeHidden()
  const [play] = mockApi.calls('POST', '/debrid/play')
  expect(play.admin, 'the play request carries the admin token').toBe(true)
})

adminTest('an admin still starts on Sirius, with Premium last and unlocked', async ({ app, screen }) => {
  await app.open(watchPath(MOVIE))
  const picker = screen.getByRole('combobox', SERVER)
  await expect(picker).toContainText('Sirius')

  await picker.tap()
  const premium = screen.getByRole('option').last()
  await expect(premium).toContainText('Premium')
  await expect(premium).not.toContainText('Invite only')
})

adminTest('the admin dashboard reports the Premium account', async ({ app, screen }) => {
  await app.open('/admin/dashboard')
  const status = screen.getByRole('region', 'Premium server status')
  await expect(status.getByRole('status')).toHaveText('Working')
})

test('the header signs the admin in, and its menu signs them out again', async ({ app, screen, browser }) => {
  await app.open('/')
  const header = screen.getByRole('banner')
  // A phone shows the shield once signed in; signing in starts from the footer there.
  if ((await browser.evaluate(() => window.innerWidth)) < 768) {
    await app.open('/admin/dashboard')
    await screen.getByRole('button', 'Log In as Admin').tap()
  } else {
    await header.getByRole('button', 'Sign in as admin').tap()
  }

  const dialog = screen.getByRole('dialog', 'Admin Access')
  await dialog.getByLabel('Authenticator Code').fill(ADMIN_CODE)
  await dialog.getByRole('button', 'Login').tap()
  await expect(dialog).toBeHidden()

  await app.open('/')
  await header.getByRole('button', 'Admin menu').first().tap()
  await screen.getByRole('menuitem', 'Sign out of admin').tap()
  await expect(header.getByRole('button', 'Admin menu')).toHaveCount(0)
  expect(await browser.evaluate(() => localStorage.getItem('adminToken'))).toBe(null)
})
