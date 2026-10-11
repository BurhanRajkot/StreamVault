import { describe, expect, it } from 'bun:test'
import { debridFreeUntil, isDebridFreeForEveryone, __test } from './debridPromo'

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
