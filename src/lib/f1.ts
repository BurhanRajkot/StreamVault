/**
 * The F1 archive, for the website and the app: the backend's /f1 API
 * (backend/src/routes/f1.ts — season calendars from Jolpica, each race
 * weekend's releases sorted into its sessions), what the UI calls things,
 * and what the Premium player needs to play one session.
 *
 * Releases are public (apibay), like the Download sheet's; playing one is
 * Premium (Real-Debrid), so it follows Premium's rules — the admin and
 * approved accounts, in the app.
 */

import type { QueryClient } from '@tanstack/react-query'
import type { PremiumReason } from './api'
import type { DebridRelease } from './debridApi'
import type { PremiumReleaseSource } from './premiumSearch'

const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:4000'

/** Mirrors backend/src/lib/f1Names.ts. */
export const F1_SESSIONS = ['fp1', 'fp2', 'fp3', 'sprint-qualifying', 'sprint', 'qualifying', 'race'] as const
export type F1Session = (typeof F1_SESSIONS)[number]

export function isF1Session(value: unknown): value is F1Session {
  return typeof value === 'string' && (F1_SESSIONS as readonly string[]).includes(value)
}

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
  name: string
  circuit: string
  locality: string
  country: string
  /** Race day, YYYY-MM-DD. */
  date: string
  time: string | null
  sessions: F1SessionSlot[]
  /** False for older seasons, whose calendar doesn't list the sessions. */
  sessionsListed: boolean
  winner: { driver: string; team: string } | null
}

export interface F1Season {
  year: number
  races: F1Race[]
}

/** A release of one race weekend, with the sessions it holds. */
export interface F1Release extends DebridRelease {
  sessions: F1Session[]
  pack: boolean
}

// ---------------------------------------------------------------------------
// API
// ---------------------------------------------------------------------------

