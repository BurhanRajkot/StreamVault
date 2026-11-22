/**
 * The F1 archive: every season's calendar, and for each race weekend the
 * releases people share, sorted into its sessions.
 *
 * - Calendars come from Jolpica (api.jolpi.ca), the Ergast API's successor:
 *   free, keyless, every season since 1950, with session times since 2005-ish
 *   and race winners.
 * - Releases come from apibay, searched by the Grand Prix's names and its
 *   round number, then read by lib/f1Names: which race each one is, which
 *   sessions it holds. Torrentio can't help — it finds releases by IMDb id,
 *   and races have none.
 *
 * Nothing here touches Real-Debrid: like GET /releases, it only reads public
 * indexes. The Premium player plays a release through /debrid/play, passing
 * the session so the right file is picked out of a weekend pack.
 */

import * as cache from '../services/cache'
import { logger } from './logger'
import { searchApibay, type ApibayResult, type DebridRelease } from './debrid'
import { F1_SESSIONS, matchRace, readF1Release, searchNames, type F1Session } from './f1Names'

const JOLPICA_BASE = process.env.JOLPICA_BASE_URL || 'https://api.jolpi.ca/ergast/f1'

/** The first world championship season. */
export const FIRST_F1_SEASON = 1950

export interface F1SessionSlot {
  key: F1Session
  /** YYYY-MM-DD, when the calendar gives it. */
  date: string | null
  /** HH:MM:SSZ (UTC), when the calendar gives it. */
  time: string | null
}

export interface F1Race {
  round: number
  /** "Abu Dhabi Grand Prix" */
  name: string
  /** "Yas Marina Circuit" */
  circuit: string
  locality: string
  country: string
  /** Race day, YYYY-MM-DD. */
  date: string
  time: string | null
  /** The weekend's sessions, in the order they ran. */
  sessions: F1SessionSlot[]
  /**
   * False for older seasons, whose calendar doesn't list the sessions: the
   * list is then a guess (qualifying and the race), and releases of other
   * sessions are kept rather than dropped.
   */
  sessionsListed: boolean
  /** Who won — null until the race is run (or when results weren't available). */
  winner: { driver: string; team: string } | null
}

export interface F1Season {
  year: number
  races: F1Race[]
}

/** A release of one race weekend, with the sessions it holds. */
export interface F1Release extends DebridRelease {
  sessions: F1Session[]
  /** It holds several sessions (a "Qualifying + Race" torrent, a weekend pack): one file is picked out of it. */
  pack: boolean
}

// ---------------------------------------------------------------------------
// Calendars (Jolpica)
// ---------------------------------------------------------------------------

interface JolpicaSession {
  date?: string
  time?: string
}

interface JolpicaRace {
  season: string
  round: string
  raceName: string
  date: string
  time?: string
  Circuit: { circuitName: string; Location: { locality: string; country: string } }
  FirstPractice?: JolpicaSession
  SecondPractice?: JolpicaSession
  ThirdPractice?: JolpicaSession
  Qualifying?: JolpicaSession
  Sprint?: JolpicaSession
  SprintQualifying?: JolpicaSession
  /** 2023's name for sprint qualifying. */
  SprintShootout?: JolpicaSession
  Results?: Array<{ Driver?: { givenName?: string; familyName?: string }; Constructor?: { name?: string } }>
}

interface JolpicaRaceTable {
  MRData?: { RaceTable?: { Races?: JolpicaRace[] } }
}

const SESSION_FIELDS: Array<[keyof JolpicaRace, F1Session]> = [
  ['FirstPractice', 'fp1'],
  ['SecondPractice', 'fp2'],
  ['ThirdPractice', 'fp3'],
  ['SprintQualifying', 'sprint-qualifying'],
  ['SprintShootout', 'sprint-qualifying'],
  ['Sprint', 'sprint'],
  ['Qualifying', 'qualifying'],
]

/** When the calendar names no sessions (older seasons): what's usually there to watch. */
const ASSUMED_SESSIONS: F1Session[] = ['qualifying']

async function jolpica(path: string): Promise<JolpicaRace[]> {
  const res = await fetch(`${JOLPICA_BASE}${path}`, {
    headers: { 'User-Agent': 'StreamVault/1.0', Accept: 'application/json' },
    signal: AbortSignal.timeout(10_000),
  })
  if (!res.ok) throw new Error(`Jolpica ${path} answered ${res.status}`)
  const body = (await res.json()) as JolpicaRaceTable
  return body.MRData?.RaceTable?.Races ?? []
}

