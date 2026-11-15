import { beforeAll, describe, expect, it, mock } from 'bun:test'
import type { UserAccess } from './userAccess'

// userAccess imports the Supabase client, which throws on load without keys
// (as in CI). Stub it before a dynamic import; a static one would hoist past this.
mock.module('./supabase', () => ({ supabaseAdmin: {} }))

let decidePremium: typeof import('./userAccess').decidePremium
let isMissingSchema: typeof import('./userAccess').isMissingSchema

beforeAll(async () => {
  ;({ decidePremium, isMissingSchema } = await import('./userAccess'))
})

const access = (premiumAccess: UserAccess['premiumAccess'], suspended = false): UserAccess => ({ premiumAccess, suspended })

describe('decidePremium', () => {
  it('always lets the admin in, whatever the switches say', () => {
    expect(decidePremium({ admin: true, signedIn: false, pausedForAll: true })).toBe('granted')
  })

  it('needs a signed-in account otherwise', () => {
    expect(decidePremium({ admin: false, signedIn: false, pausedForAll: false })).toBe('sign-in-required')
  })

  it('lets in an account the admin granted, and nobody else', () => {
    expect(decidePremium({ admin: false, signedIn: true, access: access('granted'), pausedForAll: false })).toBe('granted')
    expect(decidePremium({ admin: false, signedIn: true, access: access('none'), pausedForAll: false })).toBe('not-approved')
    expect(decidePremium({ admin: false, signedIn: true, access: access('paused'), pausedForAll: false })).toBe('paused')
  })

  it('pauses approved accounts when Premium is paused for everyone', () => {
    expect(decidePremium({ admin: false, signedIn: true, access: access('granted'), pausedForAll: true })).toBe('paused-for-all')
  })

  it('refuses a suspended account even when it was granted', () => {
    expect(decidePremium({ admin: false, signedIn: true, access: access('granted', true), pausedForAll: false })).toBe('suspended')
  })
})

describe('isMissingSchema', () => {
  it('recognises the errors a database without the migration answers with', () => {
    expect(isMissingSchema({ code: '42703', message: 'column User.premiumAccess does not exist' })).toBe(true)
    expect(isMissingSchema({ code: 'PGRST205', message: "Could not find the table 'public.AppSetting'" })).toBe(true)
    expect(isMissingSchema({ code: '23514', message: 'violates check constraint' })).toBe(false)
    expect(isMissingSchema(null)).toBe(false)
  })
})
