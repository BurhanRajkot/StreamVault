import type { Media } from '@/lib/config'
import { NOT_SERIES, fetchDiscover, monthsAgo, today, yearsAgo } from './catalog'

/*
 * Home, past the fixed rows: a feed that keeps going.
 *
 * "Because you watched X" six times over is one idea repeated. Below the
 * fixed rows, Home goes on with different ideas, a few rows at a time as
 * the viewer scrolls: the people behind what they watched ("Because you
 * like Christopher Nolan"), the series it belongs to (The Dark Knight
 * Collection), where it's from and what kind of story it is ("Indian Crime
 * Series"), then themes, places and eras (New in India, Heists, ’90s
 * Classics). Personal rows and the rest take turns; the rest come in a
 * different order each day. When every idea has had its row, they come
 * round again with their next page.
 */

const API_BASE = import.meta.env.VITE_API_URL

export interface FeedRowSpec {
  key: string
  title: string
  kind?: 'movie' | 'tv'
  style?: 'wide'
  /** A TMDB discover query — its next pages fill the row when it comes round again. */
  discover?: { type: 'movie' | 'tv'; filters: Record<string, string> }
  /** Or a loader of its own (a film series' parts). */
  load?: () => Promise<Media[]>
  /**
   * A film series: shown whole, the parts already watched or shown above
   * included, from two parts up — "The Dark Knight Collection" without The
   * Dark Knight isn't the series.
   */
  whole?: boolean
}

/** A row's titles. */
export function loadFeedRow(spec: FeedRowSpec): Promise<Media[]> {
  if (spec.discover) return fetchDiscover(spec.discover.type, spec.discover.filters)
  return spec.load ? spec.load() : Promise.resolve([])
}

/** A title the viewer watched or saved, with its details (credits, collection, countries). */
export interface TasteTitle {
  kind: 'movie' | 'tv'
  media: Media
}

/** One page of a film series' parts, oldest first. */
async function fetchCollection(id: number): Promise<Media[]> {
  const res = await fetch(`${API_BASE}/tmdb/collection/${id}`)
  if (!res.ok) return []
  const data = (await res.json()) as { parts?: Media[] }
  return (data.parts ?? [])
    .filter((m) => m.poster_path && (m.release_date ?? '') <= today())
    .sort((a, b) => (a.release_date ?? '').localeCompare(b.release_date ?? ''))
    .map((m) => ({ ...m, media_type: 'movie' }))
}

// ---------------------------------------------------------------------------
// From what the viewer watched
// ---------------------------------------------------------------------------

const REGIONS: Record<string, string> = {
  IN: 'Indian',
  KR: 'Korean',
  JP: 'Japanese',
  ES: 'Spanish',
  GB: 'British',
  FR: 'French',
  DE: 'German',
  TR: 'Turkish',
  MX: 'Mexican',
  CN: 'Chinese',
}

/** Indian languages: a Tamil film says India even when TMDB lists no country. */
const INDIAN_LANGUAGES = new Set(['hi', 'ta', 'te', 'ml', 'kn', 'bn', 'mr', 'pa'])

function regionOf(media: Media): string | null {
  const countries = [...(media.origin_country ?? []), ...(media.production_countries ?? []).map((c) => c.iso_3166_1)]
  if (INDIAN_LANGUAGES.has(media.original_language ?? '') || countries[0] === 'IN') return 'IN'
  if (media.original_language === 'en') return null
  return countries.find((c) => REGIONS[c]) ?? null
}

/** How a genre reads in a row's name: "Crime", "Sci-Fi & Fantasy". */
const GENRE_WORDS: Record<number, string> = {
  28: 'Action', 12: 'Adventure', 35: 'Comedy', 80: 'Crime', 18: 'Drama', 10751: 'Family', 14: 'Fantasy', 36: 'Historical',
  27: 'Horror', 10402: 'Music', 9648: 'Mystery', 10749: 'Romance', 878: 'Sci-Fi', 53: 'Thriller', 10752: 'War', 37: 'Western',
  10759: 'Action', 10765: 'Sci-Fi & Fantasy', 10768: 'War & Politics',
}