/** A race's sessions in the order they ran: by start time when the calendar gives every one, else the usual order. */
export function sessionSlots(race: JolpicaRace): { sessions: F1SessionSlot[]; listed: boolean } {
  const slots: F1SessionSlot[] = []
  for (const [field, key] of SESSION_FIELDS) {
    const session = race[field] as JolpicaSession | undefined
    if (!session || slots.some((s) => s.key === key)) continue
    slots.push({ key, date: session.date ?? null, time: session.time ?? null })
  }
  const listed = slots.length > 0
  if (!listed) slots.push(...ASSUMED_SESSIONS.map((key) => ({ key, date: null, time: null })))
  slots.push({ key: 'race', date: race.date ?? null, time: race.time ?? null })

  const at = (s: F1SessionSlot) => (s.date ? `${s.date}T${s.time ?? '12:00:00Z'}` : null)
  const timed = slots.every((s) => at(s) !== null)
  slots.sort((a, b) =>
    timed ? (at(a) as string).localeCompare(at(b) as string) : F1_SESSIONS.indexOf(a.key) - F1_SESSIONS.indexOf(b.key)
  )
  return { sessions: slots, listed }
}

function toRace(race: JolpicaRace, winners: Map<number, F1Race['winner']>): F1Race {
  const round = Number(race.round)
  const { sessions, listed } = sessionSlots(race)
  return {
    round,
    name: race.raceName,
    circuit: race.Circuit?.circuitName ?? '',
    locality: race.Circuit?.Location?.locality ?? '',
    country: race.Circuit?.Location?.country ?? '',
    date: race.date,
    time: race.time ?? null,
    sessions,
    sessionsListed: listed,
    winner: winners.get(round) ?? null,
  }
}

function winnerOf(race: JolpicaRace): F1Race['winner'] {
  const first = race.Results?.[0]
  const driver = [first?.Driver?.givenName, first?.Driver?.familyName].filter(Boolean).join(' ')
  return driver ? { driver, team: first?.Constructor?.name ?? '' } : null
}

/** The season under way (or the one just finished, until the next starts): this year, in UTC. */
export function currentSeasonYear(now = new Date()): number {
  return now.getUTCFullYear()
}

/** Whether `year` is a season the archive can have: 1950 up to next year's (its calendar comes out in the autumn). */
export function isSeasonYear(year: number, now = new Date()): boolean {
  return Number.isInteger(year) && year >= FIRST_F1_SEASON && year <= currentSeasonYear(now) + 1
}

const SEASON_DONE_TTL_S = 7 * 24 * 60 * 60
const SEASON_LIVE_TTL_S = 60 * 60

const inflightSeasons = new Map<number, Promise<F1Season>>()

/**
 * A season's calendar with its sessions and winners. Cached a week once the
 * season is over, an hour while it runs. Winners are a nicety: when they
 * can't be fetched the calendar comes back without them.
 */
export async function getSeason(year: number): Promise<F1Season> {
  const key = `season:${year}`
  const hit = await cache.f1.get<F1Season>(key)
  if (hit) return hit

  const inflight = inflightSeasons.get(year)
  if (inflight) return inflight

  const load = (async () => {
    const [races, results] = await Promise.all([
      jolpica(`/${year}/races.json?limit=100`),
      jolpica(`/${year}/results/1.json?limit=100`).catch((err: unknown) => {
        logger.warn('F1 winners unavailable', { year, error: err instanceof Error ? err.message : String(err) })
        return [] as JolpicaRace[]
      }),
    ])
    const winners = new Map(results.map((r) => [Number(r.round), winnerOf(r)] as const))
    const season: F1Season = { year, races: races.map((r) => toRace(r, winners)).sort((a, b) => a.round - b.round) }
    const done = year < currentSeasonYear()
    // An empty calendar is likelier a hiccup (or next year's not out yet) than final: keep it briefly
    const ttl = season.races.length === 0 ? 10 * 60 : done ? SEASON_DONE_TTL_S : SEASON_LIVE_TTL_S
    await cache.f1.set(key, season, ttl)
    return season
  })().finally(() => inflightSeasons.delete(year))

  inflightSeasons.set(year, load)
  return load
}

// ---------------------------------------------------------------------------
// Releases (apibay)
// ---------------------------------------------------------------------------

/**
 * Smaller than this is a clip, a sample or a short show — a session in
 * standard definition is ~700 MB.
 */
const MIN_RELEASE_BYTES = 300 * 1024 ** 2

/** apibay queries asked at once for one race: it answers each in ~1s, and doesn't need hammering. */
const QUERY_CONCURRENCY = 3

const RELEASES_TTL_S = 60 * 60
const NO_RELEASES_TTL_S = 15 * 60

