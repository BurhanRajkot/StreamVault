/**
 * Where a season's calendar comes from when Jolpica can't say (lib/f1Calendar),
 * and getSeason's choice between them — against stubbed Jolpica and OpenF1.
 */

import { afterEach, beforeEach, describe, expect, it } from 'bun:test'
import * as cache from '../services/cache'
import { getSeason, resetJolpicaForTests } from './f1'
import { fillWinners, isComplete, openF1Season, snapshotSeason } from './f1Calendar'

const realFetch = globalThis.fetch
let calls: string[]
/** What each host answers; a path not listed answers 404. */
let jolpica: (path: string) => Response
let openF1: Record<string, unknown[]>

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })

beforeEach(async () => {
  calls = []
  resetJolpicaForTests()
  jolpica = () => new Response('down', { status: 503 })
  openF1 = {}
  globalThis.fetch = (async (input: string | URL | Request) => {
    const url = new URL(typeof input === 'string' ? input : input instanceof URL ? input.href : input.url)
    calls.push(`${url.host}${url.pathname}`)
    if (url.host === 'api.jolpi.ca') return jolpica(url.pathname)
    if (url.host === 'api.openf1.org') {
      const rows = openF1[`${url.pathname.replace('/v1', '')}?${decodeURIComponent(url.search.slice(1))}`]
      return rows ? json(rows) : json({ detail: 'No results found.' }, 404)
    }
    throw new Error(`unexpected fetch ${url.href}`)
  }) as typeof fetch
  for (const year of [2026, 2030]) {
    await cache.f1.del(`season:${year}`)
    await cache.f1.del(`season-last:${year}`)
  }
})

afterEach(() => {
  globalThis.fetch = realFetch
})

describe('snapshotSeason', () => {
  it('has every finished season, complete, in Jolpica’s names', () => {
    const season = snapshotSeason(2025)
    expect(season).toHaveLength(24)
    expect(isComplete(season ?? [])).toBe(true)
    const mexico = season?.find((r) => r.locality === 'Mexico City')
    expect(mexico?.name).toBe('Mexico City Grand Prix')
    expect(season?.find((r) => r.name === 'British Grand Prix')?.country).toBe('UK')
    expect(mexico?.sessions.map((s) => s.key)).toEqual(['fp1', 'fp2', 'fp3', 'qualifying', 'race'])
    expect(snapshotSeason(1950)?.[0].winner?.driver).toBe('Nino Farina')
    expect(snapshotSeason(1949)).toBeNull()
  })

  it('hands out copies, so filling in a winner leaves the snapshot alone', () => {
    const a = snapshotSeason(2026) ?? []
    a[0].winner = { driver: 'Somebody', team: '' }
    expect(snapshotSeason(2026)?.[0].winner?.driver).not.toBe('Somebody')
  })
})

describe('getSeason', () => {
  it('answers a finished season from the snapshot, asking nobody', async () => {
    const season = await getSeason(2024)
    expect(season.races).toHaveLength(24)
    expect(calls).toEqual([])
  })

  it('falls back on the snapshot when Jolpica is down, and leaves Jolpica alone for a while', async () => {
    const season = await getSeason(2026)
    expect(season.races.length).toBeGreaterThan(20)
    expect(calls.some((c) => c.startsWith('api.jolpi.ca'))).toBe(true)

    await cache.f1.del('season:2026')
    calls = []
    await getSeason(2026)
    expect(calls.filter((c) => c.startsWith('api.jolpi.ca'))).toEqual([])
  })

  it('takes Jolpica’s calendar when it answers', async () => {
    jolpica = (path) =>
      path.includes('/results/')
        ? json({ MRData: { RaceTable: { Races: [] } } })
        : json({
            MRData: {
              RaceTable: {
                Races: [{ season: '2026', round: '1', raceName: 'Test Grand Prix', date: '2026-03-08', Circuit: { circuitName: 'X', Location: { locality: 'Y', country: 'Z' } } }],
              },
            },
          })
    const season = await getSeason(2026)
    expect(season.races.map((r) => r.name)).toEqual(['Test Grand Prix'])
  })

  it('builds a season nothing else has from OpenF1', async () => {
    openF1['/meetings?year=2030'] = [
      { meeting_key: 1, meeting_name: 'Pre-Season Testing', location: 'Sakhir', country_name: 'Bahrain', circuit_short_name: 'Sakhir', date_start: '2030-02-20T07:00:00+00:00' },
      { meeting_key: 2, meeting_name: 'Australian Grand Prix', location: 'Melbourne', country_name: 'Australia', circuit_short_name: 'Melbourne', date_start: '2030-03-06T01:30:00+00:00' },
    ]
    openF1['/sessions?year=2030'] = [
      { session_key: 10, session_name: 'Day 1', meeting_key: 1, date_start: '2030-02-20T07:00:00+00:00', location: 'Sakhir' },
      { session_key: 20, session_name: 'Qualifying', meeting_key: 2, date_start: '2030-03-07T05:00:00+00:00', location: 'Melbourne' },
      { session_key: 21, session_name: 'Race', meeting_key: 2, date_start: '2030-03-08T04:00:00+00:00', location: 'Melbourne' },
    ]
    const season = await getSeason(2030)
    expect(season.races).toHaveLength(1)
    expect(season.races[0]).toMatchObject({ round: 1, name: 'Australian Grand Prix', country: 'Australia', date: '2030-03-08' })
    expect(season.races[0].sessions.map((s) => s.key)).toEqual(['qualifying', 'race'])
  })
})

