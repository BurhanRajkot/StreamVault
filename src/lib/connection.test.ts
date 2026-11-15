import { afterEach, describe, it, expect } from 'bun:test'
import { browserHintKbps, estimateConnection, knownThroughput, noteThroughput, resetThroughput, throughputKbps } from './connection'

afterEach(() => resetThroughput())

describe('throughputKbps', () => {
  it('turns bytes over milliseconds into kbit/s', () => {
    // 1.5 MB in 1.2s ≈ 10 Mbit/s.
    expect(throughputKbps(1_500_000, 1200)).toBe(10_000)
  })

  it('needs enough bytes or enough time to judge by', () => {
    expect(throughputKbps(10_000, 50)).toBeNull()
    // Little arrived, but over a long time: that is the answer — a slow line.
    expect(throughputKbps(10_000, 3000)).toBe(27)
    expect(throughputKbps(0, 3000)).toBeNull()
    expect(throughputKbps(100_000, 0)).toBeNull()
  })
})

describe('browserHintKbps', () => {
  it('trusts the browser only when it calls the connection slow', () => {
    expect(browserHintKbps(null)).toBeNull()
    expect(browserHintKbps({ effectiveType: '4g', downlink: 10 })).toBeNull()
    expect(browserHintKbps({ effectiveType: '3g', downlink: 0.45 })).toBe(450)
    expect(browserHintKbps({ effectiveType: '3g' })).toBe(700)
    expect(browserHintKbps({ effectiveType: 'slow-2g' })).toBe(50)
  })
})

describe('what the player saw', () => {
  it('is what the next film starts from', async () => {
    expect(knownThroughput()).toBeNull()
    noteThroughput(2345.6)
    expect(knownThroughput()).toBe(2346)
    expect(await estimateConnection()).toBe(2346)
  })

  it('ignores nonsense', () => {
    noteThroughput(0)
    noteThroughput(Number.NaN)
    noteThroughput(Number.POSITIVE_INFINITY)
    expect(knownThroughput()).toBeNull()
  })
})
