// Bulk backfill: replays every user's full real interaction history through
// the corrected genre-profile formula (decay + EMA, see events.ts) and
// overwrites their saved UserGenreProfile row in production.
//
// Usage:
//   bun run _scratch_backfill_all.ts --dry-run        # compute + log only, no writes
//   bun run _scratch_backfill_all.ts                  # actually writes
//   bun run _scratch_backfill_all.ts --user=<userId>  # single user (writes unless --dry-run too)

import { supabaseAdmin } from './src/lib/supabase'
import { getMovieFeatures } from './src/cinematch/features/movieFeatures'
import type { MediaType } from './src/cinematch/types'

const SIGNAL_EVENTS = ['watch', 'favorite', 'rate', 'dislike']
const GENRE_DECAY_PER_EVENT = 0.98
const PAGE = 1000
const FEATURE_FETCH_CONCURRENCY = 5
const USER_CONCURRENCY = 3

const DRY_RUN = process.argv.includes('--dry-run')
const ONLY_USER = process.argv.find(a => a.startsWith('--user='))?.split('=')[1]

interface Row {
  tmdbId: number
  mediaType: string
  eventType: string
  weight: number
  createdAt: string
}

async function mapLimit<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const results: R[] = new Array(items.length)
  let i = 0
  async function worker() {
    while (i < items.length) {
      const idx = i++
      results[idx] = await fn(items[idx])
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker))
  return results
}

// Postgrest caps a single request at 1000 rows regardless of .limit(), so page.
async function fetchAllSignalRows(userId: string): Promise<Row[]> {
  let all: Row[] = []
  for (let offset = 0; ; offset += PAGE) {
    const { data, error } = await supabaseAdmin
      .from('UserInteractions')
      .select('tmdbId, mediaType, eventType, weight, createdAt')
      .eq('userId', userId)
      .in('eventType', SIGNAL_EVENTS)
      .order('createdAt', { ascending: true })
      .range(offset, offset + PAGE - 1)
    if (error) throw error
    if (!data || data.length === 0) break
    all = all.concat(data)
    if (data.length < PAGE) break
  }
  return all
}

// Mirrors updateGenreProfileIncremental() in tracking/events.ts exactly, just
// folded over the whole history in one pass instead of one event at a time.
async function computeFinalGenreMap(rows: Row[]): Promise<Record<string, number> | null> {
  if (rows.length === 0) return null

  // Prefetch features for every unique title up front (shared in-process
  // movieFeatureCache means repeats across users are free after the first
  // fetch) so the sequential EMA fold below never awaits.
  const uniqueKeys = new Map<string, { tmdbId: number; mediaType: MediaType }>()
  for (const r of rows) {
    const key = `${r.mediaType}:${r.tmdbId}`
    if (!uniqueKeys.has(key)) uniqueKeys.set(key, { tmdbId: r.tmdbId, mediaType: r.mediaType as MediaType })
  }
  const featureMap = new Map<string, number[]>()
  await mapLimit([...uniqueKeys.entries()], FEATURE_FETCH_CONCURRENCY, async ([key, { tmdbId, mediaType }]) => {
    const f = await getMovieFeatures(tmdbId, mediaType)
    featureMap.set(key, f?.genreIds ?? [])
  })

  const map: Record<string, number> = {}
  for (const row of rows) {
    const genreIds = featureMap.get(`${row.mediaType}:${row.tmdbId}`) ?? []
    if (genreIds.length === 0) continue // matches production: no resolved genres -> event skipped entirely, no decay

    const effectiveWeight = row.weight < 0 ? row.weight * 1.5 : row.weight
    for (const k of Object.keys(map)) map[k] *= GENRE_DECAY_PER_EVENT
    for (const genreId of genreIds) {
      const gk = String(genreId)
      const current = map[gk] ?? 0
      map[gk] = Math.max(-1, Math.min(1, 0.85 * current + 0.15 * effectiveWeight))
    }
  }
  return map
}

async function backfillUser(userId: string): Promise<{ userId: string; status: 'updated' | 'skipped-no-signal' | 'error'; detail: string }> {
  try {
    const rows = await fetchAllSignalRows(userId)
    const finalMap = await computeFinalGenreMap(rows)
    if (!finalMap) return { userId, status: 'skipped-no-signal', detail: '0 signal events' }

    // Preserve the existing _meta block (keyword/cast/director/decade maps) —
    // this backfill only recomputes genreMap, nothing writes _meta currently.
    const { data: existing } = await supabaseAdmin
      .from('UserGenreProfile')
      .select('genreMap')
      .eq('userId', userId)
      .single()
    const existingMeta = existing?.genreMap && typeof existing.genreMap === 'object'
      ? (existing.genreMap as Record<string, unknown>)._meta
      : undefined
    const payload: Record<string, unknown> = { ...finalMap }
    if (existingMeta !== undefined) payload._meta = existingMeta

    if (!DRY_RUN) {
      const { error } = await supabaseAdmin
        .from('UserGenreProfile')
        .upsert({ userId, genreMap: payload, updatedAt: new Date().toISOString() }, { onConflict: 'userId' })
      if (error) throw error
    }
    return { userId, status: 'updated', detail: `${rows.length} signal events replayed` }
  } catch (err) {
    return { userId, status: 'error', detail: String(err) }
  }
}

async function getTargetUserIds(): Promise<string[]> {
  if (ONLY_USER) return [ONLY_USER]

  const ids = new Set<string>()

  for (let offset = 0; ; offset += PAGE) {
    const { data, error } = await supabaseAdmin
      .from('UserInteractions')
      .select('userId')
      .in('eventType', SIGNAL_EVENTS)
      .range(offset, offset + PAGE - 1)
    if (error) throw error
    if (!data || data.length === 0) break
    for (const r of data) ids.add(r.userId)
    if (data.length < PAGE) break
  }

  // Also cover any UserGenreProfile row whose interactions were pruned/deleted
  // so an orphaned saturated profile doesn't get missed.
  for (let offset = 0; ; offset += PAGE) {
    const { data, error } = await supabaseAdmin
      .from('UserGenreProfile')
      .select('userId')
      .range(offset, offset + PAGE - 1)
    if (error) throw error
    if (!data || data.length === 0) break
    for (const r of data) ids.add(r.userId)
    if (data.length < PAGE) break
  }

  return [...ids]
}

const userIds = await getTargetUserIds()
console.log(`${DRY_RUN ? '[DRY RUN] ' : ''}Backfilling ${userIds.length} user(s)...\n`)

let done = 0
const summary = { updated: 0, skipped: 0, errors: 0 }
await mapLimit(userIds, USER_CONCURRENCY, async (userId) => {
  const result = await backfillUser(userId)
  done++
  if (result.status === 'updated') summary.updated++
  else if (result.status === 'skipped-no-signal') summary.skipped++
  else summary.errors++
  console.log(`[${done}/${userIds.length}] ${userId} -> ${result.status} (${result.detail})`)
})

console.log('\n=== Done ===')
console.log(summary)
