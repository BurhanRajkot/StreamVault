import express from 'express'
import { getStripe, SUBSCRIPTION_PLANS } from '../lib/stripe'
import { checkJwt } from '../middleware/auth'

const router = express.Router()
export { express }

async function getOrCreatePrices() {
  const stripe = getStripe()
  const existingProducts = await stripe.products.list({ limit: 100, active: true })

  let basicProduct = existingProducts.data.find(p => p.name === 'StreamVault Basic')
  let premiumProduct = existingProducts.data.find(p => p.name === 'StreamVault Premium')

  if (!basicProduct) {
    basicProduct = await stripe.products.create({
      name: 'StreamVault Basic',
      description: 'HD Streaming on 1 device with ads',
    })
  }

  if (!premiumProduct) {
    premiumProduct = await stripe.products.create({
      name: 'StreamVault Premium',
      description: '4K Ultra HD, 4 devices, no ads, downloads',
    })
  }

  const existingPrices = await stripe.prices.list({
    limit: 100,
    active: true,
    type: 'recurring',
  })

  let basicPrice = existingPrices.data.find(
    p => p.product === basicProduct!.id && p.unit_amount === SUBSCRIPTION_PLANS.basic.price && p.currency === 'inr'
  )
  let premiumPrice = existingPrices.data.find(
    p => p.product === premiumProduct!.id && p.unit_amount === SUBSCRIPTION_PLANS.premium.price && p.currency === 'inr'
  )

  if (!basicPrice) {
    basicPrice = await stripe.prices.create({
      product: basicProduct.id,
      unit_amount: SUBSCRIPTION_PLANS.basic.price,
      currency: 'inr',
      recurring: { interval: 'month' },
    })
  }

  if (!premiumPrice) {
    premiumPrice = await stripe.prices.create({
      product: premiumProduct.id,
      unit_amount: SUBSCRIPTION_PLANS.premium.price,
      currency: 'inr',
      recurring: { interval: 'month' },
    })
  }

  return {
    basic: basicPrice.id,
    premium: premiumPrice.id,
  }
}

router.get('/plans', async (_req, res) => {
  try {
    const prices = await getOrCreatePrices()
    res.json({
      plans: [
        {
          id: 'basic',
          priceId: prices.basic,
          ...SUBSCRIPTION_PLANS.basic,
        },
        {
          id: 'premium',
          priceId: prices.premium,
          ...SUBSCRIPTION_PLANS.premium,
        },
      ],
    })
  } catch (error: any) {
    console.error('Error fetching plans:', error)
    res.status(500).json({ error: 'Failed to fetch plans' })
  }
})

router.post('/create-checkout-session', async (req, res) => {
  try {
    const stripe = getStripe()
    const { priceId, userId, email } = req.body

    if (!priceId) {
      return res.status(400).json({ error: 'priceId is required' })
    }

    const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:8080'

    const sessionConfig: any = {
      mode: 'subscription',
      payment_method_types: ['card'],
      line_items: [{ price: priceId, quantity: 1 }],
      success_url: `${frontendUrl}/subscription/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${frontendUrl}/pricing`,
      metadata: {
        userId: userId || 'anonymous',
      },
    }

    if (email) {
      sessionConfig.customer_email = email
    }

    const session = await stripe.checkout.sessions.create(sessionConfig)

    res.json({ url: session.url })
  } catch (error: any) {
    console.error('Checkout session error:', error)
    res.status(500).json({ error: error.message || 'Failed to create checkout session' })
  }
})

router.get('/session/:sessionId', async (req, res) => {
  try {
    const stripe = getStripe()
    const { sessionId } = req.params

    const session = await stripe.checkout.sessions.retrieve(sessionId, {
      expand: ['subscription', 'customer'],
    })

    const subscription = session.subscription as any

    res.json({
      status: session.status,
      customerEmail: session.customer_email || (session.customer as any)?.email,
      subscriptionStatus: subscription?.status,
      subscriptionId: subscription?.id,
      currentPeriodEnd: subscription?.current_period_end,
    })
  } catch (error: any) {
    console.error('Session retrieval error:', error)
    res.status(500).json({ error: 'Failed to retrieve session' })
  }
})

router.post('/create-portal-session', async (req, res) => {
  try {
    const stripe = getStripe()
    const { customerId } = req.body

    if (!customerId) {
      return res.status(400).json({ error: 'customerId is required' })
    }

    const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:8080'

    const portalSession = await stripe.billingPortal.sessions.create({
      customer: customerId,
      return_url: `${frontendUrl}/pricing`,
    })

    res.json({ url: portalSession.url })
  } catch (error: any) {
    console.error('Portal session error:', error)
    res.status(500).json({ error: 'Failed to create portal session' })
  }
})

router.post('/webhook', express.raw({ type: 'application/json' }), async (req, res) => {
  const sig = req.headers['stripe-signature'] as string
  const endpointSecret = process.env.STRIPE_WEBHOOK_SECRET

  if (!endpointSecret) {
    console.error('Webhook secret not configured. Set STRIPE_WEBHOOK_SECRET in .env')
    return res.status(500).json({ error: 'Webhook secret not configured' })
  }

  try {
    const stripe = getStripe()
    const event = await stripe.webhooks.constructEventAsync(req.body, sig, endpointSecret)

    switch (event.type) {
      case 'customer.subscription.created':
        console.log('Subscription created:', event.data.object.id)
        break

      case 'customer.subscription.updated':
        console.log('Subscription updated:', event.data.object.id)
        break

      case 'customer.subscription.deleted':
        console.log('Subscription deleted:', event.data.object.id)
        break

      case 'invoice.paid':
        console.log('💰 Invoice paid:', event.data.object.id)
        break

      case 'invoice.payment_failed':
        console.error('Payment failed:', event.data.object.id)
        break

      default:
        console.log(`Unhandled event type: ${event.type}`)
    }

    res.json({ received: true })
  } catch (err: any) {
    console.error('Webhook error:', err.message)
    return res.status(400).send(`Webhook Error: ${err.message}`)
  }
})

export default router
