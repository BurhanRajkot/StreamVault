import { useEffect, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { Helmet } from 'react-helmet-async'
import { CheckCircle2, Clock, Loader2, XCircle } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Footer } from '@/components/Footer'

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:4000'

interface PaymentDetails {
  id: string
  amount: number
  currency: string
  status: string
  method: string
  email: string
  createdAt: number
}

export default function SubscriptionSuccess() {
  const [searchParams] = useSearchParams()
  const navigate = useNavigate()
  const [loading, setLoading] = useState(true)
  const isManual = searchParams.get('manual') === 'true'
  const [error, setError] = useState<string | null>(null)
  const [paymentDetails, setPaymentDetails] = useState<PaymentDetails | null>(null)

  useEffect(() => {
    // If it's manual, we don't verify immediately
    if (isManual) {
        setLoading(false)
        return
    }

    const paymentId = searchParams.get('payment_id')
    if (paymentId) {
      verifyPayment(paymentId)
    } else {
      setError('No payment ID found')
      setLoading(false)
    }
  }, [searchParams, isManual])

  const verifyPayment = async (paymentId: string) => {
    try {
      const res = await fetch(`${API_URL}/subscriptions/payment/${paymentId}`)
      if (!res.ok) throw new Error('Failed to fetch payment details')

      const data = await res.json()
      setPaymentDetails(data)
    } catch (err) {
      setError('Unable to verify payment')
    } finally {
      setLoading(false)
    }
  }

  return (
    <>
      <Helmet>
        <title>{isManual ? 'Payment Submitted - StreamVault' : 'Subscription Success - StreamVault'}</title>
      </Helmet>

      <div className="min-h-screen flex flex-col bg-gradient-to-br from-background via-background to-primary/5">
        <main className="flex-1 flex items-center justify-center px-4 py-16">
          <div className="max-w-2xl w-full">
            {loading && (
              <div className="text-center">
                <Loader2 className="h-16 w-16 animate-spin text-violet-400 mx-auto mb-6" />
                <h2 className="text-2xl font-bold mb-2">Processing...</h2>
                {!isManual && <p className="text-muted-foreground">Please wait while we confirm your subscription</p>}
              </div>
            )}

            {!loading && isManual && (
              <div className="text-center">
                <div className="h-20 w-20 rounded-full bg-blue-500/10 flex items-center justify-center mx-auto mb-6">
                  <Clock className="h-10 w-10 text-blue-500" />
                </div>
                <h1 className="text-3xl md:text-4xl font-bold mb-4 bg-gradient-to-r from-white via-violet-200 to-fuchsia-200 bg-clip-text text-transparent">
                  Payment Submitted
                </h1>
                <p className="text-lg text-muted-foreground mb-8">
                  Your request has been received and is under review.
                </p>

                <div className="bg-card/50 border border-border/50 rounded-xl p-6 mb-8 text-left">
                  <h3 className="font-semibold mb-4">What happens next?</h3>
                  <ul className="space-y-3 text-sm text-muted-foreground list-disc pl-5">
                    <li>Our team will verify your transaction ID.</li>
                    <li>This process typically takes <strong>1-2 hours</strong>.</li>
                    <li>Your subscription will be activated automatically upon approval.</li>
                    <li>If there are any issues, we will contact you via email.</li>
                  </ul>
                </div>

                <div className="flex gap-4 justify-center">
                  <Button onClick={() => navigate('/')} size="lg" className="bg-gradient-to-r from-violet-500 to-fuchsia-500 hover:from-violet-600 hover:to-fuchsia-600">
                    Return Home
                  </Button>
                </div>
              </div>
            )}

            {error && (
              <div className="text-center">
                <div className="h-20 w-20 rounded-full bg-destructive/10 flex items-center justify-center mx-auto mb-6">
                  <XCircle className="h-10 w-10 text-destructive" />
                </div>
                <h2 className="text-2xl font-bold mb-2">Payment Verification Failed</h2>
                <p className="text-muted-foreground mb-8">{error}</p>
                <div className="flex gap-4 justify-center">
                  <Button onClick={() => navigate('/pricing')} variant="outline">
                    Back to Pricing
                  </Button>
                  <Button onClick={() => navigate('/')}>
                    Go Home
                  </Button>
                </div>
              </div>
            )}

            {!loading && !error && paymentDetails && !isManual && (
              <div className="text-center">
                <div className="h-20 w-20 rounded-full bg-green-500/10 flex items-center justify-center mx-auto mb-6">
                  <CheckCircle2 className="h-10 w-10 text-green-500" />
                </div>
                <h1 className="text-3xl md:text-4xl font-bold mb-4 bg-gradient-to-r from-white via-violet-200 to-fuchsia-200 bg-clip-text text-transparent">
                  Payment Successful!
                </h1>
                <p className="text-lg text-muted-foreground mb-8">
                  Your subscription is now active
                </p>

                <div className="bg-card/50 border border-border/50 rounded-xl p-6 mb-8 text-left">
                  <h3 className="font-semibold mb-4">Payment Details</h3>
                  <div className="space-y-3 text-sm">
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Payment ID:</span>
                      <span className="font-mono">{paymentDetails.id}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Amount:</span>
                      <span className="font-semibold">
                        {paymentDetails.currency} {(paymentDetails.amount / 100).toFixed(2)}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Status:</span>
                      <span className="text-green-500 capitalize">{paymentDetails.status}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Payment Method:</span>
                      <span className="capitalize">{paymentDetails.method}</span>
                    </div>
                    {paymentDetails.email && (
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Email:</span>
                        <span>{paymentDetails.email}</span>
                      </div>
                    )}
                  </div>
                </div>

                <div className="flex gap-4 justify-center">
                  <Button onClick={() => navigate('/')} size="lg" className="bg-gradient-to-r from-violet-500 to-fuchsia-500 hover:from-violet-600 hover:to-fuchsia-600">
                    Start Watching
                  </Button>
                </div>
              </div>
            )}
          </div>
        </main>

        <Footer />
      </div>
    </>
  )
}
