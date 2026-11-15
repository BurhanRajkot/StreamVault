import { describe, it, expect } from 'bun:test'
import { reconnectDelayMs, shouldHedge, StallMeter, stallThroughputKbps, startupPatience } from './streamRecovery'

describe('startupPatience', () => {
  it('gives a fast or unknown connection the usual time', () => {
    expect(startupPatience(null)).toBe(1)
    expect(startupPatience(0)).toBe(1)
    expect(startupPatience(4000)).toBe(1)
    expect(startupPatience(50_000)).toBe(1)
  })

  it('gives a slow one longer, up to four times', () => {
    expect(startupPatience(2000)).toBe(2)
    expect(startupPatience(1000)).toBe(4)
    expect(startupPatience(200)).toBe(4)
  })
})

describe('shouldHedge', () => {
  it('races a second connection only when the line can carry two', () => {
    expect(shouldHedge(null)).toBe(true)
    expect(shouldHedge(20_000)).toBe(true)
    expect(shouldHedge(1500)).toBe(false)
  })
})

describe('reconnectDelayMs', () => {
  it('waits 1s, 2s, 4s, 8s, then every 10s', () => {
    expect([1, 2, 3, 4, 5, 6, 50].map(reconnectDelayMs)).toEqual([1000, 2000, 4000, 8000, 10_000, 10_000, 10_000])
  })

  it('treats a nonsense attempt as the first', () => {
    expect(reconnectDelayMs(0)).toBe(1000)
    expect(reconnectDelayMs(-3)).toBe(1000)
  })
})

describe('StallMeter', () => {
  it('ignores blips under a second', () => {
    const meter = new StallMeter()
    for (let i = 0; i < 10; i++) meter.note(i * 1000, 500)
    expect(meter.struggling(10_000)).toBe(false)
  })

  it('calls three stalls in three minutes struggling', () => {
    const meter = new StallMeter()
    meter.note(10_000, 2000)
    meter.note(40_000, 2000)
    expect(meter.struggling(41_000)).toBe(false)
    meter.note(70_000, 2000)
    expect(meter.struggling(71_000)).toBe(true)
  })

  it('counts a stall still under way', () => {
    const meter = new StallMeter()
    meter.note(10_000, 2000)
    meter.note(40_000, 2000)
    expect(meter.struggling(60_000, 1500)).toBe(true)
    expect(meter.struggling(60_000, 500)).toBe(false)
  })

  it('calls 15 seconds stalled in the window struggling, however few stalls', () => {
    const meter = new StallMeter()
    meter.note(10_000, 9000)
    expect(meter.struggling(11_000)).toBe(false)
    meter.note(100_000, 6000)
    expect(meter.struggling(101_000)).toBe(true)
  })

  it('forgets stalls older than three minutes', () => {
    const meter = new StallMeter()
    meter.note(0, 2000)
    meter.note(1000, 2000)
    meter.note(4 * 60_000, 2000)
    expect(meter.struggling(4 * 60_000)).toBe(false)
  })

  it('starts over on reset', () => {
    const meter = new StallMeter()
    meter.note(0, 20_000)
    meter.reset()
    expect(meter.struggling(1000)).toBe(false)
  })
})

describe('stallThroughputKbps', () => {
  it('scales the file’s rate by how fast it loaded against real time', () => {
    // 5s of an 8 Mbit/s file loaded in 10s: the line carries ~4 Mbit/s.
    expect(stallThroughputKbps(5, 10_000, 8000)).toBe(4000)
  })

  it('says nothing when the stall was short, the rate unknown, or the film loaded faster than it plays', () => {
    expect(stallThroughputKbps(1, 1500, 8000)).toBeNull()
    expect(stallThroughputKbps(5, 10_000, null)).toBeNull()
    expect(stallThroughputKbps(0, 10_000, 8000)).toBeNull()
    expect(stallThroughputKbps(12, 10_000, 8000)).toBeNull()
  })
})
