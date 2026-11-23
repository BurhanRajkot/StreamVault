/**
 * Rebuilds backend/src/lib/f1Snapshot.ts — every F1 season's calendar
 * (races, sessions, winners), bundled with the backend so the F1 archive
 * works when Jolpica, its live source, is down (it was, for hours, on
 * 2026-11-23, and every F1 page said "The calendar didn't load").
 *
 * Source: f1db (github.com/f1db/f1db, CC BY 4.0), its latest release's JSON.
 * f1db gives session times from 2024 on; 2023's come from OpenF1, matched by
 * race day. Names are put the way Jolpica writes them ("UK", "USA",
 * "Mexico City Grand Prix"), which is what lib/f1Names was tuned on.
 *
 *   bun scripts/f1-snapshot.ts               # download f1db's latest release
 *   bun scripts/f1-snapshot.ts --dir <data>  # an unpacked f1db-json-splitted data/ folder
 *
 * Rerun after a season ends (or whenever) and commit the result.
 */

import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { toRace, type F1Race, type JolpicaRace } from '../src/lib/f1'

interface F1dbRace {
  id: number
  year: number
  round: number
  date: string
  time: string | null
  grandPrixId: string
  circuitId: string
  freePractice1Date: string | null
  freePractice1Time: string | null
  freePractice2Date: string | null
  freePractice2Time: string | null
  freePractice3Date: string | null
  freePractice3Time: string | null
  qualifyingDate: string | null
  qualifyingTime: string | null
  sprintQualifyingDate: string | null
  sprintQualifyingTime: string | null
  sprintRaceDate: string | null
  sprintRaceTime: string | null
}

interface OpenF1Session {
  session_name: string
  date_start: string
  meeting_key: number
}

/** Jolpica's names for the countries f1db spells out. */
const COUNTRY_NAMES: Record<string, string> = {
  'United Kingdom': 'UK',
  'United States of America': 'USA',
  'United Arab Emirates': 'UAE',
  'South Korea': 'Korea',
}

/** Jolpica's (and the broadcasts') names where f1db's differ. */
function raceName(gpId: string, fullName: string, year: number): string {
  if (gpId === 'mexico' && year >= 2021) return 'Mexico City Grand Prix'
  if (gpId === 'barcelona-catalunya') return 'Barcelona Grand Prix'
  return fullName
}

/** "18:30" → "18:30:00Z"; f1db's times are UTC. */
function utc(time: string | null | undefined): string | undefined {
  return time ? `${time.length === 5 ? `${time}:00` : time}Z` : undefined
}

