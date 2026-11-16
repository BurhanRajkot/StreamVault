import { describe, it, expect } from 'bun:test'
import { aggregateEngagement, franchiseKey } from './userProfile'

const NOW = new Date('2026-11-17T00:00:00Z').getTime()
const daysAgo = (n: number) => new Date(NOW - n * 86_400_000).toISOString()
const watch = (tmdbId: number, days: number, weight = 1, mediaType = 'tv') => ({ tmdbId, mediaType, eventType: 'watch', weight, createdAt: daysAgo(days) })

describe('aggregateEngagement', () => {
  it('ranks a binge above a title opened once more recently', () => {
    const rows = [watch(2, 0, 0.1), ...Array.from({ length: 40 }, (_, i) => watch(1, 3 + i / 10))]
    const ranked = aggregateEngagement(rows, NOW)
    expect(ranked[0].tmdbId).toBe(1)
    expect(ranked[0].watchEvents).toBe(40)
    expect(ranked[1].watchEvents).toBe(0.25)
  })

  it('counts favourites and good ratings, and zeroes dislikes', () => {
    const rows = [
      watch(1, 5),
      { tmdbId: 2, mediaType: 'movie', eventType: 'favorite', weight: 0.9, createdAt: daysAgo(5) },
      watch(2, 5, 1, 'movie'),
      { tmdbId: 3, mediaType: 'movie', eventType: 'dislike', weight: -0.6, createdAt: daysAgo(1) },
      watch(3, 2, 1, 'movie'),
    ]
    const byId = new Map(aggregateEngagement(rows, NOW).map((e) => [e.tmdbId, e]))
    expect(byId.get(2)!.score).toBeGreaterThan(byId.get(1)!.score)
    expect(byId.get(3)!.score).toBe(0)
    expect(byId.get(2)!.mediaType).toBe('movie')
  })

  it('lets an old favourite fade but never vanish', () => {
    const recent = aggregateEngagement([watch(1, 1)], NOW)[0].score
    const old = aggregateEngagement([watch(1, 400)], NOW)[0].score
    expect(old).toBeLessThan(recent)
    expect(old).toBeGreaterThan(recent * 0.25)
  })
})

describe('franchiseKey', () => {
  it('gives sequels and subtitled entries the same key', () => {
    expect(franchiseKey('Kung Fu Panda 4')).toBe(franchiseKey('Kung Fu Panda'))
    expect(franchiseKey('The Lord of the Rings: The Return of the King')).toBe(franchiseKey('The Lord of the Rings: The Two Towers'))
    expect(franchiseKey('The Godfather Part II')).toBe(franchiseKey('The Godfather'))
  })

  it('keeps different titles apart', () => {
    expect(franchiseKey('Breaking Bad')).not.toBe(franchiseKey('Better Call Saul'))
  })
})
