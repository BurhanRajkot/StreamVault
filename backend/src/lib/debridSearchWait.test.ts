/**
 * How long a Premium release search waits on each index. apibay can hang
 * (20 s for one query on 2026-11-24, while Torrentio answered in ~1 s), and
 * every Premium play starts with this search — so neither index may hold the
 * other's answer up for long.
 */
import { describe, it, expect, afterEach } from 'bun:test'
import { searchMediaReleases } from './debrid'

const realFetch = globalThis.fetch

/** Unique per run: the index lookups are cached (in Redis, when one is running), and a cached answer waits on nothing. */
const RUN = Date.now().toString(36)

const hash = (n: number) => n.toString(16).padStart(40, 'a')

function apibayRows(title: string) {
  return [
    {
      id: '1',
      name: `${title}.2020.1080p.BluRay.x264-GRP`,
      info_hash: hash(1).toUpperCase(),
      leechers: '1',
      seeders: '40',
      num_files: '1',
      size: String(3 * 1024 ** 3),
      username: 'u',
      added: '0',
      status: 'member',
      category: '207',
      imdb: '',
    },
  ]
}

function torrentioRows(title: string) {
  return {
    streams: [
      {
        name: 'Torrentio\n1080p',
        title: `${title}.2020.1080p.WEB-DL.x264-TOR\n👤 50 💾 2.1 GB`,
        infoHash: hash(2),
        fileIdx: 0,
      },
    ],
  }
}

const delay = (ms: number, signal?: AbortSignal | null) =>
  new Promise<void>((resolve, reject) => {
    const timer = setTimeout(resolve, ms)
    signal?.addEventListener('abort', () => {
      clearTimeout(timer)
      reject(new DOMException('aborted', 'AbortError'))
    })
  })

/** apibay and Torrentio answering after the given times (Infinity: never, until the request gives up). */
function serve({ title, apibayMs, torrentioMs }: { title: string; apibayMs: number; torrentioMs: number }) {
  globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
    const url = String(input)
    const json = (body: unknown) => new Response(JSON.stringify(body), { status: 200, headers: { 'content-type': 'application/json' } })
    if (url.includes('apibay')) {
      await delay(Number.isFinite(apibayMs) ? apibayMs : 60_000, init?.signal)
      return json(apibayRows(title))
    }
    if (url.includes('/stream/')) {
      await delay(Number.isFinite(torrentioMs) ? torrentioMs : 60_000, init?.signal)
      return json(torrentioRows(title))
    }
    return new Response('not found', { status: 404 })
  }) as typeof fetch
}

async function timedSearch(title: string, imdbId: string) {
  const started = Date.now()
  const rows = await searchMediaReleases({ title, imdbId, mediaType: 'movie', debridTags: false })
  return { ms: Date.now() - started, names: rows.map((r) => r.name) }
}

describe('Premium release search: waiting on the indexes', () => {
  afterEach(() => {
    globalThis.fetch = realFetch
  })

  it('goes on with Torrentio when apibay hangs, instead of sitting out apibay’s timeout', async () => {
    const title = `Hungapibay${RUN}`
    serve({ title, apibayMs: Infinity, torrentioMs: 100 })
    const { ms, names } = await timedSearch(title, `tt1${RUN}`)
    expect(names.some((n) => n.includes('TOR'))).toBe(true)
    expect(ms).toBeLessThan(3_200)
  }, 10_000)

  it('uses apibay’s late rows rather than waiting out a hung Torrentio', async () => {
    const title = `Latapibay${RUN}`
    serve({ title, apibayMs: 3_000, torrentioMs: Infinity })
    const { ms, names } = await timedSearch(title, `tt2${RUN}`)
    expect(names.some((n) => n.includes('GRP'))).toBe(true)
    // apibay's 3 s, then what's left of Torrentio's 4 s grace — not its 12 s
    expect(ms).toBeLessThan(5_000)
  }, 15_000)
})
