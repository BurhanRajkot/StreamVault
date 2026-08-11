import { supabaseAdmin } from './supabase'

/**
 * Memo of user ids already provisioned, so the hot path skips a Supabase
 * round-trip per request.
 *
 * Bounded and FIFO-evicted: an unbounded Set here grows for the whole process
 * lifetime, one entry per distinct user ever seen. Evicting the oldest entry
 * costs at most one extra existence check next time that user returns.
 */
const ENSURED_USERS_CAP = 10_000
const ensuredUsers = new Set<string>()

function remember(userId: string): void {
  if (ensuredUsers.size >= ENSURED_USERS_CAP) {
    // Set iterates in insertion order, so the first key is the oldest.
    const oldest = ensuredUsers.values().next().value
    if (oldest !== undefined) ensuredUsers.delete(oldest)
  }
  ensuredUsers.add(userId)
}

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
      remember(userId)
    }
  } else {
    remember(userId)
  }
}