/**
 * What to ask apibay to find one race's releases. Its search matches whole
 * words, and release groups spell the race every way there is — "Formula1
 * 2021 Abu Dhabi…", "Formula 1 2015 Brazil…", "F1.2026.R18…",
 * "Formula.1.2023.Round.04.AzerbaijanGP…" — so it's asked by each of the
 * Grand Prix's names with each spelling of "Formula 1", and by round number.
 */
export function raceQueries(year: number, race: Pick<F1Race, 'round' | 'name' | 'country' | 'locality'>): string[] {
  const queries = new Set<string>()
  for (const name of searchNames(race).slice(0, 3)) {
    for (const prefix of ['formula1', 'formula 1', 'f1']) queries.add(`${prefix} ${year} ${name}`)
  }
  const round = String(race.round).padStart(2, '0')
  queries.add(`formula 1 ${year} round ${round}`)
  queries.add(`formula1 ${year} round ${round}`)
  queries.add(`f1 ${year} r${round}`)
  return [...queries]
}

/** Run `tasks` with at most `limit` in flight; a failed one gives `fallback`. */
async function pooled<T>(tasks: Array<() => Promise<T>>, limit: number, fallback: (err: unknown, i: number) => T): Promise<T[]> {
  const results: T[] = new Array(tasks.length)
  let next = 0
  const worker = async () => {
    while (next < tasks.length) {
      const i = next++
      try {
        results[i] = await tasks[i]()
      } catch (err: unknown) {
        results[i] = fallback(err, i)
      }
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, tasks.length) }, worker))
  return results
}

/**
 * The releases out of `rows` that are `race`'s, each with the sessions it
 * holds — the sessions that weekend had, when its calendar lists them.
 * Pure, for testing.
 */
export function sortIntoRace(rows: readonly ApibayResult[], year: number, race: F1Race, season: readonly F1Race[]): F1Release[] {
  const listed = race.sessionsListed ? new Set(race.sessions.map((s) => s.key)) : null
  const seen = new Set<string>()
  const releases: F1Release[] = []
  for (const row of rows) {
    const hash = row.info_hash?.toUpperCase()
    if (!hash || !/^[0-9A-F]{40}$/.test(hash) || seen.has(hash)) continue
    // Video categories only (2xx): not games, music or e-books that share the words
    if (!String(row.category).startsWith('2')) continue
    const size = Number(row.size)
    if (!(size >= MIN_RELEASE_BYTES)) continue
    const read = readF1Release(row.name, year, size)
    if (!read) continue
    if (matchRace(row.name, season)?.round !== race.round) continue
    const sessions = listed ? read.sessions.filter((s) => listed.has(s)) : read.sessions
    if (sessions.length === 0) continue
    seen.add(hash)
    releases.push({
      id: row.id,
      name: row.name,
      info_hash: hash,
      seeders: row.seeders,
      leechers: row.leechers,
      size: row.size,
      num_files: row.num_files,
      username: row.username,
      added: row.added,
      category: row.category,
      cached: false,
      sessions,
      pack: read.pack,
    })
  }
  return releases.sort((a, b) => (Number(b.seeders) || 0) - (Number(a.seeders) || 0))
}

const inflightReleases = new Map<string, Promise<F1Release[]>>()

/**
 * Every release of one race weekend that people share, most-shared first,
 * each with the sessions it holds — or null when the season has no such
 * round. Cached an hour (a quarter of an hour when nothing turned up, which
 * is likelier to change).
 */
export async function findRaceReleases(year: number, round: number): Promise<F1Release[] | null> {
  const season = await getSeason(year)
  const race = season.races.find((r) => r.round === round)
  if (!race) return null

  const key = `releases:${year}:${round}`
  const hit = await cache.f1.get<F1Release[]>(key)
  if (hit) return hit

  const inflight = inflightReleases.get(key)
  if (inflight) return inflight

  const load = (async () => {
    const queries = raceQueries(year, race)
    let failures = 0
    const pages = await pooled(
      queries.map((q) => () => searchApibay(q)),
      QUERY_CONCURRENCY,
      (err, i) => {
        failures++
        logger.warn('F1 release search failed', { query: queries[i], error: err instanceof Error ? err.message : String(err) })
        return []
      }
    )
    // Every query failed: apibay is down — say so rather than cache "nothing shared"
    if (failures === queries.length) throw new Error('Release index unavailable')
    const releases = sortIntoRace(pages.flat(), year, race, season.races)
    await cache.f1.set(key, releases, releases.length > 0 ? RELEASES_TTL_S : NO_RELEASES_TTL_S)
    return releases
  })().finally(() => inflightReleases.delete(key))

  inflightReleases.set(key, load)
  return load
}
