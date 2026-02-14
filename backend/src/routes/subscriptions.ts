import express from 'express'
import { v4 as uuidv4 } from 'uuid'
import { SUBSCRIPTION_PLANS, UPI_CONFIG } from '../lib/upi'
import { supabaseAdmin } from '../lib/supabase'
import { logger } from '../lib/logger'
import QRCode from 'qrcode'

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
router.post('/manual-request', async (req, res) => {
  try {
    const { userId, email, planId, transactionId } = req.body

    if (!userId || !planId || !transactionId) {
      return res.status(400).json({ error: 'Missing required fields' })
    }

    if (!['basic', 'premium'].includes(planId)) {
      return res.status(400).json({ error: 'Invalid planId' })
    }

    const plan = SUBSCRIPTION_PLANS[planId as keyof typeof SUBSCRIPTION_PLANS]

    // Check if transaction ID already exists
    const { data: existing } = await supabaseAdmin
      .from('subscription_requests')
      .select('id')
      .eq('transaction_id', transactionId)
      .single()

    if (existing) {
      return res.status(400).json({ error: 'Transaction ID already submitted' })
    }

    // Create request record
    const { data, error } = await supabaseAdmin
      .from('subscription_requests')
      .insert({
        id: uuidv4(),
        user_id: userId,
        email: email, // Optional, for context
        plan_id: planId,
        amount: plan.price,
        currency: plan.currency,
        transaction_id: transactionId,
        status: 'pending',
        created_at: new Date().toISOString()
      })
      .select()
      .single()

    if (error) throw error

    logger.info('Manual payment request submitted', {
      userId,
      planId,
      transactionId
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
