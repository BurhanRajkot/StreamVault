import Stripe from 'stripe'

if (!process.env.STRIPE_SECRET_KEY) {
  throw new Error('STRIPE_SECRET_KEY is not set')
}

export const stripe = new Stripe(process.env.STRIPE_SECRET_KEY, {
  apiVersion: '2025-12-15.clover',
})

export const SUBSCRIPTION_PLANS = {
  basic: {
    name: 'StreamVault Basic',
    price: 3000,
    currency: 'inr',
    features: ['HD Streaming', 'Watch on 1 device', 'Ad-supported'],
  },
  premium: {
    name: 'StreamVault Premium',
    price: 5000,
    currency: 'inr',
    features: ['4K Ultra HD', 'Watch on 4 devices', 'No ads', 'Download content', 'Early access'],
  },
} as const
