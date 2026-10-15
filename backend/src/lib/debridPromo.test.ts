import { describe, expect, it } from 'bun:test'
import { debridAccess, debridFreeUntil, isDebridFreeForEveryone, __test } from './debridPromo'

const END = new Date(__test.DEFAULT_FREE_UNTIL).getTime()

describe('debrid free promotion', () => {
  it('ends six months after it started (2026-10-11)', () => {
    expect(new Date(END).toISOString()).toBe('2027-04-11T00:00:00.000Z')
  })

  it('is active before the end date and over from it onwards', () => {
    expect(isDebridFreeForEveryone(Date.parse('2026-10-11T12:00:00Z'))).toBe(true)
    expect(isDebridFreeForEveryone(END - 1)).toBe(true)
    expect(isDebridFreeForEveryone(END)).toBe(false)
    expect(isDebridFreeForEveryone(Date.parse('2027-06-01T00:00:00Z'))).toBe(false)
  })

  it('reports the end date only while active', () => {
    expect(debridFreeUntil(END - 1)?.getTime()).toBe(END)
    expect(debridFreeUntil(END)).toBeNull()
  })

  it('takes an override, and falls back to the default when it is garbage', () => {
    expect(__test.parseFreeUntil('2026-12-01').toISOString()).toBe('2026-12-01T00:00:00.000Z')
    expect(__test.parseFreeUntil('not a date').getTime()).toBe(END)
    expect(__test.parseFreeUntil(undefined).getTime()).toBe(END)
  })
})

describe('debridAccess', () => {
  const DURING = END - 1
  const AFTER = END
  const guest = { admin: false, signedIn: false }
  const user = { admin: false, signedIn: true }

  it('lets guests use the player routes while the promotion runs, sign-in needed after', () => {
    expect(debridAccess({ ...guest, guestsAllowed: true }, DURING)).toBe('granted')
    expect(debridAccess({ ...guest, guestsAllowed: true }, AFTER)).toBe('sign-in-required')
  })

  it('never lets guests into routes that do not allow them (the shared library)', () => {
    expect(debridAccess({ ...guest, guestsAllowed: false }, DURING)).toBe('sign-in-required')
    expect(debridAccess({ ...guest, guestsAllowed: false }, AFTER)).toBe('sign-in-required')
  })

  it('lets signed-in users in free during the promotion, then asks for a subscription', () => {
    expect(debridAccess({ ...user, guestsAllowed: false }, DURING)).toBe('granted')
    expect(debridAccess({ ...user, guestsAllowed: true }, AFTER)).toBe('subscription-required')
  })

  it('always lets admins in', () => {
    expect(debridAccess({ admin: true, signedIn: false, guestsAllowed: false }, AFTER)).toBe('granted')
  })
})
