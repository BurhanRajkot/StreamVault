import { afterEach, beforeEach, describe, expect, it } from 'bun:test'
import { ReadAhead, sharesMediaCache } from './readAhead'

describe('sharesMediaCache', () => {
  const nav = (userAgent: string, brands?: string[]) =>
    ({ userAgent, ...(brands ? { userAgentData: { brands: brands.map((brand) => ({ brand, version: '1' })) } } : {}) }) as unknown as Navigator

  it('is true for Chromium browsers, by brand or by user agent', () => {
    expect(sharesMediaCache(nav('x', ['Google Chrome', 'Chromium', 'Not=A?Brand']))).toBe(true)
    expect(sharesMediaCache(nav('Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/142.0 Safari/537.36'))).toBe(true)
    expect(sharesMediaCache(nav('Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 Chrome/142.0 Mobile Safari/537.36'))).toBe(true)
  })

  it('is false for Safari, Firefox and every iOS browser', () => {
    expect(sharesMediaCache(nav('Mozilla/5.0 (Macintosh) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Safari/605.1.15'))).toBe(false)
    expect(sharesMediaCache(nav('Mozilla/5.0 (X11; Linux x86_64; rv:140.0) Gecko/20100101 Firefox/140.0'))).toBe(false)
    expect(sharesMediaCache(nav('Mozilla/5.0 (iPhone) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/142.0 Mobile/15E148 Safari/604.1'))).toBe(false)
    expect(sharesMediaCache(nav('x', ['Not=A?Brand']))).toBe(false)
    expect(sharesMediaCache(undefined)).toBe(false)
  })
})

/** Just enough of a media element: a position, what's loaded, and its `error`. */
class FakeMedia {
  currentTime = 0
  duration = 600
  readyState = 1
  seeking = false
  muted = false
  preload = ''
  src = ''
  loads = 0
  seeks = 0
  ranges: [number, number][] = []
  private listeners = new Map<string, () => void>()
  constructor(readonly kind: string) {}
  get buffered() {
    return { length: this.ranges.length, start: (i: number) => this.ranges[i][0], end: (i: number) => this.ranges[i][1] }
  }
  addEventListener(type: string, fn: () => void) {
    this.listeners.set(type, fn)
  }
  fire(type: string) {
    this.listeners.get(type)?.()
  }
  removeAttribute(name: string) {
    if (name === 'src') this.src = ''
  }
  load() {
    this.loads++
  }
}

describe('ReadAhead', () => {
  const realDocument = globalThis.document
  const realElement = globalThis.HTMLMediaElement
  const realVideo = globalThis.HTMLVideoElement
  let created: FakeMedia[]
  let main: FakeMedia
  let readAhead: ReadAhead | null

  beforeEach(() => {
    created = []
    readAhead = null
    class FakeVideoElement extends FakeMedia {}
    Object.assign(globalThis, {
      document: {
        hidden: false,
        createElement: (kind: string) => {
          const el = kind === 'video' ? new FakeVideoElement(kind) : new FakeMedia(kind)
          created.push(el)
          return el
        },
      },
      HTMLMediaElement: { HAVE_METADATA: 1 },
      HTMLVideoElement: FakeVideoElement,
    })
    main = new FakeVideoElement('video')
  })

  afterEach(() => {
    readAhead?.destroy()
    Object.assign(globalThis, { document: realDocument, HTMLMediaElement: realElement, HTMLVideoElement: realVideo })
  })

  const start = () => {
    readAhead = new ReadAhead('https://mum1-4.download.real-debrid.com/d/ID/film.mkv', main as unknown as HTMLVideoElement)
    return readAhead
  }

  /** Tick until the helpers stop changing, the way the timer would. */
  const settle = (ra: ReadAhead) => {
    for (let i = 0; i < 10; i++) ra.tick()
  }
  /** Each helper has its stretch loaded: `seconds` ahead of where it is. */
  const filled = (seconds = 20) => created.forEach((el) => (el.ranges = [[el.currentTime, el.currentTime + seconds]]))

  it('waits for the film itself to have ten seconds loaded before loading anything more', () => {
    const ra = start()
    main.currentTime = 100
    main.ranges = [[100, 106]]
    settle(ra)
    expect(created).toHaveLength(0)

    main.ranges = [[100, 112]]
    ra.tick()
    expect(created.map((el) => el.kind)).toEqual(['audio'])
    expect(created.every((el) => el.muted && el.preload === 'auto' && el.src.endsWith('/film.mkv'))).toBe(true)
  })

  it('fills one helper at a time, the next only once the one before has its stretch loaded', () => {
    const ra = start()
    main.currentTime = 100
    main.ranges = [[100, 112]]
    settle(ra)
    expect(created.map((el) => el.currentTime)).toEqual([115])

    filled()
    settle(ra)
    expect(created.map((el) => el.currentTime)).toEqual([115, 135])
    filled()
    settle(ra)
    expect(created).toHaveLength(2)
  })

  it('holds each helper ahead of the playhead, moving it only once it has fallen behind', () => {
    const ra = start()
    main.currentTime = 100
    main.ranges = [[100, 112]]
    settle(ra)
    filled()
    settle(ra)
    filled()
    expect(created.map((el) => el.currentTime)).toEqual([115, 135])

    // A couple of seconds on: not worth a seek yet.
    main.currentTime = 102
    main.ranges = [[100, 114]]
    settle(ra)
    expect(created.map((el) => el.currentTime)).toEqual([115, 135])

    main.currentTime = 106
    main.ranges = [[100, 118]]
    settle(ra)
    expect(created.map((el) => el.currentTime)).toEqual([121, 141])
  })

  it('leaves the connection to the film while it catches up after a jump', () => {
    const ra = start()
    main.currentTime = 100
    main.ranges = [[100, 112]]
    settle(ra)
    filled()
    settle(ra)
    filled()
    main.currentTime = 400
    main.ranges = [[100, 112], [400, 401]]
    settle(ra)
    expect(created.map((el) => el.currentTime)).toEqual([115, 135])
    main.ranges = [[100, 112], [400, 412]]
    ra.tick()
    expect(created.map((el) => el.currentTime), 'the nearest goes first').toEqual([415, 135])
    settle(ra)
    expect(created.map((el) => el.currentTime), 'the next waits until it has filled').toEqual([415, 135])
    filled()
    settle(ra)
    expect(created.map((el) => el.currentTime)).toEqual([415, 435])
  })

  it('replaces an <audio> helper that can’t play the file with a <video> one', () => {
    const ra = start()
    main.ranges = [[0, 12]]
    ra.tick()
    created[0].fire('error')
    expect(created[0].src).toBe('')
    expect(created).toHaveLength(2)
    expect(created[1].kind).toBe('video')
    expect(created[1].src.endsWith('/film.mkv')).toBe(true)
  })

  it('lets go of every helper when the file goes', () => {
    const ra = start()
    main.ranges = [[0, 12]]
    settle(ra)
    filled()
    settle(ra)
    ra.destroy()
    readAhead = null
    expect(created.every((el) => el.src === '' && el.loads === 1)).toBe(true)
  })
})
