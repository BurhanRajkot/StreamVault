import { useState, useEffect } from 'react'
import { PageMeta } from '@/seo/PageMeta'
import { Check, Sparkles, Repeat, Loader2, Crown, QrCode, ShieldCheck, Download, Clock } from 'lucide-react'
import { Link, useNavigate } from 'react-router-dom'
import { Button } from '@/components/ui/button'
import { Footer } from '@/components/layout/Footer'
import { toast } from 'sonner'
import { errorMessage } from '@/lib/utils'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion"
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

const BENEFITS = [
  { icon: Sparkles, label: '4K Ultra HD' },
  { icon: Download, label: 'Unlimited Downloads' },
  { icon: ShieldCheck, label: 'No Card Required' },
  { icon: Clock, label: 'Approved in ~1-2 hrs' },
]

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:4000'

export default function Pricing() {
  const [plans, setPlans] = useState<Plan[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedPlan, setSelectedPlan] = useState<Plan | null>(null)
  const [transactionId, setTransactionId] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const navigate = useNavigate()
  const { user, isAuthenticated, loginWithRedirect, getAccessTokenSilently } = useAuth0()

  useEffect(() => {
    fetchPlans()
  }, [])

  const fetchPlans = async () => {
    try {
      const res = await fetch(`${API_URL}/subscriptions/plans`)
      if (!res.ok) throw new Error('Failed to fetch plans')
      const data = await res.json()
      setPlans(Array.isArray(data) ? data : (data.plans ?? []))
    } catch (_err) {
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
      // Get the auth token so the backend can derive userId from JWT
      const headers: Record<string, string> = { 'Content-Type': 'application/json' }
      try {
        const token = await getAccessTokenSilently()
        headers['Authorization'] = `Bearer ${token}`
      } catch {
        // Proceed without token for unauthenticated users (backend handles null userId)
      }

      const res = await fetch(`${API_URL}/subscriptions/manual-request`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          // userId is intentionally omitted — backend derives it from the JWT
          email: user?.email,
          planId: selectedPlan.id,
          transactionId: transactionId
        }),
      })

      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.error || 'Failed to submit request')
      }

      toast.success('Payment Submitted', {
        description: 'Your request is under review. Please allow 1-2 hours for approval.',
      })

      setSelectedPlan(null)
      navigate('/subscription/success?manual=true')
    } catch (err: unknown) {
      toast.error('Submission Failed', {
        description: errorMessage(err, 'Could not submit your payment. Please try again.'),
      })
    } finally {
      setSubmitting(false)
    }
  }

  const monthlyPrice = plans.find((p) => p.period === 'monthly')?.price

  return (
    <>
      <PageMeta
        title="Pricing — Choose Your Plan"
        description="Unlock premium streaming on StreamVault. New members get 3 months for ₹100, then ₹175/month — unlimited access to movies, TV shows, and anime."
      />

      <div className="min-h-screen flex flex-col bg-gradient-to-br from-background via-background to-primary/5">
        <header className="border-b border-border/40 bg-background/80 backdrop-blur-xl">
          <div className="mx-auto max-w-7xl px-4 py-4 flex items-center justify-between">
            <Link to="/" className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-xl bg-gradient-to-br from-violet-500 to-fuchsia-500 flex items-center justify-center">
                <Sparkles className="h-5 w-5 text-white" />
              </div>
              <span className="text-xl font-bold text-foreground">
                Stream<span className="text-primary">Vault</span>
              </span>
            </Link>
            <Link to="/">
              <Button variant="ghost" size="sm">Back to Home</Button>
            </Link>
          </div>
        </header>

        <main className="flex-1 py-14 px-4">
          <div className="mx-auto max-w-5xl">
            <div className="text-center mb-10">
              <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-violet-500/10 border border-violet-500/20 mb-6">
                <Crown className="h-4 w-4 text-violet-400" />
                <span className="text-sm font-medium text-violet-400">Choose Your Experience</span>
              </div>
              <h1 className="text-4xl md:text-5xl font-bold mb-4 text-foreground">
                Unlock Premium Streaming
              </h1>
              <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
                Experience cinema-quality streaming with our flexible subscription plans
              </p>
            </div>

            {/* ── Benefits strip ── */}
            <div className="mx-auto mb-14 grid max-w-2xl grid-cols-2 gap-x-4 gap-y-6 sm:grid-cols-4">
              {BENEFITS.map(({ icon: Icon, label }) => (
                <div key={label} className="flex flex-col items-center gap-2 text-center">
                  <div className="flex h-10 w-10 items-center justify-center rounded-full bg-secondary">
                    <Icon className="h-5 w-5 text-primary" />
                  </div>
                  <span className="text-xs text-muted-foreground">{label}</span>
                </div>
              ))}
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
              <div>
                <div className="grid md:grid-cols-2 gap-8 max-w-4xl mx-auto items-stretch">
                  {plans.map((plan, index) => {
                    const isIntro = plan.id === 'intro'
                    const Icon = isIntro ? Sparkles : Repeat
                    return (
                      <div
                        key={plan.id}
                        className={`relative flex flex-col rounded-2xl p-8 transition-[transform,border-color,box-shadow] duration-300 hover:scale-[1.02] ${
                          isIntro
                            ? 'bg-gradient-to-br from-violet-500/20 via-fuchsia-500/10 to-background border-2 border-violet-500/40 shadow-2xl shadow-violet-500/20'
                            : 'bg-card/50 border border-border/50 hover:border-border'
                        }`}
                        style={{ animationDelay: `${index * 100}ms` }}
                      >
                        {isIntro && (
                          <div className="absolute -top-4 left-1/2 -translate-x-1/2 px-4 py-1.5 rounded-full bg-gradient-to-r from-violet-500 to-fuchsia-500 text-xs font-semibold text-white">
                            NEW MEMBER OFFER
                          </div>
                        )}

                        <div className="flex items-center gap-3 mb-6">
                          <div className={`h-12 w-12 rounded-xl flex items-center justify-center ${
                            isIntro
                              ? 'bg-gradient-to-br from-violet-500 to-fuchsia-500'
                              : 'bg-sky-500/15'
                          }`}>
                            <Icon className={`h-6 w-6 ${isIntro ? 'text-white' : 'text-sky-400'}`} />
                          </div>
                          <div>
                            <h2 className="text-xl font-bold">{plan.name}</h2>
                            <p className="text-sm text-muted-foreground">
                              {isIntro ? 'One-time offer for new members' : 'Renew anytime — no auto-charge'}
                            </p>
                          </div>
                        </div>

                        <div className="mb-2">
                          <div className="flex items-baseline gap-1">
                            <span className="text-4xl font-bold">₹{plan.price}</span>
                            <span className="text-muted-foreground">
                              {plan.period === 'monthly' ? '/month' : ' for 3 months'}
                            </span>
                          </div>
                        </div>

                        <p className="mb-6 text-xs text-muted-foreground">
                          {isIntro && monthlyPrice
                            ? `Then ₹${monthlyPrice}/month whenever you choose to continue.`
                            : 'Pick this plan any time — including right after your offer ends.'}
                        </p>

                        <ul className="space-y-4 mb-8 flex-1">
                          {plan.features.map((feature) => (
                            <li key={feature} className="flex items-center gap-3">
                              <div className={`h-5 w-5 rounded-full flex items-center justify-center ${
                                isIntro ? 'bg-violet-500/20' : 'bg-secondary'
                              }`}>
                                <Check className={`h-3 w-3 ${isIntro ? 'text-violet-400' : 'text-muted-foreground'}`} />
                              </div>
                              <span className="text-sm">{feature}</span>
                            </li>
                          ))}
                        </ul>

                        <Button
                          onClick={() => handleSelectPlan(plan)}
                          className={`w-full h-12 font-semibold ${
                            isIntro
                              ? 'bg-gradient-to-r from-violet-500 to-fuchsia-500 hover:from-violet-600 hover:to-fuchsia-600 text-white shadow-lg shadow-violet-500/25'
                              : ''
                          }`}
                          variant={isIntro ? 'default' : 'secondary'}
                        >
                          <QrCode className="mr-2 h-4 w-4" />
                          Pay via UPI
                        </Button>
                      </div>
                    )
                  })}
                </div>

                <p className="mx-auto mt-6 max-w-md text-center text-xs text-muted-foreground">
                  New here? Start with the 3-month offer. Already used it? Jump straight to monthly — pay only when you're ready.
                </p>
              </div>
            )}

            {/* ── Payment FAQ ── */}
            <div className="mx-auto mt-20 max-w-2xl">
              <h3 className="mb-2 text-center text-lg font-semibold text-foreground">Payment FAQ</h3>
              <p className="mb-6 text-center text-sm text-muted-foreground">
                Secure manual payments — no third-party gateway, access granted after verification.
              </p>
              <Accordion type="single" collapsible className="rounded-xl border border-border/50 bg-card/40 px-2">
                <AccordionItem value="how">
                  <AccordionTrigger className="px-4 text-sm">How do I pay?</AccordionTrigger>
                  <AccordionContent className="px-4 text-sm text-muted-foreground">
                    Pick a plan, scan the QR code with any UPI app (GPay, PhonePe, Paytm, or your bank app),
                    and pay the exact amount shown. Then copy the UTR/transaction ID from your payment app
                    and submit it here.
                  </AccordionContent>
                </AccordionItem>
                <AccordionItem value="speed">
                  <AccordionTrigger className="px-4 text-sm">How long does approval take?</AccordionTrigger>
                  <AccordionContent className="px-4 text-sm text-muted-foreground">
                    We manually verify every transaction ID against the payment received, usually within
                    1-2 hours. Your account is upgraded automatically the moment it's approved.
                  </AccordionContent>
                </AccordionItem>
                <AccordionItem value="safety">
                  <AccordionTrigger className="px-4 text-sm">Is this safe? Why no card payment?</AccordionTrigger>
                  <AccordionContent className="px-4 text-sm text-muted-foreground">
                    We never ask for card numbers, passwords, or OTPs — you pay directly via UPI to our
                    listed ID, the same way you'd pay any shop or friend. There's no third-party payment
                    gateway involved at all.
                  </AccordionContent>
                </AccordionItem>
              </Accordion>
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
                  {selectedPlan.upiId && (
                    <p className="mt-2 text-sm text-gray-700 font-mono bg-gray-100 px-3 py-1 rounded">
                      UPI ID: {selectedPlan.upiId}
                    </p>
                  )}
                  <div className="mt-4 text-center">
                     <p className="text-lg font-bold text-gray-900">₹{selectedPlan.price}</p>
                     <p className="text-xs text-gray-700">Amount to pay</p>
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
