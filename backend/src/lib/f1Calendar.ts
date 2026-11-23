/**
 * Where an F1 season's calendar comes from when it isn't Jolpica (lib/f1's
 * live source), so the archive never hangs on one site:
 *
 * - The bundled snapshot (lib/f1Snapshot, built from f1db by
 *   scripts/f1-snapshot.ts): every season up to when it was built, with
 *   sessions and winners. A finished season comes from it outright — it
 *   can't change — and the season under way falls back on it.
 * - OpenF1 (api.openf1.org, keyless, 2023 on): winners of races run since
 *   the snapshot was built, and the calendar of a season the snapshot doesn't
 *   have yet. Its meeting list keeps cancelled Grands Prix (2026's Bahrain and
 *   Saudi Arabian), so it's never preferred to a calendar that has the race.
 */

import { logger } from './logger'
import { F1_SNAPSHOT_JSON } from './f1Snapshot'
import { toRace, type F1Race, type JolpicaRace } from './f1'

const OPENF1_BASE = process.env.OPENF1_BASE_URL || 'https://api.openf1.org/v1'
const OPENF1_TIMEOUT_MS = 6000

// ---------------------------------------------------------------------------
// The snapshot
// ---------------------------------------------------------------------------

let snapshot: Record<string, F1Race[]> | null = null

/** A season's races from the bundled snapshot — null when it was built before the season's calendar was out. */
export function snapshotSeason(year: number): F1Race[] | null {
  snapshot ??= (JSON.parse(F1_SNAPSHOT_JSON) as { seasons: Record<string, F1Race[]> }).seasons
  const races = snapshot[String(year)]
  // A copy each time: callers fill in winners
  return races ? races.map((r) => ({ ...r })) : null
}

/** Every race in it has a winner: the season was over when the snapshot was built. */
export function isComplete(races: readonly F1Race[]): boolean {
  return races.length > 0 && races.every((r) => r.winner !== null)
}

// ---------------------------------------------------------------------------
// OpenF1
// ---------------------------------------------------------------------------

interface OpenF1Meeting {
  meeting_key: number
  meeting_name: string
  location: string
  country_name: string
  circuit_short_name: string
  date_start: string
}

interface OpenF1Session {
  session_key: number
  session_name: string
  date_start: string
  meeting_key: number
  location: string
}

interface OpenF1Result {
  session_key: number
  driver_number: number
  position: number | null
}

interface OpenF1Driver {
  session_key: number
  driver_number: number
  first_name: string | null
  last_name: string | null
  full_name: string | null
  team_name: string | null
}

async function openF1<T>(path: string): Promise<T[]> {
  const res = await fetch(`${OPENF1_BASE}${path}`, {
    headers: { 'User-Agent': 'StreamVault/1.0', Accept: 'application/json' },
    signal: AbortSignal.timeout(OPENF1_TIMEOUT_MS),
  })
  // "No results found." comes as a 404
  if (res.status === 404) return []
  if (!res.ok) throw new Error(`OpenF1 ${path.split('?')[0]} answered ${res.status}`)
  const body = (await res.json()) as unknown
  return Array.isArray(body) ? (body as T[]) : []
}

/** OpenF1 has no seasons before this. */
const OPENF1_FIRST_SEASON = 2023

/** "2026-11-22T04:00:00+00:00" → { date: "2026-11-22", time: "04:00:00Z" } */
function at(iso: string): { date: string; time: string } {
  const d = new Date(iso)
  return { date: d.toISOString().slice(0, 10), time: `${d.toISOString().slice(11, 19)}Z` }
}

/** The day a race ran, from OpenF1's start time — the calendar's date (local to the track) may be a day either side in UTC. */
function sameRaceDay(raceDate: string, iso: string): boolean {
  return Math.abs(Date.parse(`${raceDate}T12:00:00Z`) - Date.parse(iso)) < 36 * 60 * 60 * 1000
}

/**
 * The winner of each race session, by session key — two requests for the
 * whole season, one after the other: OpenF1 answers 429 to a few at once.
 */
