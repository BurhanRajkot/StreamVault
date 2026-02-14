import express from 'express'
import { supabaseAdmin } from '../lib/supabase'
import { logger } from '../lib/logger'

const router = express.Router()

// Get all pending requests
router.get('/requests', async (req, res) => {
  try {
    const { data, error } = await supabaseAdmin
      .from('subscription_requests')
      .select('*')
      .order('created_at', { ascending: false })

    if (error) throw error

    res.json(data)
  } catch (error: any) {
    logger.error('Failed to fetch requests', { error: error.message })
    res.status(500).json({ error: 'Failed to fetch requests' })
  }
})

// Approve a request
router.post('/approve', async (req, res) => {
  try {
    const { requestId } = req.body

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

    // 2. Update status to approved
    const { error: updateError } = await supabaseAdmin
      .from('subscription_requests')
      .update({ status: 'approved' })
      .eq('id', requestId)

    if (updateError) throw updateError

    // 3. TODO: Activate user's subscription in your main users table
    // For now we just mark the request as approved.
    // In a real app, you would do:
    // await supabaseAdmin.from('users').update({ subscription_plan: request.plan_id }).eq('id', request.user_id)

    logger.info('Approved subscription request', { requestId })
    res.json({ success: true })
  } catch (error: any) {
    logger.error('Failed to approve request', { error: error.message })
    res.status(500).json({ error: 'Failed to approve request' })
  }
})

// Reject a request
router.post('/reject', async (req, res) => {
  try {
    const { requestId } = req.body

    const { error } = await supabaseAdmin
      .from('subscription_requests')
      .update({ status: 'rejected' })
      .eq('id', requestId)

    if (error) throw error

    logger.info('Rejected subscription request', { requestId })
    res.json({ success: true })
  } catch (error: any) {
    logger.error('Failed to reject request', { error: error.message })
    res.status(500).json({ error: 'Failed to reject request' })
  }
})

export default router
