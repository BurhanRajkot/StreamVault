import { supabaseAdmin } from './supabase'

/**
 * Short-lived memo of users confirmed paid, keyed by userId → expiry epoch ms.
 *
 * Starting one TorBox stream hits 3+ premium-gated endpoints back to back,
 * each of which would otherwise re-query Supabase. Only positive results are
 * memoized, so an upgrade takes effect immediately; a cancellation or expiry
 * takes at most PAID_MEMO_TTL_MS to be enforced.
 */
const PAID_MEMO_TTL_MS = 60 * 1000
const PAID_MEMO_CAP = 10_000
const paidUntil = new Map<string, number>()

/**
 * True when the user has an active, unexpired subscription.
 *
 * `subscriptionExpiresAt` is null for legacy/lifetime grants — only enforce
 * expiry when a date is actually set.
 */
export async function isPaidUser(userId: string): Promise<boolean> {
  const memoExpiry = paidUntil.get(userId)
  if (memoExpiry !== undefined && memoExpiry > Date.now()) return true

  const { data: user } = await supabaseAdmin
    .from('User')
    .select('subscriptionStatus, subscriptionExpiresAt')
    .eq('id', userId)
    .single()

  const paid =
    user?.subscriptionStatus === 'active' &&
    (!user.subscriptionExpiresAt || new Date(user.subscriptionExpiresAt).getTime() > Date.now())

  if (paid) {
    if (paidUntil.size >= PAID_MEMO_CAP) paidUntil.clear()
    // Never memoize past the subscription's own expiry.
    const expiresAt = user.subscriptionExpiresAt
      ? new Date(user.subscriptionExpiresAt).getTime()
      : Infinity
    paidUntil.set(userId, Math.min(Date.now() + PAID_MEMO_TTL_MS, expiresAt))
  } else {
    paidUntil.delete(userId)
  }

  return paid
}
