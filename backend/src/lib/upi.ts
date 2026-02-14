// UPI Payment Configuration
export const UPI_CONFIG = {
  upiId: process.env.UPI_ID || 'gamershomeyt0520@oksbi',
  payeeName: process.env.UPI_PAYEE_NAME || 'StreamVault',
  phoneNumber: process.env.UPI_PHONE_NUMBER || '9867721328',
  currency: 'INR',
}

export const SUBSCRIPTION_PLANS = {
  basic: {
    name: 'StreamVault Basic',
    price: 30, // ₹30
    currency: 'INR',
    period: 'monthly',
    features: ['HD Streaming', 'Watch on 1 device', 'Ad-supported'],
  },
  premium: {
    name: 'StreamVault Premium',
    price: 50, // ₹50
    currency: 'INR',
    period: 'monthly',
    features: ['4K Ultra HD', 'Watch on 4 devices', 'No ads', 'Download content', 'Early access'],
  },
} as const