/** The genre that says most about a title: anything before Drama, which half of everything is. */
function mainGenre(media: Media): number | null {
  const ids = (media.genres ?? []).map((g) => g.id).filter((id) => GENRE_WORDS[id])
  return ids.find((id) => id !== 18) ?? ids[0] ?? null
}

/**
 * Rows from the titles the viewer watched or saved, most recent first: who
 * made it, who's in it, the series it's part of, where it's from. Each kind
 * takes its turn, so three directors never stand in a row.
 */
export function personalFeedRows(titles: TasteTitle[]): FeedRowSpec[] {
  const directors: FeedRowSpec[] = []
  const franchises: FeedRowSpec[] = []
  const actors: FeedRowSpec[] = []
  const places: FeedRowSpec[] = []
  const people = new Set<number>()
  const collections = new Set<number>()
  const placeKeys = new Set<string>()

  for (const { kind, media } of titles) {
    if (kind === 'movie') {
      const collection = media.belongs_to_collection
      if (collection && !collections.has(collection.id)) {
        collections.add(collection.id)
        franchises.push({
          key: `collection:${collection.id}`,
          title: collection.name,
          kind: 'movie',
          style: 'wide',
          whole: true,
          load: () => fetchCollection(collection.id),
        })
      }
      const director = media.credits?.crew.find((c) => c.job === 'Director')
      if (director && !people.has(director.id)) {
        people.add(director.id)
        directors.push({
          key: `director:${director.id}`,
          title: `Because you like ${director.name}`,
          kind: 'movie',
          discover: { type: 'movie', filters: { with_crew: String(director.id), sort_by: 'vote_count.desc', 'vote_count.gte': '20' } },
        })
      }
      const lead = media.credits?.cast[0]
      if (lead && !people.has(lead.id)) {
        people.add(lead.id)
        actors.push({
          key: `cast:${lead.id}`,
          title: `Starring ${lead.name}`,
          kind: 'movie',
          discover: { type: 'movie', filters: { with_cast: String(lead.id), sort_by: 'vote_count.desc', 'vote_count.gte': '50' } },
        })
      }
    }

    const region = regionOf(media)
    const genre = mainGenre(media)
    const placeKey = `${region}:${kind}:${genre}`
    if (region && genre && !placeKeys.has(placeKey)) {
      placeKeys.add(placeKey)
      const noun = kind === 'tv' ? 'Series' : 'Films'
      const filters: Record<string, string> = { with_genres: String(genre), sort_by: 'vote_count.desc', 'vote_count.gte': kind === 'tv' ? '20' : '50' }
      if (region === 'IN' && INDIAN_LANGUAGES.has(media.original_language ?? '')) filters.with_original_language = media.original_language ?? 'hi'
      else filters.with_origin_country = region
      if (kind === 'tv') filters.without_genres = NOT_SERIES
      const language = filters.with_original_language && filters.with_original_language !== 'hi' ? languageAdjective(filters.with_original_language) : null
      places.push({
        key: `place:${placeKey}:${filters.with_original_language ?? ''}`,
        title: `${language ?? REGIONS[region]} ${GENRE_WORDS[genre]} ${noun}`,
        kind,
        discover: { type: kind, filters },
      })
    }
  }

  return roundRobin([directors, franchises, places, actors])
}

function languageAdjective(lang: string): string | null {
  return ({ ta: 'Tamil', te: 'Telugu', ml: 'Malayalam', kn: 'Kannada', bn: 'Bengali', mr: 'Marathi', pa: 'Punjabi' } as Record<string, string>)[lang] ?? null
}

function roundRobin<T>(lists: T[][]): T[] {
  const out: T[] = []
  for (let i = 0; lists.some((l) => i < l.length); i++) for (const l of lists) if (l[i]) out.push(l[i])
  return out
}

// ---------------------------------------------------------------------------
// For everyone
// ---------------------------------------------------------------------------

type Discover = FeedRowSpec['discover']
const movies = (filters: Record<string, string>): Discover => ({ type: 'movie', filters })
const series = (filters: Record<string, string>): Discover => ({ type: 'tv', filters: { without_genres: NOT_SERIES, ...filters } })
const theme = (keyword: number) => movies({ with_keywords: String(keyword), sort_by: 'vote_count.desc', 'vote_count.gte': '300' })

