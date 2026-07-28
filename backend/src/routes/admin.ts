import express from 'express'
import { supabaseAdmin } from '../lib/supabase'
import { logger } from '../lib/logger'
import { requireAdminAuth } from '../admin/middleware'

const router = express.Router()

// Apply admin authentication to all routes in this router
router.use(requireAdminAuth)

/** Request ids are UUIDs; reject anything else before it reaches the query. */
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

function parseRequestId(value: unknown): string | null {
  return typeof value === 'string' && UUID_RE.test(value) ? value : null
}

// Get all pending requests
router.get('/requests', async (req, res) => {
  try {
    const { data, error } = await supabaseAdmin
      .from('subscription_requests')
      .select('*')
      .order('created_at', { ascending: false })

    if (error) throw error

    res.json(data)
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

    // 1. Get request details
    const { data: request, error: fetchError } = await supabaseAdmin
      .from('subscription_requests')
      .select('*')
      .eq('id', requestId)
      .single()

    if (fetchError || !request) {
      return res.status(404).json({ error: 'Request not found' })
    }

    if (request.status === 'approved') {
      return res.status(400).json({ error: 'Request already approved' })
    }

    // 2. Grant access FIRST. The paywall in routes/downloads.ts gates on
    //    User.subscriptionStatus === 'active', so this is the write that
    //    actually makes the subscription real. Doing it before flipping the
    //    request to "approved" means a failure here leaves the request
    //    pending and retryable, instead of marking it approved while the
    //    user still has no access.
    if (request.user_id) {
      const { error: userUpdateError } = await supabaseAdmin
        .from('User')
        .update({ subscriptionStatus: 'active' })
        .eq('id', request.user_id)

      if (userUpdateError) {
        logger.error('Failed to activate subscription; request left pending', {
          error: userUpdateError.message,
          userId: request.user_id,
          requestId,
        })
        return res.status(500).json({ error: 'Failed to activate subscription' })
      }
    } else {
      // Guest submissions carry no user_id, so there is no account to upgrade.
      logger.warn('Approving a request with no linked user account', { requestId })
    }

    // 3. Record the approval
    const { error: updateError } = await supabaseAdmin
      .from('subscription_requests')
      .update({ status: 'approved' })
      .eq('id', requestId)

    if (updateError) throw updateError

    logger.info('Approved subscription request', { requestId, userId: request.user_id })
    res.json({ success: true })
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
