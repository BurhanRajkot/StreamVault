import { describe, expect, it } from 'bun:test'
import { parseReleaseSearchQuery } from './releases'

describe('parseReleaseSearchQuery', () => {
  it('reads a movie search and defaults the rest', () => {
    expect(parseReleaseSearchQuery({ title: ' Inception 2010 ', imdb: 'tt1375666' })).toEqual({
      title: 'Inception 2010',
      imdbId: 'tt1375666',
      mediaType: 'movie',
      season: undefined,
      episode: undefined,
      limit: 20,
    })
  })

  it('reads an episode search and caps the limit', () => {
    expect(
      parseReleaseSearchQuery({ title: 'Severance', imdb: 'tt11280740', type: 'tv', season: '1', episode: '3', limit: '500' })
    ).toMatchObject({ mediaType: 'tv', season: 1, episode: 3, limit: 50 })
  })

  it('needs a title', () => {
    expect(parseReleaseSearchQuery({ imdb: 'tt1375666' })).toEqual({ error: 'title is required' })
    expect(parseReleaseSearchQuery({ title: '   ' })).toEqual({ error: 'title is required' })
  })

  it('refuses anything that is not an IMDb id', () => {
    expect(parseReleaseSearchQuery({ title: 'x', imdb: 'tt1375666/../../etc' })).toHaveProperty('error')
    expect(parseReleaseSearchQuery({ title: 'x', imdb: ['tt1', 'tt2'] })).toMatchObject({ imdbId: undefined })
  })

  it('ignores season and episode values that are not whole numbers', () => {
    expect(parseReleaseSearchQuery({ title: 'x', type: 'tv', season: '-1', episode: 'abc' })).toMatchObject({
      season: undefined,
      episode: undefined,
    })
  })
})
