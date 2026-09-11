// UPI Payment Configuration
// All values MUST be set via environment variables — no hardcoded PII
if (!process.env.UPI_ID || !process.env.UPI_PAYEE_NAME) {
  console.warn('[UPI] WARNING: UPI_ID or UPI_PAYEE_NAME env vars are not set. Payment QR codes will be broken.')
}

export const UPI_CONFIG = {
  upiId: process.env.UPI_ID || '',
  payeeName: process.env.UPI_PAYEE_NAME || 'StreamVault',
  phoneNumber: process.env.UPI_PHONE_NUMBER || '',
  currency: 'INR',
}


export const SUBSCRIPTION_PLANS = {
  intro: {
    name: 'New Member Offer — 3 Months',
    price: 100, // ₹100
    currency: 'INR',
    period: 'quarterly',
    durationDays: 90,
    // Only redeemable once per account — enforced in routes/subscriptions.ts.
    firstTimeOnly: true,
    features: [
        'HD Streaming',
        'Download Movies & TV',
        '4K Ultra HD Support',
        'One-time offer for new members'
    ],
  },
  monthly: {
    name: '1 Month Premium',
    price: 175, // ₹175
    currency: 'INR',
    period: 'monthly',
    durationDays: 30,
    features: [
        'HD Streaming',
        'Download Movies & TV',
        'Highest Quality Available',
        'Smooth Ad-free Experience'
    ],
  },
} as const
