import { describe, it, expect } from 'bun:test'
import { filmography, matchCollection, matchCompanies, matchKeyword, nameAnswersQuery, pickPerson } from './entitySearch'

describe('nameAnswersQuery', () => {
  it('matches a full name, in any case, and one still being typed', () => {
    expect(nameAnswersQuery('Christopher Nolan', 'christopher nolan')).toBe(true)
    expect(nameAnswersQuery('Christopher Nolan', 'Christopher Nol')).toBe(true)
    expect(nameAnswersQuery('Shah Rukh Khan', 'shah rukh')).toBe(true)
  })

  it('treats a single word as a name only when it is the whole name', () => {
    expect(nameAnswersQuery('Zendaya', 'zendaya')).toBe(true)
    expect(nameAnswersQuery('Tom Hanks', 'tom')).toBe(false)
  })

  it('rejects names missing a typed word', () => {
    expect(nameAnswersQuery('Christopher Nolan', 'christopher walken')).toBe(false)
  })
})

describe('pickPerson', () => {
  const nolan = { media_type: 'person', id: 525, name: 'Christopher Nolan', popularity: 9, known_for_department: 'Directing' }
  const namesake = { media_type: 'person', id: 4066940, name: 'Christopher Nolan', popularity: 0.1 }

  it('picks the well-known person among namesakes and ignores titles', () => {
    const hits = [nolan, { media_type: 'movie', id: 1, title: 'Inside Christopher Nolan’s Oppenheimer' }, namesake]
    expect(pickPerson(hits, 'Christopher Nolan')?.id).toBe(525)
  })

  it('answers a famous surname alone with the person TMDB ranks first', () => {
    expect(pickPerson([nolan], 'nolan')?.id).toBe(525)
  })

  it('finds nobody for an ordinary title search', () => {
    expect(pickPerson([{ media_type: 'movie', id: 27205, title: 'Inception' }], 'inception')).toBeNull()
    expect(pickPerson([namesake], 'Christopher Nolan')).toBeNull()
  })
})

describe('filmography', () => {
  const film = (id: number, extra: Record<string, unknown> = {}) => ({
    id,
    media_type: 'movie' as const,
    title: `Film ${id}`,
    poster_path: '/p.jpg',
    vote_count: 1000,
    popularity: 10,
    ...extra,
  })

  it("lists a director's films, not their acting cameos or making-of appearances", () => {
    const works = filmography(
      {
        crew: [film(1, { job: 'Director' }), film(2, { job: 'Director' }), film(3, { job: 'Director' }), film(4, { job: 'Producer' })],
        cast: [film(5, { character: 'Himself' })],
      },
      'Directing'
    )
    expect(works.map((w) => w.id).sort()).toEqual([1, 2, 3])
  })

  it('drops talk shows, guest spots, artless and unrated credits', () => {
    const works = filmography(
      {
        cast: [
          film(1, { character: 'Cobb' }),
          film(2, { genre_ids: [10767], media_type: 'tv' }),
          film(3, { media_type: 'tv', episode_count: 1 }),
          film(4, { poster_path: null }),
          film(5, { vote_count: 2, popularity: 0.5 }),
        ],
      },
      'Acting'
    )
    expect(works.map((w) => w.id)).toEqual([1])
  })

  it('puts the best-known work first and lists each title once', () => {
    const works = filmography(
      { cast: [film(1, { vote_count: 50, popularity: 1 }), film(2, { vote_count: 30000, popularity: 40 }), film(2, { character: 'Again' })] },
      'Acting'
    )
    expect(works.map((w) => w.id)).toEqual([2, 1])
  })
})

describe('company, collection and keyword matching', () => {
  it('finds a studio by its exact name, or "<name> Studios"', () => {
    expect(matchCompanies([{ id: 3, name: 'Pixar' }, { id: 219390, name: 'Pixar Canada' }], 'pixar').map((c) => c.id)).toEqual([3])
    expect(matchCompanies([{ id: 420, name: 'Marvel Studios' }, { id: 19551, name: 'Marvel Enterprises' }], 'Marvel').map((c) => c.id)).toEqual([420])
    expect(matchCompanies([{ id: 1, name: 'Pixcom' }], 'pixar')).toEqual([])
  })

  it('finds a franchise by "<name> Collection"', () => {
    expect(matchCollection([{ id: 302331, name: 'LEGO Star Wars Collection' }, { id: 10, name: 'Star Wars Collection' }], 'star wars')?.id).toBe(10)
    expect(matchCollection([{ id: 10, name: 'Star Wars Collection' }], 'star')).toBeNull()
  })

  it('takes a keyword only for an exact multi-word phrase', () => {
    expect(matchKeyword([{ id: 33722, name: 'true crime' }], 'True Crime')?.id).toBe(33722)
    expect(matchKeyword([{ id: 10051, name: 'heist' }], 'heist')).toBeNull()
  })
})
