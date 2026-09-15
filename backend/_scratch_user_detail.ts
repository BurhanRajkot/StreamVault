import { supabaseAdmin } from './src/lib/supabase'

const userId = process.argv[2]

const { data, error } = await supabaseAdmin
  .from('UserInteractions')
  .select('tmdbId, mediaType, eventType, weight, createdAt')
  .eq('userId', userId)
  .order('createdAt', { ascending: false })
  .limit(20)

if (error) {
  console.error('ERROR', error)
  process.exit(1)
}

for (const row of data || []) {
  console.log(row.createdAt, row.eventType, row.weight, row.mediaType, row.tmdbId)
}

const { data: genreProfile } = await supabaseAdmin
  .from('UserGenreProfile')
  .select('genreMap, updatedAt')
  .eq('userId', userId)
  .single()

console.log('\n--- UserGenreProfile ---')
console.log(JSON.stringify(genreProfile, null, 2)?.slice(0, 2000))
