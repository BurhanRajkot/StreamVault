/**
 * Signing in the TV app from a phone — the website's half (the TV's is
 * app/src/tv/TvSignInScreen.tsx). The TV shows a code; the phone opens
 * /activate, goes on to the TV's own Auth0 sign-in, and when Auth0 sends it
 * back the site hands the answer to the TV (lib/appSignIn.ts).
 * Deterministic: no agent steps.
 */

import { expect } from 'e2e'
import { test } from './fixtures'

const CODE = 'ABC234'
const AUTHORIZE = 'https://auth.e2e.test/authorize?client_id=e2e-client-id&state=tv-state&code_challenge=cc&redirect_uri=https%3A%2F%2Fstream-vault.site'

test('a phone signs the TV in with its code', async ({ app, screen, browser, mockApi }) => {
  mockApi.state.tvLinks[CODE] = { authorizeUrl: AUTHORIZE, search: null }
  await app.open('/activate')
  await expect(screen.getByRole('heading', 'Sign in on your TV', { level: 1 })).toBeVisible()
  const continueButton = screen.getByRole('button', 'Continue')
  await expect(continueButton).toBeDisabled()

  // Typed the way people do: lower case, no dash
  await screen.getByRole('textbox', 'Code').fill('abc234')
  await expect(screen.getByRole('textbox', 'Code')).toHaveValue('ABC-234')
  await continueButton.tap()
  // On to the TV's own Auth0 sign-in…
  await expect(browser).toHaveURL(/^https:\/\/auth\.e2e\.test\/authorize\?/)

  // …which sends the phone back to the site; the site hands the answer to the TV
  await app.open('/?code=auth-code&state=tv-state')
  await expect(screen.getByRole('heading', 'Your TV is signing in', { level: 1 })).toBeVisible()
  await expect(browser).toHaveURL(/\/activate\?linked=1$/)
  expect(mockApi.state.tvLinks[CODE].search).toBe('?code=auth-code&state=tv-state')
})

test('a code that isn’t one says so', async ({ app, screen, mockApi }) => {
  await app.open('/activate?code=ZZZ999')
  await expect(screen.getByRole('textbox', 'Code')).toHaveValue('ZZZ-999')
  await screen.getByRole('button', 'Continue').tap()
  await expect(screen.getByRole('alert')).toContainText('That code isn’t valid')
  expect(mockApi.calls('GET', '/tv-link/:code')).toHaveLength(1)
})

test('the website’s own sign-in never goes to a TV', async ({ app, screen, browser, mockApi }) => {
  mockApi.state.tvLinks[CODE] = { authorizeUrl: AUTHORIZE, search: null }
  await app.open('/activate')
  // A TV sign-in started in this tab and abandoned; later the site's own comes back
  await browser.evaluate((code) => {
    sessionStorage.setItem('sv-tv-link-code', JSON.stringify({ code, state: 'tv-state' }))
    return true
  }, CODE)
  await app.open('/?code=site-code&state=site-state')
  // The site starts as usual
  await expect(screen.getByRole('region', 'Featured content carousel')).toBeVisible()
  await expect(browser).not.toHaveURL(/\/activate/)
  expect(mockApi.calls('POST', '/tv-link/:code/complete')).toHaveLength(0)
})
