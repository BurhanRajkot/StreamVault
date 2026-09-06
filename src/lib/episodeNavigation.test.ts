import { describe, it, expect } from 'bun:test'
import {
  nextEpisode,
  previousEpisode,
  isFirstEpisode,
  isLastEpisode,
  type SeasonSummary,
} from './episodeNavigation'

// Deliberately out of order — TMDB does not promise a sorted `seasons` array.
const SEASONS: SeasonSummary[] = [
  { season_number: 2, episode_count: 8 },
  { season_number: 1, episode_count: 10 },
  { season_number: 3, episode_count: 6 },
]

describe('nextEpisode', () => {
  it('advances within the current season', () => {
    expect(nextEpisode({ season: 1, episode: 3 }, SEASONS, 10)).toEqual({
      season: 1,
      episode: 4,
    })
  })

  it('rolls over into the next season from the last episode', () => {
    expect(nextEpisode({ season: 1, episode: 10 }, SEASONS, 10)).toEqual({
      season: 2,
      episode: 1,
    })
  })

  it('returns null at the last episode of the last season', () => {
    expect(nextEpisode({ season: 3, episode: 6 }, SEASONS, 6)).toBeNull()
  })

  it('clamps to the episode count when there is no season metadata', () => {
    expect(nextEpisode({ season: 1, episode: 4 }, [], 5)).toEqual({
      season: 1,
      episode: 5,
    })
    expect(nextEpisode({ season: 1, episode: 5 }, [], 5)).toBeNull()
  })

  it('clamps for a season the metadata does not cover', () => {
    expect(nextEpisode({ season: 99, episode: 2 }, SEASONS, 4)).toEqual({
      season: 99,
      episode: 3,
    })
    expect(nextEpisode({ season: 99, episode: 4 }, SEASONS, 4)).toBeNull()
  })
})

describe('previousEpisode', () => {
  it('steps back within the current season', () => {
    expect(previousEpisode({ season: 2, episode: 5 }, SEASONS)).toEqual({
      season: 2,
      episode: 4,
    })
  })

  it('drops to the last episode of the previous season from episode 1', () => {
    expect(previousEpisode({ season: 2, episode: 1 }, SEASONS)).toEqual({
      season: 1,
      episode: 10,
    })
  })

  it('returns null at the first episode of the first season', () => {
    expect(previousEpisode({ season: 1, episode: 1 }, SEASONS)).toBeNull()
  })

  it('falls back to episode 1 when the previous season has no episode count', () => {
    const seasons: SeasonSummary[] = [{ season_number: 1 }, { season_number: 2 }]
    expect(previousEpisode({ season: 2, episode: 1 }, seasons)).toEqual({
      season: 1,
      episode: 1,
    })
  })

  it('clamps to episode 1 when there is no season metadata', () => {
    expect(previousEpisode({ season: 1, episode: 1 }, [])).toBeNull()
    expect(previousEpisode({ season: 1, episode: 2 }, [])).toEqual({
      season: 1,
      episode: 1,
    })
  })
})

describe('boundary flags', () => {
  it('marks the very first episode', () => {
    expect(isFirstEpisode({ season: 1, episode: 1 }, SEASONS)).toBe(true)
    expect(isFirstEpisode({ season: 2, episode: 1 }, SEASONS)).toBe(false)
    expect(isFirstEpisode({ season: 1, episode: 2 }, SEASONS)).toBe(false)
  })

  it('marks the very last episode', () => {
    expect(isLastEpisode({ season: 3, episode: 6 }, SEASONS, 6)).toBe(true)
    expect(isLastEpisode({ season: 3, episode: 5 }, SEASONS, 6)).toBe(false)
    expect(isLastEpisode({ season: 1, episode: 10 }, SEASONS, 10)).toBe(false)
  })

  it('falls back to the episode count with no season metadata', () => {
    expect(isFirstEpisode({ season: 1, episode: 1 }, [])).toBe(true)
    expect(isLastEpisode({ season: 1, episode: 5 }, [], 5)).toBe(true)
    expect(isLastEpisode({ season: 1, episode: 4 }, [], 5)).toBe(false)
  })
})

describe('round trips', () => {
  it('skipping forward then back returns to the starting episode', () => {
    const start = { season: 1, episode: 10 }
    const forward = nextEpisode(start, SEASONS, 10)
    expect(forward).toEqual({ season: 2, episode: 1 })
    expect(previousEpisode(forward!, SEASONS)).toEqual(start)
  })
})