function slot(date: string | null | undefined, time: string | null | undefined) {
  return date ? { date, time: utc(time) } : undefined
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

async function openF1Sessions(year: number): Promise<OpenF1Session[]> {
  const res = await fetch(`https://api.openf1.org/v1/sessions?year=${year}`, { signal: AbortSignal.timeout(30_000) })
  if (!res.ok) throw new Error(`OpenF1 sessions ${year}: ${res.status}`)
  return (await res.json()) as OpenF1Session[]
}

async function f1dbDataDir(): Promise<string> {
  const flag = process.argv.indexOf('--dir')
  if (flag > 0 && process.argv[flag + 1]) return process.argv[flag + 1]
  const rel = (await (await fetch('https://api.github.com/repos/f1db/f1db/releases/latest')).json()) as {
    tag_name: string
    assets: Array<{ name: string; browser_download_url: string }>
  }
  const asset = rel.assets.find((a) => a.name === 'f1db-json-splitted.tgz')
  if (!asset) throw new Error('f1db release has no f1db-json-splitted.tgz')
  const dir = mkdtempSync(join(tmpdir(), 'f1db-'))
  const tgz = join(dir, asset.name)
  console.log(`Downloading f1db ${rel.tag_name}…`)
  writeFileSync(tgz, Buffer.from(await (await fetch(asset.browser_download_url)).arrayBuffer()))
  const untar = Bun.spawnSync(['tar', 'xzf', tgz, '-C', dir])
  if (untar.exitCode !== 0) throw new Error(`tar failed: ${untar.stderr.toString()}`)
  return join(dir, 'package', 'data')
}

async function main() {
  const dir = await f1dbDataDir()
  const read = <T>(name: string): T => JSON.parse(readFileSync(join(dir, `f1db-${name}.json`), 'utf8')) as T
  const version = (JSON.parse(readFileSync(join(dir, '..', 'package.json'), 'utf8')) as { version: string }).version

  const races = read<F1dbRace[]>('races')
  const grandsPrix = new Map(read<Array<{ id: string; fullName: string }>>('grands-prix').map((g) => [g.id, g]))
  const circuits = new Map(read<Array<{ id: string; fullName: string; placeName: string; countryId: string }>>('circuits').map((c) => [c.id, c]))
  const countries = new Map(read<Array<{ id: string; name: string }>>('countries').map((c) => [c.id, c.name]))
  const drivers = new Map(read<Array<{ id: string; firstName: string; lastName: string }>>('drivers').map((d) => [d.id, d]))
  const constructors = new Map(read<Array<{ id: string; name: string }>>('constructors').map((c) => [c.id, c.name]))

  const winners = new Map<number, F1Race['winner']>()
  for (const r of read<Array<{ raceId: number; positionNumber: number | null; driverId: string; constructorId: string }>>('races-race-results')) {
    if (r.positionNumber !== 1 || winners.has(r.raceId)) continue
    const d = drivers.get(r.driverId)
    if (d) winners.set(r.raceId, { driver: `${d.firstName} ${d.lastName}`, team: constructors.get(r.constructorId) ?? '' })
  }

  // f1db has no session times before 2024: 2023's from OpenF1, by race day
  const openF1 = new Map<string, OpenF1Session[]>()
  for (const year of [2023]) {
    const sessions = await openF1Sessions(year)
    const byMeeting = new Map<number, OpenF1Session[]>()
    for (const s of sessions) byMeeting.set(s.meeting_key, [...(byMeeting.get(s.meeting_key) ?? []), s])
    for (const list of byMeeting.values()) {
      const race = list.find((s) => s.session_name === 'Race')
      if (race) openF1.set(race.date_start.slice(0, 10), list)
    }
  }

  const seasons: Record<string, F1Race[]> = {}
  for (const r of races) {
    const circuit = circuits.get(r.circuitId)
    const gp = grandsPrix.get(r.grandPrixId)
    const country = countries.get(circuit?.countryId ?? '') ?? ''
    const row: JolpicaRace = {
      season: String(r.year),
      round: String(r.round),
      raceName: raceName(r.grandPrixId, gp?.fullName ?? r.grandPrixId, r.year),
      date: r.date,
      time: utc(r.time),
      Circuit: { circuitName: circuit?.fullName ?? '', Location: { locality: circuit?.placeName ?? '', country: COUNTRY_NAMES[country] ?? country } },
      FirstPractice: slot(r.freePractice1Date, r.freePractice1Time),
      SecondPractice: slot(r.freePractice2Date, r.freePractice2Time),
      ThirdPractice: slot(r.freePractice3Date, r.freePractice3Time),
      Qualifying: slot(r.qualifyingDate, r.qualifyingTime),
      SprintQualifying: slot(r.sprintQualifyingDate, r.sprintQualifyingTime),
      Sprint: slot(r.sprintRaceDate, r.sprintRaceTime),
    }
    const fromOpenF1 = !row.FirstPractice ? openF1.get(r.date) : undefined
    for (const s of fromOpenF1 ?? []) {
      const at = { date: s.date_start.slice(0, 10), time: `${s.date_start.slice(11, 19)}Z` }
      if (s.session_name === 'Race') row.time ??= at.time
      const field = OPENF1_SESSION_FIELDS[s.session_name]
      if (field) (row as unknown as Record<string, unknown>)[field] = at
    }
    const race = toRace(row, new Map([[r.round, winners.get(r.id) ?? null]]))
    ;(seasons[r.year] ??= []).push(race)
  }
  for (const list of Object.values(seasons)) list.sort((a, b) => a.round - b.round)

  const json = JSON.stringify({ source: `f1db v${version}`, seasons })
  const out = join(import.meta.dir, '..', 'src', 'lib', 'f1Snapshot.ts')
  writeFileSync(
    out,
    `// Generated by backend/scripts/f1-snapshot.ts from f1db v${version} (github.com/f1db/f1db, CC BY 4.0) — don't edit by hand.\n` +
      `// Every season's calendar, sessions and winners: what lib/f1Calendar falls back on when Jolpica is down.\n` +
      `export const F1_SNAPSHOT_JSON = ${JSON.stringify(json)}\n`
  )
  const count = Object.values(seasons).reduce((n, l) => n + l.length, 0)
  console.log(`Wrote ${out}: ${Object.keys(seasons).length} seasons, ${count} races, ${(json.length / 1024).toFixed(0)} KB`)
}

await main()
// lib/f1 brings the cache (Redis) with it, which would keep the process alive
process.exit(0)
