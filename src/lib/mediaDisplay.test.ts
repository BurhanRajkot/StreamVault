import { describe, it, expect } from 'bun:test'
import { deriveMediaDisplay } from './mediaDisplay'
import { CONFIG, type Media } from './config'

const img = (size: keyof typeof CONFIG.IMG_SIZES, path: string) =>
  `${CONFIG.IMG_BASE_URL}${CONFIG.IMG_SIZES[size]}${path}`

/** Only the fields under test — the rest of `Media` is irrelevant here. */
const media = (over: Partial<Media> = {}): Media =>
  ({
    id: 1,
    poster_path: '/poster.jpg',
    backdrop_path: '/backdrop.jpg',
    overview: '',
    vote_average: 0,
    ...over,
  }) as Media

describe('deriveMediaDisplay', () => {
  it('prefers `title`, falling back to `name` then a placeholder', () => {
    expect(deriveMediaDisplay(media({ title: 'Dune' }), 'movie').title).toBe('Dune')
    expect(deriveMediaDisplay(media({ name: 'Severance' }), 'tv').title).toBe('Severance')
    expect(deriveMediaDisplay(media(), 'movie').title).toBe('Unknown')
  })

  it('renders the vote average as a match percentage', () => {
    expect(deriveMediaDisplay(media({ vote_average: 8.24 }), 'movie').match).toBe('82%')
    expect(deriveMediaDisplay(media(), 'movie').match).toBe('0%')
  })

  it('takes the year from whichever date field the media type carries', () => {
    expect(deriveMediaDisplay(media({ release_date: '2021-10-22' }), 'movie').year).toBe('2021')
    expect(deriveMediaDisplay(media({ first_air_date: '2022-02-18' }), 'tv').year).toBe('2022')
    expect(deriveMediaDisplay(media(), 'movie').year).toBe('')
  })

  describe('content rating', () => {
    const withReleaseDates = media({
      release_dates: {
        results: [
          { iso_3166_1: 'GB', release_dates: [{ certification: '12A' }] },
          { iso_3166_1: 'US', release_dates: [{ certification: 'PG-13' }] },
        ],
      },
    })

    const withContentRatings = media({
      content_ratings: {
        results: [
          { iso_3166_1: 'GB', rating: '15' },
          { iso_3166_1: 'US', rating: 'TV-MA' },
        ],
      },
    })

    it('reads the US certificate from release_dates for a movie', () => {
      expect(deriveMediaDisplay(withReleaseDates, 'movie').contentRating).toBe('PG-13')
    })

    it('reads the US rating from content_ratings for a show', () => {
      expect(deriveMediaDisplay(withContentRatings, 'tv').contentRating).toBe('TV-MA')
    })

    it('treats media_type as a movie even when the mode is not', () => {
      const asMovie = media({
        media_type: 'movie',
        release_dates: withReleaseDates.release_dates,
      })
      expect(deriveMediaDisplay(asMovie, 'home').contentRating).toBe('PG-13')
    })

    it('falls back to NR when the US entry is missing or uncertified', () => {
      expect(deriveMediaDisplay(media(), 'movie').contentRating).toBe('NR')
      expect(deriveMediaDisplay(withContentRatings, 'movie').contentRating).toBe('NR')
      const uncertified = media({
        release_dates: { results: [{ iso_3166_1: 'US', release_dates: [] }] },
      })
      expect(deriveMediaDisplay(uncertified, 'movie').contentRating).toBe('NR')
    })
  })

  describe('duration', () => {
    it('formats a runtime in hours and minutes', () => {
      expect(deriveMediaDisplay(media({ runtime: 155 }), 'movie').durationStr).toBe('2h 35m')
    })

    it('drops the hour part under an hour', () => {
      expect(deriveMediaDisplay(media({ runtime: 47 }), 'movie').durationStr).toBe('47m')
    })

    it('counts seasons for a show, pluralising only when needed', () => {
      expect(deriveMediaDisplay(media({ number_of_seasons: 1 }), 'tv').durationStr).toBe('1 Season')
      expect(deriveMediaDisplay(media({ number_of_seasons: 3 }), 'tv').durationStr).toBe('3 Seasons')
    })

    it('is empty when neither is known', () => {
      expect(deriveMediaDisplay(media(), 'movie').durationStr).toBe('')
    })
  })

  it('names the director from the crew and caps the cast at four', () => {
    const crew = [
      { id: 1, name: 'Editor Person', job: 'Editor', department: 'Editing', profile_path: null },
      { id: 2, name: 'Denis Villeneuve', job: 'Director', department: 'Directing', profile_path: null },
    ]
    const cast = Array.from({ length: 6 }, (_, i) => ({
      id: i,
      name: `Actor ${i}`,
      character: `Role ${i}`,
      profile_path: null,
    }))

    const result = deriveMediaDisplay(media({ credits: { cast, crew } }), 'movie')

    expect(result.director).toBe('Denis Villeneuve')
    expect(result.cast).toHaveLength(4)
    expect(result.cast[0]).toEqual({
      name: 'Actor 0',
      role: 'Role 0',
      image: '/placeholder.svg',
    })
  })

  it('reports an unknown director when there is no crew', () => {
    expect(deriveMediaDisplay(media(), 'movie').director).toBe('Unknown')
    expect(deriveMediaDisplay(media(), 'movie').cast).toEqual([])
  })

  describe('logo selection', () => {
    it('prefers the English logo', () => {
      const withLogos = media({
        images: {
          logos: [
            { file_path: '/fr.png', iso_639_1: 'fr' },
            { file_path: '/en.png', iso_639_1: 'en' },
          ],
          backdrops: [],
        },
      })
      expect(deriveMediaDisplay(withLogos, 'movie').logoImage).toBe(img('logo', '/en.png'))
    })

    it('falls back to a language-less logo, then to the first one', () => {
      const noEnglish = media({
        images: {
          logos: [
            { file_path: '/fr.png', iso_639_1: 'fr' },
            { file_path: '/none.png', iso_639_1: null },
          ],
          backdrops: [],
        },
      })
      expect(deriveMediaDisplay(noEnglish, 'movie').logoImage).toBe(img('logo', '/none.png'))

      const onlyForeign = media({
        images: { logos: [{ file_path: '/fr.png', iso_639_1: 'fr' }], backdrops: [] },
      })
      expect(deriveMediaDisplay(onlyForeign, 'movie').logoImage).toBe(img('logo', '/fr.png'))
    })

    it('is null when there are no logos', () => {
      expect(deriveMediaDisplay(media(), 'movie').logoImage).toBeNull()
    })
  })

  it('falls back to the backdrop when a poster is missing', () => {
    const noPoster = media({ poster_path: null })
    expect(deriveMediaDisplay(noPoster, 'movie').posterImage).toBe(img('poster', '/backdrop.jpg'))
    expect(deriveMediaDisplay(media(), 'movie').posterImage).toBe(img('poster', '/poster.jpg'))
    expect(deriveMediaDisplay(media(), 'movie').heroImage).toBe(img('backdrop', '/backdrop.jpg'))
  })
})
