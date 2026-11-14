/** Test users and the test admin, shared by the Playwright fixtures (test.ts) and the e2e ones (e2e/tests/fixtures.ts). */

export interface TestUser {
  sub: string
  name: string
  email: string
  picture: string
}

export const SIGNED_IN: TestUser = {
  sub: 'auth0|e2e-user',
  name: 'Riley Tester',
  email: 'riley@streamvault.test',
  picture: '',
}

/** The 6-digit authenticator code the mock backend accepts at POST /admin/login. */
export const ADMIN_CODE = '123456'

const base64url = (value: object) => Buffer.from(JSON.stringify(value)).toString('base64url')

/**
 * The admin session token the mock backend hands out and accepts. Shaped
 * like the real one (a JWT whose payload carries `exp`), because the app
 * reads the expiry to decide whether this browser is still an admin; the
 * signature is never checked in the browser.
 */
export const ADMIN_TOKEN = `${base64url({ alg: 'HS256', typ: 'JWT' })}.${base64url({ role: 'admin', exp: 4102444800 })}.e2e-signature`
