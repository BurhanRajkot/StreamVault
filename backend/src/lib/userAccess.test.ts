import { beforeAll, describe, expect, it, mock } from 'bun:test'
import type { UserAccess } from './userAccess'

// userAccess imports the Supabase client, which throws on load without keys
// (as in CI). Stub it before a dynamic import; a static one would hoist past this.
mock.module('./supabase', () => ({ supabaseAdmin: {} }))

let decidePremium: typeof import('./userAccess').decidePremium
let isMissingSchema: typeof import('./userAccess').isMissingSchema
let updatedPausedList: typeof import('./userAccess').updatedPausedList

beforeAll(async () => {
  ;({ decidePremium, isMissingSchema, updatedPausedList } = await import('./userAccess'))
})

describe('updatedPausedList (Premium downloads paused per account)', () => {
  it('adds an account when its downloads are paused, once', () => {
    expect(updatedPausedList([], 'auth0|b', false)).toEqual(['auth0|b'])
    expect(updatedPausedList(['auth0|b'], 'auth0|b', false)).toEqual(['auth0|b'])
    expect(updatedPausedList(['auth0|c'], 'auth0|a', false)).toEqual(['auth0|a', 'auth0|c'])
  })

  it('takes it off again when they are allowed, leaving the rest', () => {
    expect(updatedPausedList(['auth0|a', 'auth0|b'], 'auth0|a', true)).toEqual(['auth0|b'])
    expect(updatedPausedList(['auth0|b'], 'auth0|a', true)).toEqual(['auth0|b'])
  })
})

const access = (premiumAccess: UserAccess['premiumAccess'], suspended = false): UserAccess => ({ premiumAccess, suspended })

describe('decidePremium', () => {
  it('always lets the admin in, whatever the switches say', () => {
    expect(decidePremium({ admin: true, signedIn: false, pausedForAll: true, fromApp: true })).toBe('granted')
  })

  it('needs a signed-in account otherwise', () => {
    expect(decidePremium({ admin: false, signedIn: false, pausedForAll: false, fromApp: true })).toBe('sign-in-required')
  })

  it('lets in an account the admin granted, and nobody else', () => {
    expect(decidePremium({ admin: false, signedIn: true, access: access('granted'), pausedForAll: false, fromApp: true })).toBe('granted')
    expect(decidePremium({ admin: false, signedIn: true, access: access('none'), pausedForAll: false, fromApp: true })).toBe('not-approved')
    expect(decidePremium({ admin: false, signedIn: true, access: access('paused'), pausedForAll: false, fromApp: true })).toBe('paused')
  })

  it('pauses approved accounts when Premium is paused for everyone', () => {
    expect(decidePremium({ admin: false, signedIn: true, access: access('granted'), pausedForAll: true, fromApp: true })).toBe('paused-for-all')
  })

  it('plays an approved account only in the app, the admin anywhere', () => {
    expect(decidePremium({ admin: false, signedIn: true, access: access('granted'), pausedForAll: false, fromApp: false })).toBe('app-only')
    expect(decidePremium({ admin: true, signedIn: false, pausedForAll: false, fromApp: false })).toBe('granted')
    // The website still says why an unapproved account can't play, not "use the app"
    expect(decidePremium({ admin: false, signedIn: true, access: access('none'), pausedForAll: false, fromApp: false })).toBe('not-approved')
  })

  it('refuses a suspended account even when it was granted', () => {
    expect(decidePremium({ admin: false, signedIn: true, access: access('granted', true), pausedForAll: false, fromApp: true })).toBe('suspended')
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