/** Rows anyone might like. New in India leads; the rest come in a new order each day. TMDB keyword ids checked 2026-11-24. */
function everyoneRows(): FeedRowSpec[] {
  const lead: FeedRowSpec = {
    key: 'new-in-india',
    title: 'New in India',
    kind: 'movie',
    style: 'wide',
    discover: movies({ with_origin_country: 'IN', 'primary_release_date.gte': monthsAgo(3), 'primary_release_date.lte': today(), 'vote_count.gte': '3' }),
  }
  const rest: FeedRowSpec[] = [
    { key: 'india-crime', title: 'Indian Crime Series', kind: 'tv', discover: series({ with_origin_country: 'IN', with_genres: '80', sort_by: 'vote_count.desc' }) },
    { key: 'prime-india', title: 'Prime Video India', kind: 'tv', discover: series({ with_watch_providers: '119', watch_region: 'IN', with_origin_country: 'IN' }) },
    { key: 'netflix-india', title: 'Netflix India', kind: 'tv', discover: series({ with_watch_providers: '8', watch_region: 'IN', with_origin_country: 'IN' }) },
    { key: 'heist', title: 'Heists', kind: 'movie', discover: theme(10051) },
    { key: 'twists', title: 'Twist Endings', kind: 'movie', discover: theme(275311) },
    { key: 'true-story', title: 'Based on a True Story', kind: 'movie', style: 'wide', discover: theme(9672) },
    { key: 'spy', title: 'Spy Thrillers', kind: 'movie', discover: theme(470) },
    { key: 'time-travel', title: 'Time Travel', kind: 'movie', discover: theme(4379) },
    { key: 'serial-killer', title: 'Hunting a Killer', kind: 'movie', discover: theme(10714) },
    { key: 'superhero', title: 'Superheroes', kind: 'movie', style: 'wide', discover: theme(9715) },
    { key: 'psychological', title: 'Psychological Thrillers', kind: 'movie', discover: theme(12565) },
    { key: 'survival', title: 'Survival Stories', kind: 'movie', discover: theme(10349) },
    { key: 'space', title: 'Lost in Space', kind: 'movie', discover: theme(9882) },
    { key: 'revenge', title: 'Revenge', kind: 'movie', discover: theme(9748) },
    { key: 'dystopia', title: 'Dystopian Futures', kind: 'movie', discover: theme(4565) },
    { key: 'zombies', title: 'Zombies', kind: 'movie', discover: theme(12377) },
    { key: 'sport', title: 'Sports Stories', kind: 'movie', discover: theme(6075) },
    { key: 'crime-thrillers', title: 'Crime Thrillers', kind: 'movie', discover: movies({ with_genres: '80,53', sort_by: 'vote_count.desc', 'vote_count.gte': '500', 'primary_release_date.gte': yearsAgo(15) }) },
    { key: 'korean-thrillers', title: 'Korean Thrillers', kind: 'movie', discover: movies({ with_original_language: 'ko', with_genres: '53', sort_by: 'vote_count.desc', 'vote_count.gte': '100' }) },
    { key: 'spanish-series', title: 'Spanish-Language Series', kind: 'tv', style: 'wide', discover: series({ with_original_language: 'es', sort_by: 'vote_count.desc', 'vote_count.gte': '200' }) },
    { key: 'british-crime', title: 'British Crime Dramas', kind: 'tv', discover: series({ with_origin_country: 'GB', with_genres: '80', sort_by: 'vote_count.desc', 'vote_count.gte': '100' }) },
    { key: 'nineties', title: '’90s Classics', kind: 'movie', discover: movies({ 'primary_release_date.gte': '1990-01-01', 'primary_release_date.lte': '1999-12-31', sort_by: 'vote_count.desc', 'vote_count.gte': '2000' }) },
    { key: 'noughties', title: '2000s Favourites', kind: 'movie', discover: movies({ 'primary_release_date.gte': '2000-01-01', 'primary_release_date.lte': '2009-12-31', sort_by: 'vote_count.desc', 'vote_count.gte': '3000' }) },
    { key: 'hindi-comedy', title: 'Hindi Comedies', kind: 'movie', discover: movies({ with_original_language: 'hi', with_genres: '35', sort_by: 'vote_count.desc', 'vote_count.gte': '30' }) },
    { key: 'hindi-romance', title: 'Bollywood Romance', kind: 'movie', discover: movies({ with_original_language: 'hi', with_genres: '10749', sort_by: 'vote_count.desc', 'vote_count.gte': '30' }) },
    { key: 'india-action', title: 'Indian Action Blockbusters', kind: 'movie', style: 'wide', discover: movies({ with_origin_country: 'IN', with_genres: '28', sort_by: 'vote_count.desc', 'vote_count.gte': '50', 'primary_release_date.gte': yearsAgo(8) }) },
    { key: 'war', title: 'War Movies', kind: 'movie', discover: movies({ with_genres: '10752', sort_by: 'vote_count.desc', 'vote_count.gte': '500' }) },
    { key: 'feel-good', title: 'Feel-Good Comedies', kind: 'movie', discover: movies({ with_genres: '35,10751', sort_by: 'vote_count.desc', 'vote_count.gte': '500' }) },
    { key: 'horror', title: 'Recent Horror', kind: 'movie', discover: movies({ with_genres: '27', sort_by: 'vote_count.desc', 'vote_count.gte': '300', 'primary_release_date.gte': yearsAgo(6) }) },
    { key: 'scifi-series', title: 'Sci-Fi & Fantasy Series', kind: 'tv', discover: series({ with_genres: '10765', sort_by: 'vote_count.desc', 'vote_count.gte': '500' }) },
    { key: 'mystery-series', title: 'Mystery Series', kind: 'tv', discover: series({ with_genres: '9648', sort_by: 'vote_count.desc', 'vote_count.gte': '300' }) },
    { key: 'true-crime', title: 'True Crime', kind: 'movie', discover: theme(33722) },
    { key: 'epics', title: 'Historical Epics', kind: 'movie', style: 'wide', discover: movies({ with_genres: '36', sort_by: 'vote_count.desc', 'vote_count.gte': '1000' }) },
  ]
  return [lead, ...shuffleDaily(rest)]
}

