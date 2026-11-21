import { describe, expect, it } from 'bun:test'
import { genreQueries, genresFor } from './genreDiscovery'

describe('genreQueries', () => {
  it("pairs the user's top genres, the strongest pair all-time and the rest recent", () => {
    // Drama, Crime, Comedy
    expect(genreQueries({ 18: 1, 80: 0.6, 35: 0.4, 99: 0.1 })).toEqual([
      { genres: [18, 80], label: 'Drama & Crime', recent: false },
      { genres: [18, 35], label: 'Drama & Comedy', recent: true },
      { genres: [80, 35], label: 'Crime & Comedy', recent: true },
    ])
  })

  it('reads one genre both ways when that is all there is, and nothing for no history', () => {
    expect(genreQueries({ 35: 1 }).map((q) => q.recent)).toEqual([false, true])
    expect(genreQueries({})).toEqual([])
  })

  it('leaves out talk, news and reality', () => {
    expect(genreQueries({ 10767: 5, 18: 1 })[0].genres).toEqual([18])
  })
})

describe('genresFor (TMDB numbers TV genres differently)', () => {
  it('translates movie genres for TV and back', () => {
    expect(genresFor('tv', [28, 878])).toEqual([10759, 10765])
    expect(genresFor('movie', [10765, 18])).toEqual([878, 18])
  })

  it('merges genres that share a TV genre, and gives up on one TV has no counterpart for', () => {
    expect(genresFor('tv', [28, 12])).toEqual([10759])
    expect(genresFor('tv', [53, 18])).toBeNull()
  })
})
