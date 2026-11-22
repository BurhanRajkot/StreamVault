import { describe, expect, it } from 'bun:test'
import { isSeasonYear, raceQueries, sessionSlots, sortIntoRace, type F1Race } from './f1'
import type { ApibayResult } from './debrid'

const GB = 1024 ** 3

function row(name: string, overrides: Partial<ApibayResult> = {}): ApibayResult {
  return {
    id: name,
    name,
    info_hash: Math.abs(hashCode(name)).toString(16).padStart(40, '0').slice(0, 40),
    leechers: '1',
    seeders: '5',
    num_files: '1',
    size: String(4 * GB),
    username: 'uploader',
    added: '0',
    status: 'vip',
    category: '208',
    imdb: '',
    ...overrides,
  }
}

function hashCode(s: string): number {
  let h = 0
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0
  return h
}

function f1Race(round: number, name: string, country: string, locality: string, sessions: F1Race['sessions'], listed = true): F1Race {
  return { round, name, circuit: '', locality, country, date: '2025-12-07', time: null, sessions, sessionsListed: listed, winner: null }
}

const slot = (key: F1Race['sessions'][number]['key']) => ({ key, date: null, time: null })

describe('sessionSlots', () => {
  it('lists a sprint weekend in the order it ran', () => {
    const { sessions, listed } = sessionSlots({
      season: '2024',
      round: '5',
      raceName: 'Chinese Grand Prix',
      date: '2024-04-21',
      time: '07:00:00Z',
      Circuit: { circuitName: 'Shanghai International Circuit', Location: { locality: 'Shanghai', country: 'China' } },
      FirstPractice: { date: '2024-04-19', time: '03:30:00Z' },
      SprintQualifying: { date: '2024-04-19', time: '07:30:00Z' },
      Sprint: { date: '2024-04-20', time: '03:00:00Z' },
      Qualifying: { date: '2024-04-20', time: '07:00:00Z' },
    })
    expect(listed).toBe(true)
    expect(sessions.map((s) => s.key)).toEqual(['fp1', 'sprint-qualifying', 'sprint', 'qualifying', 'race'])
  })

  it('assumes qualifying and the race when an old calendar lists no sessions', () => {
    const { sessions, listed } = sessionSlots({
      season: '1994',
      round: '3',
      raceName: 'San Marino Grand Prix',
      date: '1994-05-01',
      Circuit: { circuitName: 'Autodromo Enzo e Dino Ferrari', Location: { locality: 'Imola', country: 'Italy' } },
    })
    expect(listed).toBe(false)
    expect(sessions.map((s) => s.key)).toEqual(['qualifying', 'race'])
  })
})

describe('raceQueries', () => {
  it("asks for the race by each of its names, each way of writing Formula 1, and by round", () => {
    expect(raceQueries(2016, { round: 20, name: 'Brazilian Grand Prix', country: 'Brazil', locality: 'São Paulo' })).toEqual([
      'formula1 2016 brazilian',
      'formula 1 2016 brazilian',
      'f1 2016 brazilian',
      'formula1 2016 brazil',
      'formula 1 2016 brazil',
      'f1 2016 brazil',
      'formula 1 2016 round 20',
      'formula1 2016 round 20',
      'f1 2016 r20',
    ])
  })
})

describe('sortIntoRace', () => {
  const abuDhabi = f1Race(24, 'Abu Dhabi Grand Prix', 'UAE', 'Abu Dhabi', [slot('fp1'), slot('fp2'), slot('fp3'), slot('qualifying'), slot('race')])
  const lasVegas = f1Race(22, 'Las Vegas Grand Prix', 'USA', 'Las Vegas', [slot('fp1'), slot('fp2'), slot('fp3'), slot('qualifying'), slot('race')])
  const season = [lasVegas, abuDhabi]

  it("keeps this race's releases, most shared first, each with its sessions", () => {
    const releases = sortIntoRace(
      [
        row('formula1 2025 abu dhabi grand prix 720p WEB H264-JFF', { seeders: '2', size: String(3 * GB) }),
        row('formula1 2025 abu dhabi grand prix qualifying 720p WEB H264-JFF', { seeders: '9', size: String(2 * GB) }),
        row('formula1 2025 las vegas grand prix 720p WEB H264-JFF'),
        row('Formula.1.2025.Abu.Dhabi.Pre.Race.Show.1080p.SS'),
      ],
      2025,
      abuDhabi,
      season
    )
    expect(releases.map((r) => [r.name, r.sessions])).toEqual([
      ['formula1 2025 abu dhabi grand prix qualifying 720p WEB H264-JFF', ['qualifying']],
      ['formula1 2025 abu dhabi grand prix 720p WEB H264-JFF', ['race']],
    ])
    expect(releases.every((r) => r.cached === false && r.info_hash === r.info_hash.toUpperCase())).toBe(true)
  })

  it("keeps only the sessions the weekend had out of a weekend pack", () => {
    const [pack] = sortIntoRace([row('F1.2025.R24.Abu.Dhabi.Grand.Prix.SkyUHD.2160P', { size: String(75 * GB) })], 2025, abuDhabi, season)
    expect(pack.pack).toBe(true)
    expect(pack.sessions).toEqual(['fp1', 'fp2', 'fp3', 'qualifying', 'race'])
  })

  it('passes over clips, other categories and the same torrent twice', () => {
    const name = 'formula1 2025 abu dhabi grand prix 720p WEB H264-JFF'
    const releases = sortIntoRace(
      [row(name), row(name), row('formula1 2025 abu dhabi grand prix 720p sample', { size: String(50 * 1024 ** 2) }), row(name + ' game', { category: '401', info_hash: 'B'.repeat(40) })],
      2025,
      abuDhabi,
      season
    )
    expect(releases).toHaveLength(1)
  })
})

describe('isSeasonYear', () => {
  const now = new Date('2026-11-22T12:00:00Z')
  it('takes 1950 up to next season', () => {
    expect(isSeasonYear(1950, now)).toBe(true)
    expect(isSeasonYear(2027, now)).toBe(true)
    expect(isSeasonYear(1949, now)).toBe(false)
    expect(isSeasonYear(2028, now)).toBe(false)
    expect(isSeasonYear(2025.5, now)).toBe(false)
  })
})
