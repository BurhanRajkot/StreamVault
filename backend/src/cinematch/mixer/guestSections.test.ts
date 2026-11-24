import { describe, it, expect } from 'bun:test'
import type { CandidateSource, ScoredCandidate } from '../types'
import { buildGuestSections } from './homeTimeline'

function candidate(id: number, sources: CandidateSource[], rating = 7, votes = 5000): ScoredCandidate {
  return {
    tmdbId: id,
    mediaType: 'movie',
    title: `Title ${id}`,
    posterPath: null,
    backdropPath: null,
    overview: '',
    releaseDate: '2020-01-01',
    voteAverage: rating,
    voteCount: votes,
    popularity: 100,
    genreIds: [],
    source: sources[0],
    sources,
    score: 1,
  } as unknown as ScoredCandidate
}

const ids = (items: ScoredCandidate[]) => items.map((c) => c.tmdbId)

describe('buildGuestSections', () => {
  it("doesn't repeat this week's trending titles under Most Popular", () => {
    const both = [1, 2, 3, 4, 5].map((id) => candidate(id, ['trending', 'popular_fallback']))
    const popularOnly = [6, 7, 8, 9, 10].map((id) => candidate(id, ['popular_fallback']))
    const sections = buildGuestSections([...both, ...popularOnly])

    expect(sections.map((s) => s.title)).toEqual(['Trending This Week', 'Most Popular Right Now'])
    expect(ids(sections[0].items)).toEqual([1, 2, 3, 4, 5])
    expect(ids(sections[1].items)).toEqual([6, 7, 8, 9, 10])
  })

  it('orders Top Rated by rating and leaves out titles too few people rated', () => {
    const rated = [
      candidate(11, ['tmdb_recommendations'], 8.1),
      candidate(12, ['tmdb_recommendations'], 9.9, 40), // a handful of fans
      candidate(13, ['tmdb_recommendations'], 8.7),
      candidate(14, ['tmdb_recommendations'], 8.4),
      candidate(15, ['tmdb_recommendations'], 8.2),
      candidate(16, ['tmdb_recommendations'], 8.6),
    ]
    const [topRated] = buildGuestSections(rated)

    expect(topRated.title).toBe('Top Rated All Time')
    expect(ids(topRated.items)).toEqual([13, 16, 14, 15, 11])
  })

  it('leaves out a row with fewer than five titles of its own', () => {
    const trending = [1, 2, 3, 4, 5].map((id) => candidate(id, ['trending', 'popular_fallback']))
    const sections = buildGuestSections([...trending, candidate(6, ['popular_fallback'])])

    expect(sections.map((s) => s.title)).toEqual(['Trending This Week'])
  })
})
