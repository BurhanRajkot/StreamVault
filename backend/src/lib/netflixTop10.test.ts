import { describe, it, expect } from 'bun:test'
import { parseTop10Lines, pickTmdbMatch } from './netflixTop10'

const row = (iso: string, week: string, category: string, rank: number, title: string, season = 'N/A') =>
  [iso === 'IN' ? 'India' : 'Iceland', iso, week, category, String(rank), title, season, '1'].join('\t')

describe('parseTop10Lines', () => {
  it("keeps only the country's newest week, split into films and TV in rank order", () => {
    const lines = [
      'country_name\tcountry_iso2\tweek\tcategory\tweekly_rank\tshow_title\tseason_title\tcumulative_weeks_in_top_10',
      row('IS', '2026-11-08', 'Films', 1, 'Other country'),
      row('IN', '2026-11-08', 'TV', 2, 'Dead-End Job', 'Dead-End Job: Limited Series'),
      row('IN', '2026-11-08', 'TV', 1, 'Akka: The Protectors', 'Akka: The Protectors: Season 1'),
      row('IN', '2026-11-08', 'Films', 1, 'Baththa'),
      row('IN', '2026-11-01', 'Films', 1, 'Last week'),
    ]
    const top = parseTop10Lines(lines, 'IN')
    expect(top?.week).toBe('2026-11-08')
    expect(top?.tv.map((e) => e.title)).toEqual(['Akka: The Protectors', 'Dead-End Job'])
    expect(top?.movie.map((e) => e.title)).toEqual(['Baththa'])
    expect(top?.movie[0].season).toBeUndefined()
  })

  it('returns null for a country that is not listed', () => {
    expect(parseTop10Lines([row('IN', '2026-11-08', 'Films', 1, 'Baththa')], 'US')).toBeNull()
  })
})

describe('pickTmdbMatch', () => {
  it('takes the most popular exact title match that has a poster', () => {
    const hits = [
      { id: 1, name: 'Lupin', popularity: 3, poster_path: '/a.jpg' },
      { id: 2, name: 'Lupin', popularity: 93, poster_path: '/b.jpg' },
      { id: 3, name: 'Lupin III', popularity: 200, poster_path: '/c.jpg' },
    ]
    expect(pickTmdbMatch('Lupin', hits)?.id).toBe(2)
  })

  it('matches "&" to "and", and a subtitle-less name only for a recent title', () => {
    expect(pickTmdbMatch('Avarachan & Sons', [{ id: 1, title: 'Avarachan and Sons', poster_path: '/a.jpg' }])?.id).toBe(1)
    const thisYear = new Date().toISOString().slice(0, 10)
    expect(pickTmdbMatch('Akka: The Protectors', [{ id: 9, name: 'Akka', first_air_date: thisYear, poster_path: '/a.jpg' }])?.id).toBe(9)
    expect(pickTmdbMatch('Akka: The Protectors', [{ id: 9, name: 'Akka', first_air_date: '1990-01-01', poster_path: '/a.jpg' }])).toBeNull()
  })

  it('finds nothing when no title matches', () => {
    expect(pickTmdbMatch('WWE Crown Jewel', [{ id: 1, name: 'Crown Jewel' }])).toBeNull()
  })
})
