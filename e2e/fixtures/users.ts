/** Test users, shared by the Playwright fixtures (test.ts) and the e2e ones (e2e/tests/fixtures.ts). */

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
