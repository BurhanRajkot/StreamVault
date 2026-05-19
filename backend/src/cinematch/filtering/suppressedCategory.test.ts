import { describe, expect, it } from 'bun:test'
import {
  getCategoryKeepRatio,
  CATEGORY_THROTTLE_START,
  CATEGORY_THROTTLE_FLOOR,
} from './suppressedCategory'

describe('suppressedCategory - getCategoryKeepRatio', () => {
  it('should return 1.0 when dislikes are below throttle start', () => {
    expect(getCategoryKeepRatio(0)).toBe(1.0)
    expect(getCategoryKeepRatio(CATEGORY_THROTTLE_START - 1)).toBe(1.0)
  })

  it('should return 1.0 at exactly throttle start', () => {
    expect(getCategoryKeepRatio(CATEGORY_THROTTLE_START)).toBe(1.0)
  })

  it('should return 1.0 for negative dislikes', () => {
    expect(getCategoryKeepRatio(-5)).toBe(1.0)
  })

  it('should decrease the ratio as dislikes increase', () => {
    const ratio8 = getCategoryKeepRatio(8)
    const ratio10 = getCategoryKeepRatio(10)
    const ratio15 = getCategoryKeepRatio(15)

    expect(ratio8).toBeLessThan(1.0)
    expect(ratio10).toBeLessThan(ratio8)
    expect(ratio15).toBeLessThan(ratio10)

    // Check approximate values
    expect(ratio8).toBeCloseTo(0.6376, 4)
    expect(ratio10).toBeCloseTo(0.4724, 4)
    expect(ratio15).toBeCloseTo(0.2231, 4)
  })

  it('should hit the throttle floor for very high dislikes', () => {
    // When dislikes are very high, the calculated exp value drops below floor.
    // e.g. for 30 dislikes: exp(-(30-5) * 0.15) = ~0.0235
    // But the function is capped at CATEGORY_THROTTLE_FLOOR (0.05).
    expect(getCategoryKeepRatio(30)).toBe(CATEGORY_THROTTLE_FLOOR)
    expect(getCategoryKeepRatio(50)).toBe(CATEGORY_THROTTLE_FLOOR)
    expect(getCategoryKeepRatio(100)).toBe(CATEGORY_THROTTLE_FLOOR)
  })
})
