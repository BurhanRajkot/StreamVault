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
  monthly: {
    name: '1 Month Premium',
    price: 70, // ₹70
    currency: 'INR',
    period: 'monthly',
    features: [
        'HD Streaming',
        'Download Movies & TV',
        'Highest Quality Available',
        'Smooth Ad-free Experience'
    ],
  },
  quarterly: {
    name: '3 Months Premium',
    price: 150, // ₹150
    currency: 'INR',
    period: 'quarterly',
    features: [
        'All Monthly Features',
        'Save ₹60 (Best Value)',
        '4K Ultra HD Support',
        'Priority Customer Support'
    ],
  },
} as const
