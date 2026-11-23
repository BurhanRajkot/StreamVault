import { describe, expect, test } from 'bun:test'
import { DEBRID_SERVER_ID, STREAM_PROVIDER_LIST } from '@/lib/config'
import { startServer } from './startServer'
import { APP_EMBED_SERVER, appServerOptions } from './servers'

const fresh = { defaultServer: '', premiumDefault: true }
const embed = APP_EMBED_SERVER

describe('startServer', () => {
  test('an account with Premium starts on Premium, whatever it last watched on', () => {
    expect(startServer('movie', true, fresh)).toBe(DEBRID_SERVER_ID)
    expect(startServer('tv', true, fresh, embed)).toBe(DEBRID_SERVER_ID)
    expect(startServer('movie', true, { defaultServer: embed, premiumDefault: true })).toBe(DEBRID_SERVER_ID)
  })

  test('picking the embed while having Premium turns it off', () => {
    expect(startServer('movie', true, { defaultServer: embed, premiumDefault: false })).toBe(embed)
  })

  test('without Premium: always the embed — never Premium, never a server the app dropped', () => {
    expect(startServer('movie', false, fresh)).toBe(embed)
    expect(startServer('movie', false, { defaultServer: DEBRID_SERVER_ID, premiumDefault: true })).toBe(embed)
    expect(startServer('movie', false, fresh, 'nope')).toBe(embed)
    const dropped = STREAM_PROVIDER_LIST.find((p) => p.id !== embed)?.id
    if (dropped) expect(startServer('tv', false, fresh, dropped)).toBe(embed)
  })
})

describe('appServerOptions', () => {
  test('two servers: the embed, then Premium', () => {
    expect(appServerOptions('movie').map((o) => o.id)).toEqual([embed, DEBRID_SERVER_ID])
    expect(appServerOptions('tv', { unlocked: true }).map((o) => o.id)).toEqual([embed, DEBRID_SERVER_ID])
  })

  test('the embed is a real provider on the website lineup', () => {
    expect(STREAM_PROVIDER_LIST.some((p) => p.id === embed)).toBe(true)
  })
})
