import { useState, useEffect } from 'react'
import { Helmet } from 'react-helmet-async'
import { Check, Sparkles, Zap, Loader2, Crown, QrCode } from 'lucide-react'
import { Link, useNavigate } from 'react-router-dom'
import { Button } from '@/components/ui/button'
import { Footer } from '@/components/Footer'
import { useToast } from '@/hooks/use-toast'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { useAuth0 } from '@auth0/auth0-react'

interface Plan {
  id: string
  name: string
  price: number
  currency: string
  period: string
  features: string[]
  qrCode?: string
  upiId?: string
}

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:4000'

export default function Pricing() {
  const [plans, setPlans] = useState<Plan[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedPlan, setSelectedPlan] = useState<Plan | null>(null)
  const [transactionId, setTransactionId] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const navigate = useNavigate()
  const { toast } = useToast()
  const { user, isAuthenticated, loginWithRedirect } = useAuth0()

  useEffect(() => {
    fetchPlans()
  }, [])

  const fetchPlans = async () => {
    try {
      const res = await fetch(`${API_URL}/subscriptions/plans`)
      if (!res.ok) throw new Error('Failed to fetch plans')
      const data = await res.json()
      setPlans(data.plans)
    } catch (err) {
      setError('Unable to load subscription plans')
    } finally {
      setLoading(false)
    }
  }

  const handleSelectPlan = (plan: Plan) => {
    if (!isAuthenticated) {
      loginWithRedirect({
        appState: { returnTo: '/pricing' }
      })
      return
    }
    setSelectedPlan(plan)
  }

  const handleSubmitPayment = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!selectedPlan || !transactionId) return

    setSubmitting(true)
    try {
      const res = await fetch(`${API_URL}/subscriptions/manual-request`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: user?.sub,
          email: user?.email,
          planId: selectedPlan.id,
          transactionId: transactionId
        }),
      })

      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.error || 'Failed to submit request')
      }

      toast({
        title: 'Payment Submitted',
        description: 'Your request is under review. Please allow 1-2 hours for approval.',
      })

      setSelectedPlan(null)
      navigate('/subscription/success?manual=true')
    } catch (err: any) {
      toast({
        title: 'Submission Failed',
        description: err.message,
        variant: 'destructive',
      })
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <>
      <Helmet>
        <title>Pricing - StreamVault</title>
      </Helmet>

      <div className="min-h-screen flex flex-col bg-gradient-to-br from-background via-background to-primary/5">
        <header className="border-b border-border/40 bg-background/80 backdrop-blur-xl">
          <div className="mx-auto max-w-7xl px-4 py-4 flex items-center justify-between">
            <Link to="/" className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-xl bg-gradient-to-br from-violet-500 to-fuchsia-500 flex items-center justify-center">
                <Sparkles className="h-5 w-5 text-white" />
              </div>
              <span className="text-xl font-bold">
                <span className="bg-gradient-to-r from-violet-400 to-fuchsia-400 bg-clip-text text-transparent">Stream</span>
                <span className="text-foreground">Vault</span>
              </span>
            </Link>
            <Link to="/">
              <Button variant="ghost" size="sm">Back to Home</Button>
            </Link>
          </div>
        </header>

        <main className="flex-1 py-16 px-4">
          <div className="mx-auto max-w-5xl">
            <div className="text-center mb-16">
              <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-violet-500/10 border border-violet-500/20 mb-6">
                <Crown className="h-4 w-4 text-violet-400" />
                <span className="text-sm font-medium text-violet-400">Choose Your Experience</span>
              </div>
              <h1 className="text-4xl md:text-5xl font-bold mb-4 bg-gradient-to-r from-white via-violet-200 to-fuchsia-200 bg-clip-text text-transparent">
                Unlock Premium Streaming
              </h1>
              <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
                Experience cinema-quality streaming with our flexible subscription plans
              </p>
            </div>

            {loading && (
              <div className="flex justify-center py-20">
                <Loader2 className="h-8 w-8 animate-spin text-violet-400" />
              </div>
            )}

            {error && (
              <div className="text-center py-10">
                <p className="text-destructive mb-4">{error}</p>
                <Button onClick={fetchPlans} variant="outline">Retry</Button>
              </div>
            )}

            {!loading && !error && (
              <div className="grid md:grid-cols-2 gap-8 max-w-4xl mx-auto">
                {plans.map((plan, index) => {
                  const isPremium = plan.id === 'quarterly'
                  return (
                    <div
                      key={plan.id}
                      className={`relative rounded-2xl p-8 transition-all duration-300 hover:scale-[1.02] ${
                        isPremium
                          ? 'bg-gradient-to-br from-violet-500/20 via-fuchsia-500/10 to-background border-2 border-violet-500/40 shadow-2xl shadow-violet-500/20'
                          : 'bg-card/50 border border-border/50 hover:border-border'
                      }`}
                      style={{ animationDelay: `${index * 100}ms` }}
                    >
                      {isPremium && (
                        <div className="absolute -top-4 left-1/2 -translate-x-1/2 px-4 py-1.5 rounded-full bg-gradient-to-r from-violet-500 to-fuchsia-500 text-xs font-semibold text-white">
                          MOST POPULAR
                        </div>
                      )}

                      <div className="flex items-center gap-3 mb-6">
                        <div className={`h-12 w-12 rounded-xl flex items-center justify-center ${
                          isPremium
                            ? 'bg-gradient-to-br from-violet-500 to-fuchsia-500'
                            : 'bg-secondary'
                        }`}>
                          {isPremium ? <Sparkles className="h-6 w-6 text-white" /> : <Zap className="h-6 w-6 text-muted-foreground" />}
                        </div>
                        <div>
                          <h2 className="text-xl font-bold">{plan.name}</h2>
                          <p className="text-sm text-muted-foreground">
                            {isPremium ? 'Ultimate experience' : 'Great for starters'}
                          </p>
                        </div>
                      </div>

                      <div className="mb-8">
                        <div className="flex items-baseline gap-1">
                          <span className="text-4xl font-bold">₹{plan.price}</span>
                          <span className="text-muted-foreground">/month</span>
                        </div>
                      </div>

                      <ul className="space-y-4 mb-8">
                        {plan.features.map((feature) => (
                          <li key={feature} className="flex items-center gap-3">
                            <div className={`h-5 w-5 rounded-full flex items-center justify-center ${
                              isPremium ? 'bg-violet-500/20' : 'bg-secondary'
                            }`}>
                              <Check className={`h-3 w-3 ${isPremium ? 'text-violet-400' : 'text-muted-foreground'}`} />
                            </div>
                            <span className="text-sm">{feature}</span>
                          </li>
                        ))}
                      </ul>

                      <Button
                        onClick={() => handleSelectPlan(plan)}
                        className={`w-full h-12 font-semibold ${
                          isPremium
                            ? 'bg-gradient-to-r from-violet-500 to-fuchsia-500 hover:from-violet-600 hover:to-fuchsia-600 text-white shadow-lg shadow-violet-500/25'
                            : ''
                        }`}
                        variant={isPremium ? 'default' : 'secondary'}
                      >
                        <QrCode className="mr-2 h-4 w-4" />
                        Pay via UPI
                      </Button>
                    </div>
                  )
                })}
              </div>
            )}

            <div className="mt-16 text-center">
              <p className="text-sm text-muted-foreground">
                Secure manual payments. Access granted after verification.
              </p>
            </div>
          </div>
        </main>

        <Footer />
      </div>

      <Dialog open={!!selectedPlan} onOpenChange={(open) => !open && setSelectedPlan(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Pay via UPI</DialogTitle>
            <DialogDescription>
              Scan the QR code below using any UPI app (GPay, PhonePe, Paytm).
            </DialogDescription>
          </DialogHeader>

          {selectedPlan && (
             <div className="space-y-6">
               <div className="flex flex-col items-center justify-center p-6 bg-white rounded-xl">
                 {/* QR Code from Backend */}
                  <div className="bg-white p-2 rounded-lg shadow-sm border">
                     {selectedPlan.qrCode ? (
                        <img
                            src={selectedPlan.qrCode}
                            alt="UPI QR Code"
                            className="w-48 h-48"
                        />
                     ) : (
                        <div className="w-48 h-48 flex items-center justify-center bg-gray-100 text-gray-400 text-xs">
                            QR Code Unavailable
                        </div>
                     )}
                  </div>
                  <p className="mt-2 text-sm text-gray-500 font-mono bg-gray-100 px-3 py-1 rounded">
                     UPI ID: {selectedPlan.upiId || 'gamershomeyt0520@oksbi'}
                  </p>
                  <div className="mt-4 text-center">
                     <p className="text-lg font-bold text-gray-900">₹{selectedPlan.price}</p>
                     <p className="text-xs text-gray-500">Amount to pay</p>
                  </div>
               </div>

              <form onSubmit={handleSubmitPayment} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="transactionId">Transaction ID (UTR)</Label>
                  <Input
                    id="transactionId"
                    placeholder="Enter 12-digit UTR number"
                    value={transactionId}
                    onChange={(e) => setTransactionId(e.target.value)}
                    required
                    minLength={12}
                    maxLength={12}
                  />
                  <p className="text-xs text-muted-foreground">
                    You can find the UTR number in your payment app after successful transaction.
                  </p>
                </div>

                <div className="flex gap-2">
                    <Button type="button" variant="outline" className="flex-1" onClick={() => setSelectedPlan(null)}>
                        Cancel
                    </Button>
                    <Button type="submit" className="flex-1" disabled={submitting}>
                        {submitting ? (
                            <>
                            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                            Verifying...
                            </>
                        ) : (
                            'Submit Payment'
                        )}
                    </Button>
                </div>
              </form>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  )
}