/** The same order all day, a different one tomorrow. */
function shuffleDaily<T>(items: T[]): T[] {
  let seed = Math.floor(Date.now() / 86_400_000)
  const random = () => {
    seed = (seed * 1_103_515_245 + 12_345) % 2_147_483_648
    return seed / 2_147_483_648
  }
  const out = [...items]
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1))
    ;[out[i], out[j]] = [out[j], out[i]]
  }
  return out
}

// ---------------------------------------------------------------------------
// The feed
// ---------------------------------------------------------------------------

/** How many times the ideas come round, each time with their next page. */
const ROUNDS = 3

/** Personal rows and everyone's, taking turns — then all of them again, a page further on. */
export function discoveryFeed(titles: TasteTitle[]): FeedRowSpec[] {
  const personal = personalFeedRows(titles)
  const everyone = everyoneRows()
  const first: FeedRowSpec[] = []
  for (let i = 0; i < Math.max(personal.length, everyone.length); i++) {
    if (personal[i]) first.push(personal[i])
    if (everyone[i]) first.push(everyone[i])
  }
  const feed = [...first]
  for (let round = 1; round < ROUNDS; round++) {
    const page = String(round + 1)
    for (const spec of first) {
      // A film series is one list: it doesn't come round again
      if (!spec.discover) continue
      feed.push({
        ...spec,
        key: `${spec.key}:p${page}`,
        title: moreOf(spec.title),
        discover: { ...spec.discover, filters: { ...spec.discover.filters, page } },
      })
    }
  }
  return feed
}

/** "More from Christopher Nolan", "More with Cillian Murphy", "More Heists". */
function moreOf(title: string): string {
  if (title.startsWith('Because you like ')) return `More from ${title.slice('Because you like '.length)}`
  if (title.startsWith('Starring ')) return `More with ${title.slice('Starring '.length)}`
  return `More ${title}`
}
