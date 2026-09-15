import { supabaseAdmin } from './src/lib/supabase'
import { getMovieFeatures } from './src/cinematch/features/movieFeatures'

const userId = process.argv[2]

const { data: interactions } = await supabaseAdmin
  .from('UserInteractions')
  .select('tmdbId, mediaType, eventType, weight, createdAt')
  .eq('userId', userId)
  .order('createdAt', { ascending: true })
  .limit(30)

for (const row of interactions || []) {
  const f = await getMovieFeatures(row.tmdbId, row.mediaType as 'movie'|'tv')
  console.log(row.createdAt, row.eventType, row.mediaType, row.tmdbId, '->', f ? JSON.stringify(f.genreIds) : 'NULL', f?.title)
}
