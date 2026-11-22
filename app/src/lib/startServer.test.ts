import { describe, expect, test } from 'bun:test'
import { DEBRID_SERVER_ID, defaultServer } from '@/lib/config'
import { startServer } from './startServer'

const fresh = { defaultServer: '', premiumDefault: true }

describe('startServer', () => {
  test('an account with Premium starts on Premium, whatever it last watched on', () => {
    expect(startServer('movie', true, fresh)).toBe(DEBRID_SERVER_ID)
    expect(startServer('tv', true, fresh, 'vidsrc')).toBe(DEBRID_SERVER_ID)
    expect(startServer('movie', true, { defaultServer: 'vidsrc', premiumDefault: true })).toBe(DEBRID_SERVER_ID)
  })

  test('picking another default while having Premium turns it off', () => {
    const sol = defaultServer('movie')
    expect(startServer('movie', true, { defaultServer: sol, premiumDefault: false })).toBe(sol)
  })

  test('without Premium: saved, then default, then Sol — never Premium', () => {
    expect(startServer('movie', false, fresh)).toBe(defaultServer('movie'))
    expect(startServer('movie', false, { defaultServer: DEBRID_SERVER_ID, premiumDefault: true })).toBe(defaultServer('movie'))
    expect(startServer('movie', false, fresh, 'nope')).toBe(defaultServer('movie'))
  })
})
