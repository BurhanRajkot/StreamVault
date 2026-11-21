/**
 * preparePlayback remembering what Real-Debrid answered for a finished file —
 * the second start of the same file makes no Real-Debrid calls — and not
 * waiting on slow media info.
 */

import { describe, it, expect, beforeEach, afterEach } from 'bun:test'
import { preparePlayback, resetTorrentLookupForTests } from './debrid'

const HASH = 'cd'.repeat(20)
const realFetch = globalThis.fetch
const savedKey = process.env.DEBRID_API_KEY
const savedBudget = process.env.DEBRID_MEDIA_INFO_BUDGET_MS

let calls: string[]
/** How long /streaming/mediaInfos takes to answer, in ms. */
let mediaDelayMs: number

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })

beforeEach(() => {
  process.env.DEBRID_API_KEY = 'test-key'
  resetTorrentLookupForTests()
  calls = []
  mediaDelayMs = 0
  globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
    const url = new URL(typeof input === 'string' ? input : input instanceof URL ? input.href : input.url)
    const path = url.pathname.replace('/rest/1.0', '')
    calls.push(`${init?.method ?? 'GET'} ${path}`)
    if (path === '/torrents') return json([{ id: 'T1', hash: HASH, status: 'downloaded' }])
    if (path === '/torrents/info/T1') {
      return json({
        id: 'T1', hash: HASH, status: 'downloaded', progress: 100,
        files: [{ id: 1, path: '/Film.2024.1080p.WEB-DL.mkv', bytes: 2e9, selected: 1 }],
        links: ['https://real-debrid.com/d/ABC'],
      })
    }
    if (path === '/unrestrict/link') {
      return json({ id: 'ABCDEFGHIJKLM128', filename: 'Film.2024.1080p.WEB-DL.mkv', filesize: 2e9, mimeType: 'video/x-matroska', download: 'https://44-4.download.real-debrid.com/d/ABCDEFGHIJKLM128/Film.mkv', streamable: 1 })
    }
    if (path.startsWith('/streaming/mediaInfos/')) {
      await new Promise((r) => setTimeout(r, mediaDelayMs))
      return json({ duration: 7200, details: { video: { v: { codec: 'h264' } }, audio: { a: { lang: 'English', lang_iso: 'eng', codec: 'aac', channels: 2, stream: '0:1' } } } })
    }
    if (path.startsWith('/streaming/transcode/')) return json({ apple: { original: 'https://stream.real-debrid.com/t/x/original.m3u8' } })
    return json({ error: `unexpected ${path}` }, 500)
  }) as typeof fetch
})

afterEach(() => {
  globalThis.fetch = realFetch
  if (savedKey === undefined) delete process.env.DEBRID_API_KEY
  else process.env.DEBRID_API_KEY = savedKey
  if (savedBudget === undefined) delete process.env.DEBRID_MEDIA_INFO_BUDGET_MS
  else process.env.DEBRID_MEDIA_INFO_BUDGET_MS = savedBudget
  resetTorrentLookupForTests()
})

describe('preparePlayback — the second start of a file', () => {
  it('asks Real-Debrid nothing it already answered', async () => {
    const first = await preparePlayback({ hash: HASH })
    expect(first).toMatchObject({ status: 'ready', media: { videoCodec: 'h264', duration: 7200 } })
    expect(calls.filter((c) => c.includes('/streaming/mediaInfos/'))).toHaveLength(1)

    calls = []
    const second = await preparePlayback({ hash: HASH })
    expect(second).toEqual(first)
    expect(calls).toEqual([])
  })
})
