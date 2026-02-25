import express from 'express'
import { v4 as uuidv4 } from 'uuid'
import { SUBSCRIPTION_PLANS, UPI_CONFIG } from '../lib/upi'
import { supabaseAdmin } from '../lib/supabase'
import { logger } from '../lib/logger'
import { checkJwt } from '../middleware/auth'
import QRCode from 'qrcode'
import { strictRateLimiter } from '../cybersecurity'

const router = express.Router()

// Get available subscription plans and UPI config
router.get('/plans', async (_req, res) => {
  try {
    // Generate UPI URI for QR Code
    // Format: upi://pay?pa=<upi_id>&pn=<payee_name>&cu=<currency>
    const baseUrl = `upi://pay?pa=${UPI_CONFIG.upiId}&pn=${encodeURIComponent(UPI_CONFIG.payeeName)}&cu=${UPI_CONFIG.currency}`

    const plansWithQr = await Promise.all(
      Object.entries(SUBSCRIPTION_PLANS).map(async ([key, plan]) => {
        const upiUrl = `${baseUrl}&am=${plan.price}&tn=${encodeURIComponent(plan.name)}`
        const qrCodeDataUrl = await QRCode.toDataURL(upiUrl)

        return {
          id: key,
          ...plan,
          qrCode: qrCodeDataUrl,
          upiId: UPI_CONFIG.upiId
        }
      })
    )

    res.json({
      plans: plansWithQr,
      upiConfig: {
        payeeName: UPI_CONFIG.payeeName,
        upiId: UPI_CONFIG.upiId
      }
    })
  } catch (error: any) {
    logger.error('Error fetching plans', { error: error.message })
    res.status(500).json({ error: 'Failed to fetch plans' })
  }
})

// Submit manual payment request
// checkJwt is optional here (userId may be unauthenticated in manual flow)
// but we NEVER trust userId from body — we derive it from the token if available
router.post('/manual-request', strictRateLimiter, checkJwt, async (req, res) => {
  try {
    // userId must come from the verified JWT, never from the body
    const userId = (req as any).auth?.payload?.sub || null
    const { email, planId, transactionId } = req.body

    if (!planId || !transactionId) {
      return res.status(400).json({ error: 'Missing required fields: planId and transactionId' })
    }

    if (!['basic', 'premium'].includes(planId)) {
      return res.status(400).json({ error: 'Invalid planId' })
    }

    // Sanitize transactionId: only allow alphanumeric, hyphens, underscores (max 100 chars)
    const sanitizedTxId = String(transactionId).replace(/[^a-zA-Z0-9-_]/g, '').slice(0, 100)
    if (!sanitizedTxId || sanitizedTxId.length < 4) {
      return res.status(400).json({ error: 'Invalid transactionId format' })
    }

    const plan = SUBSCRIPTION_PLANS[planId as keyof typeof SUBSCRIPTION_PLANS]

    // Check if transaction ID already exists
    const { data: existing } = await supabaseAdmin
      .from('subscription_requests')
      .select('id')
      .eq('transaction_id', sanitizedTxId)
      .single()

    if (existing) {
      return res.status(400).json({ error: 'Transaction ID already submitted' })
    }

    // Create request record
    const { data, error } = await supabaseAdmin
      .from('subscription_requests')
      .insert({
        id: uuidv4(),
        user_id: userId, // from JWT, or null if not logged in
        email: typeof email === 'string' ? email.slice(0, 254) : null, // sanitize
        plan_id: planId,
        amount: plan.price,
        currency: plan.currency,
        transaction_id: sanitizedTxId,
        status: 'pending',
        created_at: new Date().toISOString()
      })
      .select()
      .single()

    if (error) throw error

    logger.info('Manual payment request submitted', {
      userId,
      planId,
      transactionId: sanitizedTxId
    })

    res.json({
      success: true,
      message: 'Request submitted successfully',
      requestId: data.id
    })
  } catch (error: any) {
    logger.error('Manual request error', { error: error.message })
    res.status(500).json({ error: 'Failed to submit request' })
  }
})

// Get status of a request
router.get('/request/:requestId', async (req, res) => {
  try {
    const { requestId } = req.params

    const { data, error } = await supabaseAdmin
      .from('subscription_requests')
      .select('*')
      .eq('id', requestId)
      .single()

    if (error) throw error

    res.json(data)
  } catch (error: any) {
    logger.error('Request fetch error', { error: error.message })
    res.status(500).json({ error: 'Failed to fetch request' })
  }
})

export default router
