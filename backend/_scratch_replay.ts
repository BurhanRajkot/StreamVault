import { supabaseAdmin } from './src/lib/supabase'
import { TMDB_GENRES } from './src/cinematch/types'

const userId = process.argv[2]

// Paginate through the full history in chronological order (Postgrest caps
// a single request at 1000 rows regardless of .limit()).
const PAGE = 1000
let allRows: { tmdbId: number; mediaType: string; eventType: string; weight: number; createdAt: string }[] = []
for (let offset = 0; ; offset += PAGE) {
  const { data, error } = await supabaseAdmin
    .from('UserInteractions')
    .select('tmdbId, mediaType, eventType, weight, createdAt')
    .eq('userId', userId)
    .order('createdAt', { ascending: true })
    .range(offset, offset + PAGE - 1)
  if (error) { console.error('ERROR', error); process.exit(1) }
  if (!data || data.length === 0) break
  allRows = allRows.concat(data)
  if (data.length < PAGE) break
}

console.log(`Fetched ${allRows.length} total rows`)

const { getMovieFeatures } = await import('./src/cinematch/features/movieFeatures')

const GENRE_DECAY_PER_EVENT = 0.98
let map: Record<string, number> = {}
let processed = 0

for (const row of allRows) {
  if (row.eventType === 'click' || row.eventType === 'search') continue

  const features = await getMovieFeatures(row.tmdbId, row.mediaType as 'movie' | 'tv')
  if (!features || features.genreIds.length === 0) continue

  const effectiveWeight = row.weight < 0 ? row.weight * 1.5 : row.weight

  for (const k of Object.keys(map)) map[k] *= GENRE_DECAY_PER_EVENT
  for (const genreId of features.genreIds) {
    const key = String(genreId)
    const current = map[key] ?? 0
    map[key] = Math.max(-1, Math.min(1, 0.85 * current + 0.15 * effectiveWeight))
  }
  processed++
}

console.log(`Replayed ${processed} signal interactions (of ${allRows.length} total rows)\n`)

const sorted = Object.entries(map).sort((a, b) => b[1] - a[1])
for (const [id, w] of sorted) {
  console.log(`${(TMDB_GENRES as Record<string, string>)[id] || id}`.padEnd(20), w.toFixed(3))
}
