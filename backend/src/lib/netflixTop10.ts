import { logger } from './logger'

/**
 * Netflix's own weekly Top 10 per country — the one public source of what a
 * country is actually watching (TMDB's popularity is global, and led by
 * decades-old syndicated shows). Netflix publishes every week for every
 * country as one TSV, sorted by country, newest week first within each.
 */
const TOP10_URL = 'https://www.netflix.com/tudum/top10/data/all-weeks-countries.tsv'
/** Netflix updates on Tuesdays; half a day keeps it fresh without refetching a 30 MB file often. */
const CACHE_MS = 12 * 60 * 60 * 1000
const FETCH_TIMEOUT_MS = 90_000

export interface Top10Entry {
  rank: number
  title: string
  season?: string
}

export interface CountryTop10 {
  week: string
  movie: Top10Entry[]
  tv: Top10Entry[]
}

/**
 * The newest week's lists for one country, from TSV lines
 * (country_name, country_iso2, week, category, weekly_rank, show_title,
 * season_title, cumulative_weeks_in_top_10). Returns null when the country
 * isn't there.
 */
export function parseTop10Lines(lines: Iterable<string>, iso2: string): CountryTop10 | null {
  let week = ''
  const movie: Top10Entry[] = []
  const tv: Top10Entry[] = []
  for (const line of lines) {
    const cols = line.split('\t')
    if (cols.length < 6 || cols[1] !== iso2) continue
    const [, , rowWeek, category, rank, title, season] = cols
    if (rowWeek > week) {
      week = rowWeek
      movie.length = 0
      tv.length = 0
    }
    if (rowWeek !== week) continue
    const entry: Top10Entry = { rank: Number(rank), title, ...(season && season !== 'N/A' ? { season } : {}) }
    if (category.startsWith('Film')) movie.push(entry)
    else if (category.startsWith('TV')) tv.push(entry)
  }
  if (!week) return null
  const byRank = (a: Top10Entry, b: Top10Entry) => a.rank - b.rank
  return { week, movie: movie.sort(byRank), tv: tv.sort(byRank) }
}

/**
 * Reads the TSV as it downloads and stops once past the country's block, so
 * a country early in the alphabet costs a fraction of the file.
 */
async function downloadCountry(iso2: string): Promise<CountryTop10 | null> {
  const res = await fetch(TOP10_URL, { signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) })
  if (!res.ok || !res.body) throw new Error(`Netflix Top 10 download failed: ${res.status}`)
  const reader = res.body.getReader()
  const decoder = new TextDecoder()
  const rows: string[] = []
  let buffered = ''
  let inBlock = false
  let done = false
  try {
    while (!done) {
      const chunk = await reader.read()
      if (chunk.done) break
      buffered += decoder.decode(chunk.value, { stream: true })
      const lines = buffered.split('\n')
      buffered = lines.pop() ?? ''
      for (const line of lines) {
        const isCountry = line.split('\t', 2)[1] === iso2
        if (isCountry) {
          inBlock = true
          rows.push(line)
        } else if (inBlock) {
          done = true
          break
        }
      }
    }
    if (!done && buffered && buffered.split('\t', 2)[1] === iso2) rows.push(buffered)
  } finally {
    reader.cancel().catch(() => {})
  }
  return parseTop10Lines(rows, iso2)
}

const cache = new Map<string, { at: number; value: CountryTop10 | null }>()
const inFlight = new Map<string, Promise<CountryTop10 | null>>()

async function countryTop10(iso2: string): Promise<CountryTop10 | null> {
  const hit = cache.get(iso2)
  if (hit && Date.now() - hit.at < CACHE_MS) return hit.value
  const pending = inFlight.get(iso2)
  if (pending) return pending
  const job = downloadCountry(iso2)
    .then((value) => {
      cache.set(iso2, { at: Date.now(), value })
      return value
    })
    .catch((error: unknown) => {
      // Serve last week's list rather than nothing when Netflix is unreachable
      if (hit) {
        logger.warn('Netflix Top 10 refresh failed, serving the cached list', { error: error instanceof Error ? error.message : String(error) })
        return hit.value
      }
      throw error
    })
    .finally(() => inFlight.delete(iso2))
  inFlight.set(iso2, job)
  return job
}

/** Downloads a country's lists into the cache in the background; failures only log. */
export function warmNetflixTop10(iso2: string): void {
  countryTop10(iso2)
    .then(() => logger.info('Netflix Top 10 pre-warmed', { country: iso2 }))
    .catch((error: unknown) => logger.warn('Netflix Top 10 warm-up failed (non-critical)', { error: error instanceof Error ? error.message : String(error) }))
}

interface TmdbHit {
  id: number
  title?: string
  name?: string
  original_title?: string
  original_name?: string
  poster_path?: string | null
  popularity?: number
  release_date?: string
  first_air_date?: string
}

function norm(s: string): string {
  return s.toLowerCase().replace(/&/g, ' and ').normalize('NFKD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, ' ').trim()
}

/**
 * The TMDB title a Top 10 name refers to: an exact title match, the most
 * popular among several (Netflix lists the current "Lupin", not a 1970s one).
 * Nothing when no title matches — WWE events and the like have no TMDB entry.
 */
export function pickTmdbMatch(name: string, hits: TmdbHit[]): TmdbHit | null {
  const named = (want: string) =>
    hits.filter((h) => [h.title, h.name, h.original_title, h.original_name].some((t) => t && norm(t) === want))
  let exact = named(norm(name))
  // "Akka: The Protectors" is "Akka" on TMDB — but only trust the short name for a recent title
  if (exact.length === 0 && name.includes(':')) {
    const recent = new Date(Date.now() - 2 * 365 * 86_400_000).toISOString().slice(0, 10)
    exact = named(norm(name.split(':')[0])).filter((h) => (h.release_date || h.first_air_date || '') >= recent)
  }
  const withArt = exact.filter((h) => h.poster_path)
  const pool = withArt.length > 0 ? withArt : exact
  return pool.sort((a, b) => (b.popularity ?? 0) - (a.popularity ?? 0))[0] ?? null
}

const LIVE_EVENT = /\b(January|February|March|April|May|June|July|August|September|October|November|December) \d{1,2}, \d{4}\b/

export interface Top10Result {
  country: string
  week: string
  category: 'movie' | 'tv'
  results: Array<TmdbHit & { media_type: 'movie' | 'tv'; rank: number }>
}

/**
 * This week's Top 10 for a country and category, each entry matched to its
 * TMDB title (unmatched entries are dropped, the rest keep Netflix's order).
 */
export async function getNetflixTop10(
  iso2: string,
  category: 'movie' | 'tv',
  fetchTmdb: (endpoint: string) => Promise<unknown>,
): Promise<Top10Result | null> {
  const lists = await countryTop10(iso2)
  if (!lists) return null
  const entries = category === 'movie' ? lists.movie : lists.tv
  const matched = await Promise.all(
    entries.map(async (entry) => {
      // A dated "season" is a live broadcast (WWE Raw, a match) — nothing to stream later
      if (entry.season && LIVE_EVENT.test(entry.season)) return null
      const query = entry.title
      const data = (await fetchTmdb(`/search/${category}?${new URLSearchParams({ query: query.includes(':') ? query.split(':')[0] : query, page: '1' })}`)) as { results?: TmdbHit[] }
      const hit = pickTmdbMatch(entry.title, data?.results ?? [])
      return hit ? { ...hit, media_type: category, rank: entry.rank } : null
    })
  )
  return {
    country: iso2,
    week: lists.week,
    category,
    results: matched.filter((m): m is NonNullable<typeof m> => m !== null),
  }
}