async function getJson<T>(path: string): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`)
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { error?: string }
    throw new Error(body.error || `Request failed: ${res.status}`)
  }
  return ((await res.json()) as { data: T }).data
}

export function fetchF1Season(year: number): Promise<F1Season> {
  return getJson(`/f1/seasons/${year}`)
}

export function fetchF1Releases(year: number, round: number): Promise<F1Release[]> {
  return getJson(`/f1/seasons/${year}/races/${round}/releases`)
}

/** For useQuery: a season's calendar. */
export function f1SeasonQuery(year: number) {
  return {
    queryKey: ['f1-season', year] as const,
    queryFn: () => fetchF1Season(year),
    staleTime: 15 * 60_000,
    gcTime: 60 * 60_000,
  }
}

/** For useQuery: one race weekend's releases. */
export function f1ReleasesQuery(year: number, round: number) {
  return {
    queryKey: ['f1-releases', year, round] as const,
    queryFn: () => fetchF1Releases(year, round),
    staleTime: 10 * 60_000,
    gcTime: 60 * 60_000,
    retry: 1,
  }
}

// ---------------------------------------------------------------------------
// What things are called
// ---------------------------------------------------------------------------

export function sessionLabel(key: F1Session, year: number): string {
  switch (key) {
    case 'fp1':
      return 'Practice 1'
    case 'fp2':
      return 'Practice 2'
    case 'fp3':
      return 'Practice 3'
    case 'sprint-qualifying':
      // Its name in 2023
      return year === 2023 ? 'Sprint Shootout' : 'Sprint Qualifying'
    case 'sprint':
      return 'Sprint'
    case 'qualifying':
      return 'Qualifying'
    case 'race':
      return 'Race'
  }
}

/** "Abu Dhabi GP" — for tight spots. */
export function shortRaceName(name: string): string {
  return name.replace(/\bGrand Prix\b/, 'GP')
}

/** "7 Dec 2025" — dates are the calendar's (local to the track), read as UTC so they don't shift a day. */
export function formatF1Date(date: string | null, opts: { year?: boolean } = {}): string {
  if (!date) return ''
  const d = new Date(`${date}T12:00:00Z`)
  if (Number.isNaN(d.getTime())) return ''
  return d.toLocaleDateString(undefined, { day: 'numeric', month: 'short', ...(opts.year !== false ? { year: 'numeric' } : {}), timeZone: 'UTC' })
}

/**
 * How long a session's broadcast runs, in minutes — the player sizes
 * releases by it (which ones the connection carries, which are heavy).
 * Broadcast files hold the build-up too, so longer than the session.
 */
export const SESSION_MINUTES: Record<F1Session, number> = {
  fp1: 70,
  fp2: 70,
  fp3: 70,
  'sprint-qualifying': 55,
  sprint: 50,
  qualifying: 75,
  race: 130,
}

// ---------------------------------------------------------------------------
// Seasons, races, sessions
// ---------------------------------------------------------------------------

/**
 * The season to open on: this year's once it has started (its first race
 * weekend is usually early March), else last year's, which is complete.
 */
export function defaultSeasonYear(now = new Date()): number {
  const year = now.getFullYear()
  return now.getMonth() < 2 || (now.getMonth() === 2 && now.getDate() < 10) ? year - 1 : year
}

/** Every season the archive offers, newest first. */
export function seasonYears(now = new Date()): number[] {
  const years: number[] = []
  for (let y = now.getFullYear(); y >= FIRST_F1_SEASON; y--) years.push(y)
  return years
}

/** When a session (or the race) starts, as a timestamp — null when the calendar doesn't say. */
export function startsAt(slot: { date: string | null; time: string | null }): number | null {
  if (!slot.date) return null
  const t = Date.parse(`${slot.date}T${slot.time ?? '00:00:00Z'}`)
  return Number.isNaN(t) ? null : t
}

/** It hasn't started yet. Unknown dates count as run (an old season's). */
export function isUpcoming(slot: { date: string | null; time: string | null }, now = Date.now()): boolean {
  const at = startsAt(slot)
  return at !== null && at > now
}

/**
 * The sessions to list for a race: its calendar's, plus any its releases
 * hold that an old calendar (which lists none) couldn't — in weekend order.
 */
export function sessionsToList(race: F1Race, releases?: readonly F1Release[]): F1SessionSlot[] {
  if (race.sessionsListed || !releases) return race.sessions
  const keys = new Set<F1Session>(race.sessions.map((s) => s.key))
  for (const r of releases) r.sessions.forEach((s) => keys.add(s))
  return F1_SESSIONS.filter((k) => keys.has(k)).map((k) => race.sessions.find((s) => s.key === k) ?? { key: k, date: null, time: null })
}

/** A race weekend's page, on the website and in the app. */
export function f1RacePath(year: number, round: number): string {
  return `/f1/${year}/${round}`
}

/** The releases that hold `session`. */
export function releasesFor(releases: readonly F1Release[] | undefined, session: F1Session): F1Release[] {
  return (releases ?? []).filter((r) => r.sessions.includes(session))
}

/** The race in `season` that's on next, or the last one run when the season is over. */
export function focusRace(season: F1Season, now = Date.now()): F1Race | null {
  const upcoming = season.races.find((r) => isUpcoming({ date: r.date, time: r.time }, now))
  return upcoming ?? season.races[season.races.length - 1] ?? null
}

// ---------------------------------------------------------------------------
// Premium
// ---------------------------------------------------------------------------

/**
 * What the archive says when Premium won't play for this viewer: why, and
 * that downloads (magnet links, open to everyone) still work. Empty when it will.
 */
export function f1PremiumNote(reason: PremiumReason): string {
  switch (reason) {
    case 'granted':
      return ''
    case 'sign-in-required':
      return 'Watching uses Premium, which is invite-only. Downloads are open to everyone.'
    case 'not-approved':
      return 'Watching uses Premium, which your account doesn’t have yet — ask for it from the Premium screen in the StreamVault app. Downloads are open to everyone.'
    case 'app-only':
      return 'Your Premium plays in the StreamVault app for Android, Linux and Windows. Downloads work here too.'
    case 'paused':
      return 'Your Premium is paused for now. Downloads still work.'
    case 'paused-for-all':
      return 'Premium is paused right now. Downloads still work.'
    case 'suspended':
      return 'This account is suspended. Downloads still work.'
    case 'update-required':
      return 'Update the app to keep watching with Premium. Downloads still work.'
  }
}

/** Said under the Premium player's notice when it won't play an F1 session. */
export const F1_ELSEWHERE = 'Downloads (magnet links) are open to everyone.'

/**
 * What the Premium player plays for one session: its releases from the
 * archive (the race page's request, when it's already made). A pack's size
 * is the whole weekend's, not the session's, so the player isn't told it —
 * it would take the pack for a file too heavy to stream.
 */
export function f1ReleaseSource(queryClient: QueryClient, year: number, round: number, session: F1Session): PremiumReleaseSource {
  return {
    key: `f1:${year}:${round}:${session}`,
    session,
    probeUnseeded: true,
    notFoundMessage: 'Nobody is sharing this session right now — try another session, or check back later.',
    find: async ({ fresh }) => {
      const query = f1ReleasesQuery(year, round)
      const releases = await queryClient.fetchQuery(fresh ? { ...query, staleTime: 0 } : query)
      return releasesFor(releases, session).map((r) => (r.pack ? { ...r, size: '0' } : r))
    },
  }
}
