/**
 * The F1 archive (see lib/f1.ts). Public, like GET /releases: calendars and
 * release lists from public indexes, nothing from the Real-Debrid account.
 *
 *   GET /f1/seasons/:year                          — the season's races, sessions and winners
 *   GET /f1/seasons/:year/races/:round/releases    — one race weekend's releases, by session
 *
 * Playing a release is Premium's /debrid/play, with `session` set.
 */

import { Router, Request, Response } from 'express'
import { logger } from '../lib/logger'
import { findRaceReleases, getSeason, isSeasonYear } from '../lib/f1'

const router = Router()

/** A path segment that is a whole number of at most `digits` digits, else undefined. */
function pathInt(value: string | undefined, digits: number): number | undefined {
  if (typeof value !== 'string' || !new RegExp(`^\\d{1,${digits}}$`).test(value)) return undefined
  return Number(value)
}

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err)
}

router.get('/seasons/:year', async (req: Request, res: Response) => {
  const year = pathInt(req.params.year, 4)
  if (year === undefined || !isSeasonYear(year)) return res.status(400).json({ error: 'year must be a season from 1950 on' })

  try {
    const season = await getSeason(year)
    // Calendars change at most once a weekend
    res.set('Cache-Control', 'public, max-age=900')
    return res.json({ data: season })
  } catch (err: unknown) {
    logger.error('F1 season lookup failed', { year, error: errorMessage(err) })
    return res.status(502).json({ error: 'The F1 calendar is unavailable right now' })
  }
})

router.get('/seasons/:year/races/:round/releases', async (req: Request, res: Response) => {
  const year = pathInt(req.params.year, 4)
  const round = pathInt(req.params.round, 2)
  if (year === undefined || !isSeasonYear(year)) return res.status(400).json({ error: 'year must be a season from 1950 on' })
  if (round === undefined || round < 1) return res.status(400).json({ error: 'round must be a race number' })

  try {
    const releases = await findRaceReleases(year, round)
    if (!releases) return res.status(404).json({ error: `No round ${round} in ${year}` })
    // The indexes are asked at most hourly server-side; browsers and the CDN can hold it a while too
    // An empty list can change any minute (uploads turn up after a session): don't let it be held
    res.set('Cache-Control', releases.length > 0 ? 'public, max-age=600' : 'no-store')
    return res.json({ data: releases })
  } catch (err: unknown) {
    logger.error('F1 release search failed', { year, round, error: errorMessage(err) })
    return res.status(502).json({ error: 'Search failed' })
  }
})

export default router
