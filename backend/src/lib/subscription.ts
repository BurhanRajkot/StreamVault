import { supabaseAdmin } from './supabase'

/**
 * True when the user has an active, unexpired subscription.
 *
 * `subscriptionExpiresAt` is null for legacy/lifetime grants — only enforce
 * expiry when a date is actually set.
 */
export async function isPaidUser(userId: string): Promise<boolean> {
  const { data: user } = await supabaseAdmin
    .from('User')
    .select('subscriptionStatus, subscriptionExpiresAt')
    .eq('id', userId)
    .single()

  if (user?.subscriptionStatus !== 'active') return false
  if (!user.subscriptionExpiresAt) return true
  return new Date(user.subscriptionExpiresAt).getTime() > Date.now()
}
