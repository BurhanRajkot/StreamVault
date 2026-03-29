import { supabaseAdmin } from './supabase'

/**
 * Upsert a User row for the given Auth0 userId.
 * Must be called at the start of any route that writes user-specific data
 * (ContinueWatching, Favorites, Dislikes, etc.) so that foreign-key
 * constraints are satisfied on first use by a brand-new account.
 */
export async function ensureUser(userId: string): Promise<void> {
  const { data: existing } = await supabaseAdmin
    .from('User')
    .select('id')
    .eq('id', userId)
    .single()

  if (!existing) {
    await supabaseAdmin.from('User').insert({ id: userId })
  }
}
