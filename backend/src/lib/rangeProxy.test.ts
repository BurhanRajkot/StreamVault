import { describe, it, expect, beforeAll, afterAll } from 'bun:test'
import { registerSource, unregisterSource, localUrl, findChunk } from './rangeProxy'

const FILE = Buffer.alloc(8 * 1024 * 1024)
for (let i = 0; i < FILE.length; i++) FILE[i] = i % 251

let upstream: ReturnType<typeof Bun.serve>
const upstreamRanges: string[] = []

beforeAll(() => {
  upstream = Bun.serve({
    port: 0,
    fetch(req) {
      const range = req.headers.get('range') || 'bytes=0-'
      upstreamRanges.push(range)
      const [, s, e] = /bytes=(\d+)-(\d*)/.exec(range)!
      const start = Number(s)
      const end = e ? Number(e) : FILE.length - 1
      return new Response(FILE.subarray(start, end + 1), {
        status: 206,
        headers: { 'Content-Range': `bytes ${start}-${end}/${FILE.length}` },
      })
    },
  })
  registerSource('test', { key: 'file', getUrl: () => `http://127.0.0.1:${upstream.port}/f` })
})

afterAll(() => {
  unregisterSource('test')
  upstream.stop(true)
})

async function read(range: string) {
  const res = await fetch(await localUrl('test'), { headers: { Range: range } })
  return { res, body: Buffer.from(await res.arrayBuffer()) }
}

describe('range proxy', () => {
  it('serves byte ranges with the upstream file size', async () => {
    const { res, body } = await read('bytes=1000-1999')
    expect(res.status).toBe(206)
    expect(res.headers.get('content-range')).toBe(`bytes 1000-1999/${FILE.length}`)
    expect(body.equals(FILE.subarray(1000, 2000))).toBe(true)
  })

  it('serves repeat reads near the file edges from memory', async () => {
    await read('bytes=4096-')
    const before = upstreamRanges.length
    const { body } = await read('bytes=5000-9999')
    expect(upstreamRanges.length).toBe(before)
    expect(body.equals(FILE.subarray(5000, 10000))).toBe(true)
  })

  it('continues from upstream once a read runs past the cached bytes', async () => {
    const { body } = await read('bytes=4096-')
    expect(body.length).toBe(FILE.length - 4096)
    expect(body.equals(FILE.subarray(4096))).toBe(true)
  })

  it('404s unknown sources', async () => {
    const res = await fetch((await localUrl('test')).replace(/test$/, 'nope'))
    expect(res.status).toBe(404)
  })
})

describe('findChunk', () => {
  it('picks the chunk covering the position that extends furthest', () => {
    const a = { start: 0, data: Buffer.alloc(10) }
    const b = { start: 5, data: Buffer.alloc(20) }
    expect(findChunk({ chunks: [a, b] }, 7)).toBe(b)
    expect(findChunk({ chunks: [a, b] }, 2)).toBe(a)
    expect(findChunk({ chunks: [a, b] }, 25)).toBeNull()
  })
})