async function raceWinners(raceSessions: readonly OpenF1Session[]): Promise<Map<number, F1Race['winner']>> {
  const winners = new Map<number, F1Race['winner']>()
  if (raceSessions.length === 0) return winners
  const keys = new Set(raceSessions.map((s) => s.session_key))
  const from = Math.min(...keys)
  const results = (await openF1<OpenF1Result>(`/session_result?position=1&session_key>=${from}`)).filter((r) => keys.has(r.session_key))
  if (results.length === 0) return winners
  // Only from the first race with a result: the season's drivers list is the slow part (~2.5 s)
  const drivers = await openF1<OpenF1Driver>(`/drivers?session_key>=${Math.min(...results.map((r) => r.session_key))}`)
  for (const r of results) {
    if (!keys.has(r.session_key) || winners.has(r.session_key)) continue
    const d = drivers.find((x) => x.session_key === r.session_key && x.driver_number === r.driver_number)
    const name = [d?.first_name, d?.last_name].filter(Boolean).join(' ') || d?.full_name
    if (name) winners.set(r.session_key, { driver: name, team: d?.team_name ?? '' })
  }
  return winners
}

/**
 * Fill in the winners of races run since `races` were written down (the
 * snapshot is built every so often) from OpenF1. Best-effort: on any
 * failure the races come back as they were.
 */
export async function fillWinners(year: number, races: F1Race[], now = Date.now()): Promise<F1Race[]> {
  const missing = races.filter((r) => !r.winner && Date.parse(`${r.date}T${r.time ?? '23:59:59Z'}`) + 3 * 60 * 60 * 1000 < now)
  if (missing.length === 0 || year < OPENF1_FIRST_SEASON) return races
  try {
    const sessions = await openF1<OpenF1Session>(`/sessions?year=${year}&session_name=Race`)
    const winners = await raceWinners(sessions)
    for (const race of missing) {
      const session = sessions.find((s) => sameRaceDay(race.date, s.date_start))
      if (session) race.winner = winners.get(session.session_key) ?? null
    }
  } catch (err: unknown) {
    logger.warn('F1 winners from OpenF1 unavailable', { year, error: err instanceof Error ? err.message : String(err) })
  }
  return races
}

const OPENF1_SESSION_FIELDS: Record<string, keyof JolpicaRace> = {
  'Practice 1': 'FirstPractice',
  'Practice 2': 'SecondPractice',
  'Practice 3': 'ThirdPractice',
  'Sprint Shootout': 'SprintShootout',
  'Sprint Qualifying': 'SprintQualifying',
  Sprint: 'Sprint',
  Qualifying: 'Qualifying',
}

/** Jolpica's names for the countries OpenF1 spells out. */
const COUNTRY_NAMES: Record<string, string> = {
  'United Kingdom': 'UK',
  'Great Britain': 'UK',
  'United States': 'USA',
  'United Arab Emirates': 'UAE',
}

/**
 * A season's calendar from OpenF1 — for a season the snapshot doesn't have,
 * while Jolpica is down. Testing is left out, and so is a meeting whose race
 * day has passed without a result (it was cancelled) — when results could be
 * had at all; rounds are counted over what's left. Null when OpenF1 has
 * nothing for the year.
 */
export async function openF1Season(year: number, now = Date.now()): Promise<F1Race[] | null> {
  if (year < OPENF1_FIRST_SEASON) return null
  const meetings = await openF1<OpenF1Meeting>(`/meetings?year=${year}`)
  if (meetings.length === 0) return null
  const sessions = await openF1<OpenF1Session>(`/sessions?year=${year}`)
  const raceSessions = sessions.filter((s) => s.session_name === 'Race')
  const winners = await raceWinners(raceSessions).catch((err: unknown) => {
    logger.warn('F1 winners from OpenF1 unavailable', { year, error: err instanceof Error ? err.message : String(err) })
    return null
  })

  const races: F1Race[] = []
  for (const meeting of [...meetings].sort((a, b) => a.date_start.localeCompare(b.date_start))) {
    const race = raceSessions.find((s) => s.meeting_key === meeting.meeting_key)
    if (!race || /testing/i.test(meeting.meeting_name)) continue
    const run = Date.parse(race.date_start) + 3 * 60 * 60 * 1000 < now
    const winner = winners?.get(race.session_key) ?? null
    if (run && winners && !winner) continue

    const raceAt = at(race.date_start)
    const row: JolpicaRace = {
      season: String(year),
      round: String(races.length + 1),
      raceName: meeting.meeting_name,
      date: raceAt.date,
      time: raceAt.time,
      Circuit: {
        circuitName: meeting.circuit_short_name,
        Location: { locality: meeting.location, country: COUNTRY_NAMES[meeting.country_name] ?? meeting.country_name },
      },
    }
    for (const s of sessions) {
      const field = s.meeting_key === meeting.meeting_key ? OPENF1_SESSION_FIELDS[s.session_name] : undefined
      if (field) (row as unknown as Record<string, unknown>)[field] = at(s.date_start)
    }
    races.push(toRace(row, new Map([[races.length + 1, winner]])))
  }
  return races.length > 0 ? races : null
}
