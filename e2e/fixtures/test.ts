/**
 * The `test` every spec imports. Each test gets:
 *
 *   - mockApi  — its own MockApi (fresh state), already wired into the page
 *   - a hermetic network (see network.ts)
 *   - a guest visitor by default; `test.use({ user: SIGNED_IN })` signs in
 *     through the app's mock Auth0 provider (VITE_MOCK_AUTH), and
 *     `test.use({ admin: true })` holds an admin session (what ⚡ Premium needs)
 *   - first-visit chrome dismissed (the disclaimer) unless the test
 *     opts back in with `test.use({ firstVisit: true })`
 *   - home / watch page objects
 *
 * and fails, on teardown, when the page threw an uncaught exception or the
 * app called an endpoint the mock backend doesn't know.
 */

import { test as base, expect } from '@playwright/test'
import { MockApi } from './mock-api'
import { isolateNetwork } from './network'
import { HomePage } from '../pages/HomePage'
import { WatchPage } from '../pages/WatchPage'
import { ADMIN_TOKEN, SIGNED_IN, type TestUser } from './users'

export { SIGNED_IN, type TestUser }

/**
 * True on the phone projects — `mobile` (Pixel, every push) and
 * `mobile-safari` (iPhone, the weekly all-browser sweep). Specs branch on
 * this where the phone has its own layout; comparing the project name to
 * 'mobile' sent the iPhone down the desktop path.
 */
export function isPhone(): boolean {
  return base.info().project.name.startsWith('mobile')
}

interface Options {
  /** Signed-in user, or null for a guest. */
  user: TestUser | null
  /** Keep first-visit UI (the disclaimer) instead of pre-dismissing it. */
  firstVisit: boolean
  /** Signed in as the site's admin — the only viewer ⚡ Premium plays for. */
  admin: boolean
}

interface Fixtures {
  mockApi: MockApi
  home: HomePage
  watch: WatchPage
}

export const test = base.extend<Options & Fixtures>({
  user: [null, { option: true }],
  firstVisit: [false, { option: true }],
  admin: [false, { option: true }],

  context: async ({ context, baseURL, user, firstVisit, admin }, use) => {
    await isolateNetwork(context, new URL(baseURL ?? 'http://localhost:4173').origin)
    await context.addInitScript(
      ({ user, firstVisit, adminToken }) => {
        if (!firstVisit) sessionStorage.setItem('disclaimerAccepted', 'true')
        if (adminToken) localStorage.setItem('adminToken', adminToken)
        if (user) {
          localStorage.setItem('e2e_mock_authenticated', 'true')
          localStorage.setItem('e2e_mock_user', JSON.stringify(user))
          localStorage.setItem(`cinematch_onboarded_${user.sub}`, 'true')
        }
      },
      { user, firstVisit, adminToken: admin ? ADMIN_TOKEN : null }
    )
    await use(context)
  },

  mockApi: async ({ context }, use, testInfo) => {
    const api = new MockApi()
    await api.attach(context)
    await use(api)
    if (api.unhandled.length > 0 && testInfo.status === testInfo.expectedStatus) {
      throw new Error(`The app called endpoints the mock backend doesn't handle:\n  ${[...new Set(api.unhandled)].join('\n  ')}`)
    }
  },

  page: async ({ page, mockApi: _mockApi }, use, testInfo) => {
    // Depending on mockApi guarantees it is attached before the first navigation.
    const pageErrors: string[] = []
    // WebKit reports some errors with an empty stack — always say what it was.
    page.on('pageerror', (err) => pageErrors.push([`${err.name}: ${err.message}`, err.stack].filter(Boolean).join('\n')))
    await use(page)
    if (pageErrors.length > 0 && testInfo.status === testInfo.expectedStatus) {
      throw new Error(`Uncaught exception(s) in the page:\n${pageErrors.join('\n\n')}`)
    }
  },

  home: async ({ page }, use) => use(new HomePage(page)),
  watch: async ({ page }, use) => use(new WatchPage(page)),
})

export { expect }
