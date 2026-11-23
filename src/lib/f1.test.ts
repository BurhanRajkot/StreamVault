import { describe, expect, it } from 'bun:test'
import { QueryClient } from '@tanstack/react-query'
import { parseTorrentQuality } from './debridApi'
import * as f1 from './f1'
import {
  defaultSeasonYear,
  f1ReleaseSource,
  f1ReleasesQuery,
  focusRace,
  isUpcoming,
  releasesFor,
  sessionLabel,
  sessionsToList,
  type F1Race,
  type F1Release,
} from './f1'

function release(name: string, sessions: F1Release['sessions'], pack = false, size = '5000000000'): F1Release {
  return {
    id: name,
    name,
    info_hash: name.padEnd(40, 'A').slice(0, 40),
    seeders: '3',
    leechers: '0',
    size,
    num_files: '1',
    username: 'u',
    added: '0',
    category: '208',
    cached: false,
    sessions,
    pack,
  }
}

const race = (overrides: Partial<F1Race> = {}): F1Race => ({
  round: 3,
  name: 'San Marino Grand Prix',
  circuit: 'Imola',
  locality: 'Imola',
  country: 'Italy',
  date: '1994-05-01',
  time: null,
  sessions: [
    { key: 'qualifying', date: null, time: null },
    { key: 'race', date: '1994-05-01', time: null },
  ],
  sessionsListed: false,
  winner: null,
  ...overrides,
})

describe('sessionLabel', () => {
  it('names 2023 sprint qualifying by its name that year', () => {
    expect(sessionLabel('sprint-qualifying', 2023)).toBe('Sprint Shootout')
    expect(sessionLabel('sprint-qualifying', 2024)).toBe('Sprint Qualifying')
    expect(sessionLabel('fp2', 2024)).toBe('Practice 2')
  })
})

describe('defaultSeasonYear', () => {
  it("opens on last season until this one's first race", () => {
    expect(defaultSeasonYear(new Date(2026, 0, 20))).toBe(2025)
    expect(defaultSeasonYear(new Date(2026, 2, 1))).toBe(2025)
    expect(defaultSeasonYear(new Date(2026, 2, 15))).toBe(2026)
    expect(defaultSeasonYear(new Date(2026, 10, 22))).toBe(2026)
  })
})

describe('sessionsToList', () => {
  it("adds the sessions an old calendar couldn't list but releases hold", () => {
    const sessions = sessionsToList(race(), [release('Formula 1 1994 San Marino Practice 1', ['fp1'])])
    expect(sessions.map((s) => s.key)).toEqual(['fp1', 'qualifying', 'race'])
  })

  it("keeps a listed calendar's sessions as they are", () => {
    const listed = race({ sessionsListed: true })
    expect(sessionsToList(listed, [release('x', ['fp1'])]).map((s) => s.key)).toEqual(['qualifying', 'race'])
  })
})

describe('isUpcoming and focusRace', () => {
  const now = Date.parse('2025-12-01T00:00:00Z')
  it('tells a session to come from one run — or one with no date', () => {
    expect(isUpcoming({ date: '2025-12-07', time: '13:00:00Z' }, now)).toBe(true)
    expect(isUpcoming({ date: '2025-11-30', time: '16:00:00Z' }, now)).toBe(false)
    expect(isUpcoming({ date: null, time: null }, now)).toBe(false)
  })

  it('focuses the race on next', () => {
    const season = { year: 2025, races: [race({ round: 23, date: '2025-11-30' }), race({ round: 24, date: '2025-12-07' })] }
    expect(focusRace(season, now)?.round).toBe(24)
  })
})

describe('f1ReleaseSource', () => {
  it("plays one session's releases, without the weekend's size on a pack", async () => {
    const queryClient = new QueryClient()
    queryClient.setQueryData(f1ReleasesQuery(2025, 24).queryKey, [
      release('formula1 2025 abu dhabi grand prix 720p', ['race']),
      release('formula1 2025 abu dhabi grand prix qualifying 720p', ['qualifying']),
      release('F1.2025.R24.Abu.Dhabi.Grand.Prix.SkyUHD.2160P', ['fp1', 'qualifying', 'race'], true, '79000000000'),
    ])
    const source = f1ReleaseSource(queryClient, 2025, 24, 'race')
    expect(source.key).toBe('f1:2025:24:race')
    expect(source.session).toBe('race')
    const releases = await source.find({ fresh: false })
    expect(releases.map((r) => [r.name, r.size])).toEqual([
      ['formula1 2025 abu dhabi grand prix 720p', '5000000000'],
      ['F1.2025.R24.Abu.Dhabi.Grand.Prix.SkyUHD.2160P', '0'],
    ])
    expect(releasesFor(undefined, 'race')).toEqual([])
  })
})

