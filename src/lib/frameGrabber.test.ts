import { describe, it, expect } from 'bun:test'
import { coarseToFine } from './frameGrabber'

describe('coarseToFine', () => {
  it('halves, then quarters, then eighths the film', () => {
    expect(coarseToFine(7)).toEqual([0.5, 0.25, 0.75, 0.125, 0.625, 0.375, 0.875])
  })

  it('spreads however few have been grabbed over the whole film', () => {
    const spots = coarseToFine(40)
    expect(new Set(spots).size).toBe(40)
    expect(spots.every((f) => f > 0 && f < 1)).toBe(true)
    // After any first n spots, no gap between neighbours is more than twice the even spacing
    for (const n of [3, 7, 15, 40]) {
      const sorted = [0, ...spots.slice(0, n).sort((a, b) => a - b), 1]
      const widest = Math.max(...sorted.slice(1).map((f, i) => f - sorted[i]))
      expect(widest).toBeLessThanOrEqual(2 / (n + 1) + 1e-9)
    }
  })
})
