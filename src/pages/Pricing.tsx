import { useState, useEffect } from 'react'
import { PageMeta } from '@/seo/PageMeta'
import { Check, Sparkles, Repeat, Loader2, QrCode, ShieldCheck, Download, Clock, Clapperboard, Zap } from 'lucide-react'
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
import { formatPromoDate, useDebridFreeUntil } from '@/hooks/useDebridPromo'

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
  const freeUntil = useDebridFreeUntil()

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

      <div className="flex min-h-screen flex-col bg-background">
        <header className="border-b border-border/40">
          <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-4">
            <Link to="/" className="flex items-center gap-2" aria-label="StreamVault home">
              <Clapperboard className="h-6 w-6 text-primary" strokeWidth={2.5} />
              <span className="text-xl font-bold tracking-tight text-foreground">
                Stream<span className="text-primary">Vault</span>
              </span>
            </Link>
            <Button asChild variant="ghost" size="sm">
              <Link to="/">Back to home</Link>
            </Button>
          </div>
        </header>

        <main className="flex-1 px-4 py-14">
          <div className="mx-auto max-w-5xl">
            <div className="mb-10 text-center">
              <h1 className="mb-4 text-4xl font-bold text-foreground md:text-5xl">Unlock Premium Streaming</h1>
              <p className="mx-auto max-w-2xl text-lg text-muted-foreground">
                4K and 1080p on the Premium server, plus downloads. Pay once by UPI — no card, no auto-renewal.
              </p>
            </div>

            {/* While Premium is free for everyone, say so — nobody should pay for what they already have */}
            {freeUntil && (
              <div className="mx-auto mb-12 flex max-w-2xl items-start gap-3 rounded-xl border border-border bg-card px-5 py-4 text-left">
                <Zap className="mt-0.5 h-5 w-5 shrink-0 fill-amber-400 text-amber-400" aria-hidden="true" />
                <p className="text-sm leading-relaxed text-muted-foreground">
                  <span className="font-semibold text-foreground">
                    Premium streaming is free for everyone until {formatPromoDate(freeUntil)}.
                  </span>{' '}
                  You don&apos;t need a plan to watch. A plan adds downloads, and keeps Premium after the offer ends.
                </p>
              </div>
            )}

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
                <Loader2 className="h-8 w-8 animate-spin text-primary" />
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
                <div className="mx-auto grid max-w-4xl items-stretch gap-6 md:grid-cols-2">
                  {plans.map((plan) => {
                    const isIntro = plan.id === 'intro'
                    const Icon = isIntro ? Sparkles : Repeat
                    return (
                      <div
                        key={plan.id}
                        className={`relative flex flex-col rounded-2xl bg-card p-8 ${
                          isIntro ? 'border-2 border-primary' : 'border border-border'
                        }`}
                      >
                        {isIntro && (
                          <div className="absolute -top-3.5 left-1/2 -translate-x-1/2 rounded-full bg-primary px-3.5 py-1 text-xs font-semibold text-primary-foreground">
                            New members
                          </div>
                        )}

                        <div className="mb-6 flex items-center gap-3">
                          <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-primary/10">
                            <Icon className="h-6 w-6 text-primary" />
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
                              <div className="flex h-5 w-5 items-center justify-center rounded-full bg-primary/10">
                                <Check className="h-3 w-3 text-primary" />
                              </div>
                              <span className="text-sm">{feature}</span>
                            </li>
                          ))}
                        </ul>

                        <Button
                          onClick={() => handleSelectPlan(plan)}
                          className="h-12 w-full font-semibold"
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
