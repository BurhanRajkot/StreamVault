import { supabaseAdmin } from './src/lib/supabase'

const { data, error } = await supabaseAdmin
  .from('UserInteractions')
  .select('userId, eventType')
  .order('createdAt', { ascending: false })
  .limit(2000)

if (error) {
  console.error('ERROR', error)
  process.exit(1)
}

const counts = new Map<string, Record<string, number>>()
for (const row of data || []) {
  const c = counts.get(row.userId) || {}
  c.total = (c.total || 0) + 1
  c[row.eventType] = (c[row.eventType] || 0) + 1
  counts.set(row.userId, c)
}

const sorted = [...counts.entries()].sort((a, b) => (b[1].total || 0) - (a[1].total || 0))
for (const [userId, c] of sorted.slice(0, 10)) {
  console.log(userId, JSON.stringify(c))
}
