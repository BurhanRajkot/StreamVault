// UPI Payment Configuration
export const UPI_CONFIG = {
  upiId: process.env.UPI_ID || 'removed@upi',
  payeeName: process.env.UPI_PAYEE_NAME || 'Piracy Is Not Stealing',
  phoneNumber: process.env.UPI_PHONE_NUMBER || '0000000000',
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
