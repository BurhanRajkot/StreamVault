import express from 'express'
import { supabaseAdmin } from '../lib/supabase'
import { logger } from '../lib/logger'
import { requireAdminAuth } from '../admin/middleware'
import { SUBSCRIPTION_PLANS } from '../lib/upi'
import { forgetUserAccess, getDownloadsAllowedFor } from '../lib/userAccess'
import { notifyPremiumGranted, type PremiumEmailResult } from '../lib/premiumEmail'

const router = express.Router()

// Apply admin authentication to all routes in this router
router.use(requireAdminAuth)

/** Request ids are UUIDs; reject anything else before it reaches the query. */
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

function parseRequestId(value: unknown): string | null {
  return typeof value === 'string' && UUID_RE.test(value) ? value : null
}

// Get all requests, newest first. Each says whether its buyer may save
// Premium's file (`debrid_downloads`, see lib/userAccess) — null for a guest
// request, which has no account to change.
router.get('/requests', async (req, res) => {
  try {
    const [{ data, error }, downloadsAllowed] = await Promise.all([
      supabaseAdmin.from('subscription_requests').select('*').order('created_at', { ascending: false }),
      getDownloadsAllowedFor(),
    ])

    if (error) throw error

    const requests = ((data ?? []) as { user_id?: string | null }[]).map((request) => ({
      ...request,
      debrid_downloads: request.user_id ? downloadsAllowed.has(request.user_id) : null,
    }))
    res.json(requests)
  } catch (error: unknown) {
    logger.error('Failed to fetch requests', { error: error instanceof Error ? error.message : String(error) })
    res.status(500).json({ error: 'Failed to fetch requests' })
  }
})

// Approve a request
router.post('/approve', async (req, res) => {
  try {
    const requestId = parseRequestId(req.body?.requestId)
    if (!requestId) {
      return res.status(400).json({ error: 'A valid requestId is required' })
    }

    // The plan's length lives in code, so look the plan up first.
    const { data: request, error: fetchError } = await supabaseAdmin
      .from('subscription_requests')
      .select('plan_id, email')
      .eq('id', requestId)
      .single()

    if (fetchError || !request) {
      return res.status(404).json({ error: 'Request not found' })
    }

    const plan = SUBSCRIPTION_PLANS[request.plan_id as keyof typeof SUBSCRIPTION_PLANS] as
      | (typeof SUBSCRIPTION_PLANS)[keyof typeof SUBSCRIPTION_PLANS]
      | undefined
    const durationDays = plan?.durationDays ?? 30

    // Granting the plan and marking the request approved happen in one
    // transaction, with the request row locked — so a double-click can't
    // extend the subscription twice, and a failure can't leave one done
    // without the other. A renewal extends from the current expiry.
    const { data: approval, error: approveError } = await supabaseAdmin
      .rpc('approve_subscription_request', {
        p_request_id: requestId,
        p_duration_days: durationDays,
      })
      .single<{
        result: 'approved' | 'already_approved' | 'not_found'
        approved_user_id: string | null
        expires_at: string | null
      }>()

    if (approveError) throw approveError

    if (approval.result === 'not_found') {
      return res.status(404).json({ error: 'Request not found' })
    }
    if (approval.result === 'already_approved') {
      return res.status(400).json({ error: 'Request already approved' })
    }

    let premiumEmail: PremiumEmailResult | undefined
    if (!approval.approved_user_id) {
      // Guest submissions carry no user_id, so there is no account to upgrade.
      logger.warn('Approved a request with no linked user account', { requestId })
    } else {
      // A paid plan is what Premium playback checks for: switch it on for an
      // account that doesn't have it yet. One the admin paused on purpose
      // stays paused — that's changed from the Users panel.
      const { data: switchedOn, error: grantError } = await supabaseAdmin
        .from('User')
        .update({ premiumAccess: 'granted' })
        .eq('id', approval.approved_user_id)
        .eq('premiumAccess', 'none')
        .select('email, name')
      if (!grantError && Array.isArray(switchedOn) && switchedOn.length > 0) {
        // Premium was just switched on: tell them.
        const row = switchedOn[0] as { email?: string | null; name?: string | null }
        premiumEmail = await notifyPremiumGranted(approval.approved_user_id, { email: row.email ?? request.email, name: row.name })
      }
      if (grantError) {
        logger.warn('Approved, but could not switch Premium on for the account', {
          requestId,
          error: grantError.message,
        })
      }
      forgetUserAccess(approval.approved_user_id)
    }

    logger.info('Approved subscription request', {
      requestId,
      userId: approval.approved_user_id,
      expiresAt: approval.expires_at,
    })
    res.json({ success: true, ...(premiumEmail ? { premiumEmail } : {}) })
  } catch (error: unknown) {
    logger.error('Failed to approve request', { error: error instanceof Error ? error.message : String(error) })
    res.status(500).json({ error: 'Failed to approve request' })
  }
})

// Reject a request
router.post('/reject', async (req, res) => {
  try {
    const requestId = parseRequestId(req.body?.requestId)
    if (!requestId) {
      return res.status(400).json({ error: 'A valid requestId is required' })
    }

    const { data, error } = await supabaseAdmin
      .from('subscription_requests')
      .update({ status: 'rejected' })
      .eq('id', requestId)
      .select('id')

    if (error) throw error
    if (!data || data.length === 0) {
      return res.status(404).json({ error: 'Request not found' })
    }

    logger.info('Rejected subscription request', { requestId })
    res.json({ success: true })
  } catch (error: unknown) {
    logger.error('Failed to reject request', { error: error instanceof Error ? error.message : String(error) })
    res.status(500).json({ error: 'Failed to reject request' })
  }
})

export default router
