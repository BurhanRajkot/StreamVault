import { describe, it, expect } from 'bun:test'
import { interleave } from './tmdbRecommendations'

describe('interleave', () => {
  it("takes each list's first item, then each one's second, and so on", () => {
    expect(interleave<number | string>([[1, 2, 3], ['a'], [10, 20]])).toEqual([1, 'a', 10, 2, 20, 3])
    expect(interleave([])).toEqual([])
  })
})
