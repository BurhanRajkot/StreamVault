import { beforeEach, describe, expect, it } from 'bun:test'
import { formatPlayerTime, isFinished, readResumePosition, resumeKey, saveResumePosition } from './playbackPosition'

/** Minimal in-memory localStorage — bun has none. */
class MemoryStorage {
  private map = new Map<string, string>()
  get length() {
    return this.map.size
  }
  key(i: number) {
    return [...this.map.keys()][i] ?? null
  }
  getItem(k: string) {
    return this.map.get(k) ?? null
  }
  setItem(k: string, v: string) {
    this.map.set(k, String(v))
  }
  removeItem(k: string) {
    this.map.delete(k)
  }
  clear() {
    this.map.clear()
  }
}

const NOW = Date.parse('2026-10-11T12:00:00Z')
const HOUR = 3600

beforeEach(() => {
  ;(globalThis as { localStorage?: unknown }).localStorage = new MemoryStorage()
})

describe('resumeKey', () => {
  it('distinguishes episodes, and leaves movies bare', () => {
    expect(resumeKey('tt1')).toBe('tt1')
    expect(resumeKey('tt1', 2, 5)).toBe('tt1:s2e5')
  })
})

describe('isFinished', () => {
  it('treats the credits as finished', () => {
    expect(isFinished(2 * HOUR - 60, 2 * HOUR)).toBe(true)
    expect(isFinished(0.96 * 2 * HOUR, 2 * HOUR)).toBe(true)
    expect(isFinished(HOUR, 2 * HOUR)).toBe(false)
  })

  it("doesn't apply the credits rule to short videos", () => {
    expect(isFinished(90, 180)).toBe(false)
    expect(isFinished(175, 180)).toBe(true)
  })

  it('never calls an unknown duration finished', () => {
    expect(isFinished(5000, 0)).toBe(false)
    expect(isFinished(5000, NaN)).toBe(false)
  })
})

describe('resume points', () => {
  it('round-trips a mid-title position', () => {
    saveResumePosition('tt1', 1234.7, 2 * HOUR, NOW)
    expect(readResumePosition('tt1', NOW)).toBe(1234)
  })

  it('offers nothing for the first seconds or the very end — and forgets an old point', () => {
    saveResumePosition('tt1', 1234, 2 * HOUR, NOW)
    saveResumePosition('tt1', 10, 2 * HOUR, NOW)
    expect(readResumePosition('tt1', NOW)).toBeNull()

    saveResumePosition('tt1', 1234, 2 * HOUR, NOW)
    saveResumePosition('tt1', 2 * HOUR - 30, 2 * HOUR, NOW)
    expect(readResumePosition('tt1', NOW)).toBeNull()
  })

  it('expires after two months', () => {
    saveResumePosition('tt1', 1234, 2 * HOUR, NOW)
    expect(readResumePosition('tt1', NOW + 61 * 24 * HOUR * 1000)).toBeNull()
  })

  it('keeps only the newest 200', () => {
    for (let i = 0; i < 205; i++) saveResumePosition(`tt${i}`, 100, 2 * HOUR, NOW + i)
    expect(localStorage.length).toBe(200)
    expect(readResumePosition('tt0', NOW + 300)).toBeNull()
    expect(readResumePosition('tt204', NOW + 300)).toBe(100)
  })

  it('survives storage that throws', () => {
    ;(globalThis as { localStorage?: unknown }).localStorage = {
      getItem: () => {
        throw new Error('denied')
      },
    }
    expect(() => saveResumePosition('tt1', 1234, 2 * HOUR, NOW)).not.toThrow()
    expect(readResumePosition('tt1', NOW)).toBeNull()
  })
})

describe('formatPlayerTime', () => {
  it('formats minutes and hours', () => {
    expect(formatPlayerTime(0)).toBe('0:00')
    expect(formatPlayerTime(75.9)).toBe('1:15')
    expect(formatPlayerTime(3725)).toBe('1:02:05')
  })

  it('treats unknown durations as zero', () => {
    expect(formatPlayerTime(NaN)).toBe('0:00')
    expect(formatPlayerTime(Infinity)).toBe('0:00')
    expect(formatPlayerTime(-5)).toBe('0:00')
  })
})
