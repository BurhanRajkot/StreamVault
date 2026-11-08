/**
 * preparePlayback's "is this release already in the account?" check — which
 * Real-Debrid calls it makes, against a stubbed API.
 */

import { describe, it, expect, beforeEach, afterEach } from 'bun:test'
import { preparePlayback, resetTorrentLookupForTests, warmTorrentLookup } from './debrid'

const HASH = 'ab'.repeat(20)
const realFetch = globalThis.fetch
const savedKey = process.env.DEBRID_API_KEY

/** Each Real-Debrid call made, as "METHOD /path". */
let calls: string[]
let torrents: Array<{ id: string; hash: string; status: string }>
/** Torrent ids /torrents/info answers 404 for — deleted on Real-Debrid's side. */
let deleted: Set<string>
let nextId: number

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })

beforeEach(() => {
  process.env.DEBRID_API_KEY = 'test-key'
  resetTorrentLookupForTests()
  calls = []
  torrents = []
  deleted = new Set()
  nextId = 1
  globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
    const url = new URL(typeof input === 'string' ? input : input instanceof URL ? input.href : input.url)
    const path = url.pathname.replace('/rest/1.0', '')
    calls.push(`${init?.method ?? 'GET'} ${path}`)
    if (path === '/torrents') return json(torrents)
    if (path === '/torrents/addMagnet') {
      const id = `T${nextId++}`
      torrents.push({ id, hash: HASH, status: 'downloading' })
      return json({ id }, 201)
    }
    const info = path.match(/^\/torrents\/info\/(\w+)$/)
    if (info) {
      if (deleted.has(info[1])) return json({ error: 'unknown_ressource', error_code: 7 }, 404)
      // Still downloading: preparePlayback stops there, before any file is resolved.
      return json({ id: info[1], hash: HASH, status: 'downloading', progress: 40, speed: 1, seeders: 3, files: [], links: [] })
    }
    return json({ error: `unexpected ${path}` }, 500)
  }) as typeof fetch
})

afterEach(() => {
  globalThis.fetch = realFetch
  if (savedKey === undefined) delete process.env.DEBRID_API_KEY
  else process.env.DEBRID_API_KEY = savedKey
  resetTorrentLookupForTests()
})

describe('preparePlayback — finding a release already in the account', () => {
  it('lists the account once, then reuses the torrent it added without listing again', async () => {
    expect(await preparePlayback({ hash: HASH })).toMatchObject({ status: 'downloading', torrentId: 'T1' })
    expect(calls).toEqual(['GET /torrents', 'POST /torrents/addMagnet', 'GET /torrents/info/T1'])

    calls = []
    expect(await preparePlayback({ hash: HASH })).toMatchObject({ status: 'downloading', torrentId: 'T1' })
    expect(calls).toEqual(['GET /torrents/info/T1'])
  })

  it('adds the release afresh when the torrent it remembered was deleted', async () => {
    await preparePlayback({ hash: HASH })
    deleted.add('T1')

    calls = []
    expect(await preparePlayback({ hash: HASH })).toMatchObject({ status: 'downloading', torrentId: 'T2' })
    expect(calls).toEqual(['GET /torrents/info/T1', 'POST /torrents/addMagnet', 'GET /torrents/info/T2'])
  })

  it('uses the listing a release search started, rather than listing again', async () => {
    torrents.push({ id: 'EXISTING', hash: HASH.toUpperCase(), status: 'downloaded' })
    warmTorrentLookup()

    expect(await preparePlayback({ hash: HASH })).toMatchObject({ torrentId: 'EXISTING' })
    expect(calls).toEqual(['GET /torrents', 'GET /torrents/info/EXISTING'])
  })
})