describe('openF1Season', () => {
  const meetings = [
    { meeting_key: 1, meeting_name: 'Bahrain Grand Prix', location: 'Sakhir', country_name: 'Bahrain', circuit_short_name: 'Sakhir', date_start: '2029-04-10T11:30:00+00:00' },
    { meeting_key: 2, meeting_name: 'Miami Grand Prix', location: 'Miami Gardens', country_name: 'United States', circuit_short_name: 'Miami', date_start: '2029-05-01T16:00:00+00:00' },
  ]
  const sessions = [
    { session_key: 11, session_name: 'Race', meeting_key: 1, date_start: '2029-04-12T15:00:00+00:00', location: 'Sakhir' },
    { session_key: 21, session_name: 'Race', meeting_key: 2, date_start: '2029-05-03T20:00:00+00:00', location: 'Miami Gardens' },
  ]

  it('drops a Grand Prix whose race day passed without a result — it was cancelled', async () => {
    openF1['/meetings?year=2029'] = meetings
    openF1['/sessions?year=2029'] = sessions
    openF1['/session_result?position=1&session_key>=11'] = [{ session_key: 21, driver_number: 1, position: 1 }]
    openF1['/drivers?session_key>=21'] = [{ session_key: 21, driver_number: 1, first_name: 'Max', last_name: 'Verstappen', full_name: 'Max VERSTAPPEN', team_name: 'Red Bull Racing' }]
    const races = await openF1Season(2029, Date.parse('2029-06-01'))
    expect(races?.map((r) => [r.round, r.name, r.country, r.winner?.driver])).toEqual([[1, 'Miami Grand Prix', 'USA', 'Max Verstappen']])
  })

  it('keeps every Grand Prix when the results can’t be had', async () => {
    openF1['/meetings?year=2029'] = meetings
    openF1['/sessions?year=2029'] = sessions
    const stub = globalThis.fetch
    globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) =>
      String(input).includes('/session_result') ? new Response('busy', { status: 503 }) : stub(input, init)) as typeof fetch
    const races = await openF1Season(2029, Date.parse('2029-06-01'))
    expect(races?.map((r) => r.name)).toEqual(['Bahrain Grand Prix', 'Miami Grand Prix'])
  })
})

describe('fillWinners', () => {
  it('fills in a race run since, by its day', async () => {
    const races = (snapshotSeason(2026) ?? []).slice(-2).map((r) => ({ ...r, winner: null }))
    openF1['/sessions?year=2026&session_name=Race'] = [{ session_key: 900, session_name: 'Race', meeting_key: 9, date_start: `${races[0].date}T13:00:00+00:00`, location: '' }]
    openF1['/session_result?position=1&session_key>=900'] = [{ session_key: 900, driver_number: 4, position: 1 }]
    openF1['/drivers?session_key>=900'] = [{ session_key: 900, driver_number: 4, first_name: 'Lando', last_name: 'Norris', full_name: 'Lando NORRIS', team_name: 'McLaren' }]
    const filled = await fillWinners(2026, races, Date.parse(`${races[1].date}T23:00:00Z`) + 86_400_000)
    expect(filled[0].winner).toEqual({ driver: 'Lando Norris', team: 'McLaren' })
    expect(filled[1].winner).toBeNull()
  })

  it('leaves the races as they were when OpenF1 is down', async () => {
    const races = (snapshotSeason(2026) ?? []).slice(-1).map((r) => ({ ...r, winner: null }))
    const filled = await fillWinners(2026, races, Date.parse('2027-01-01'))
    expect(filled[0].winner).toBeNull()
  })
})
