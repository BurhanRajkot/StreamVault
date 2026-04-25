import { supabaseAdmin } from './supabase'

const ensuredUsers = new Set<string>()

/**
 * Upsert a User row for the given Auth0 userId.
 * Must be called at the start of any route that writes user-specific data
 * (ContinueWatching, Favorites, Dislikes, etc.) so that foreign-key
 * constraints are satisfied on first use by a brand-new account.
 */
export async function ensureUser(userId: string): Promise<void> {
  if (ensuredUsers.has(userId)) {
    return
  }

  const { data: existing } = await supabaseAdmin
    .from('User')
    .select('id')
    .eq('id', userId)
    .single()

  if (!existing) {
    const { error } = await supabaseAdmin.from('User').insert({ id: userId })
    if (!error) {
      ensuredUsers.add(userId)
    }
  } else {
    ensuredUsers.add(userId)
  }
}
