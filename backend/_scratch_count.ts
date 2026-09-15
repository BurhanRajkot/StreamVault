import { supabaseAdmin } from './src/lib/supabase'
const userId = process.argv[2]
const { count } = await supabaseAdmin
  .from('UserInteractions')
  .select('*', { count: 'exact', head: true })
  .eq('userId', userId)
console.log('total rows:', count)