describe('parseTorrentQuality on broadcast captures', () => {
  it('reads the resolution past a frame rate, a scan or a channel name', () => {
    expect(parseTorrentQuality('Formula1 2021 Bahrain Grand Prix Race 1080p50 HDTV')).toBe('1080p')
    expect(parseTorrentQuality('Formula 1 2016 Brazil Race 1080i HD Multi Audio')).toBe('1080p')
    expect(parseTorrentQuality('Formula1 2020 Eifel Grand Prix Race 720p50 HDTV')).toBe('720p')
    expect(parseTorrentQuality('F1.2026.R18.United.States.Grand.Prix.SkyUHD.2160P')).toBe('4K')
    expect(parseTorrentQuality('Formula.1.2024.Season.Review.SkyF1UHD.4K-HLG')).toBe('4K')
    expect(parseTorrentQuality('Inception.2010.1080p.BluRay.x264')).toBe('1080p')
  })
})

describe('the weekend, for the pages', () => {
  const { raceState, sessionsByDay, weekendDates, countdown } = f1
  const race = (round: number, date: string, sessions: Array<[string, string, string | null]>) => ({
    round,
    name: `Race ${round}`,
    circuit: '',
    locality: '',
    country: '',
    date,
    time: '20:00:00Z',
    sessions: sessions.map(([key, d, t]) => ({ key: key as never, date: d, time: t })),
    sessionsListed: true,
    winner: null,
  })
  const r1 = race(1, '2026-11-01', [['fp1', '2026-10-30', '18:30:00Z'], ['qualifying', '2026-10-31', '21:00:00Z'], ['race', '2026-11-01', '20:00:00Z']])
  const r2 = race(2, '2026-11-08', [['fp1', '2026-11-06', '15:30:00Z'], ['race', '2026-11-08', '17:00:00Z']])
  const r3 = race(3, '2026-11-15', [['race', '2026-11-15', '17:00:00Z']])
  const season = { year: 2026, races: [r1, r2, r3] }

  it('tells a run race, the weekend under way, the next and the ones after', () => {
    const now = Date.parse('2026-11-07T12:00:00Z')
    expect([r1, r2, r3].map((r) => raceState(r, season, now))).toEqual(['done', 'live', 'upcoming'])
    expect(raceState(r2, season, Date.parse('2026-11-03T00:00:00Z'))).toBe('next')
  })

  it('names the weekend’s days', () => {
    const range = (a: string, b: string, year: boolean) =>
      new Intl.DateTimeFormat(undefined, { day: 'numeric', month: 'short', ...(year ? { year: 'numeric' } : {}), timeZone: 'UTC' }).formatRange(
        new Date(`${a}T12:00:00Z`),
        new Date(`${b}T12:00:00Z`)
      )
    expect(weekendDates(r1)).toBe(range('2026-10-30', '2026-11-01', true))
    expect(weekendDates(r2, { year: false })).toBe(range('2026-11-06', '2026-11-08', false))
    expect(weekendDates(r2, { year: false })).not.toContain('2026')
    expect(weekendDates(r3)).toBe(f1.formatF1Date('2026-11-15'))
  })

  it('puts sessions under their day, and the undated together', () => {
    const days = sessionsByDay([...r1.sessions, { key: 'sprint', date: null, time: null }])
    expect(days.map((d) => d.sessions.map((s) => s.key))).toEqual([['fp1'], ['qualifying'], ['race'], ['sprint']])
    expect(days[3].label).toBeNull()
  })

  it('counts down', () => {
    expect(countdown(Date.parse('2026-11-03T05:30:00Z'), Date.parse('2026-11-01T02:00:00Z'))).toEqual({ days: 2, hours: 3, minutes: 30 })
    expect(countdown(0, 10)).toEqual({ days: 0, hours: 0, minutes: 0 })
  })
})
