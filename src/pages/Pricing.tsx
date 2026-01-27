import { useState, useEffect } from 'react'
import { Helmet } from 'react-helmet-async'
import { Check, Sparkles, Zap, Loader2, Crown } from 'lucide-react'
import { Link } from 'react-router-dom'
import { Button } from '@/components/ui/button'
import { Footer } from '@/components/Footer'

interface Plan {
  id: string
  priceId: string
  name: string
  price: number
  features: string[]
}

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:4000'

export default function Pricing() {
  const [plans, setPlans] = useState<Plan[]>([])
  const [loading, setLoading] = useState(true)
  const [checkoutLoading, setCheckoutLoading] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

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

  const handleSubscribe = async (priceId: string, planId: string) => {
    setCheckoutLoading(planId)
    try {
      const res = await fetch(`${API_URL}/subscriptions/create-checkout-session`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ priceId }),
      })
      
      if (!res.ok) throw new Error('Failed to create checkout session')
      
      const data = await res.json()
      if (data.url) {
        window.location.href = data.url
      }
    } catch (err) {
      setError('Failed to start checkout')
      setCheckoutLoading(null)
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
                  const isPremium = plan.id === 'premium'
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
                          <span className="text-4xl font-bold">₹{(plan.price / 100).toFixed(0)}</span>
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
                        onClick={() => handleSubscribe(plan.priceId, plan.id)}
                        disabled={checkoutLoading !== null}
                        className={`w-full h-12 font-semibold ${
                          isPremium
                            ? 'bg-gradient-to-r from-violet-500 to-fuchsia-500 hover:from-violet-600 hover:to-fuchsia-600 text-white shadow-lg shadow-violet-500/25'
                            : ''
                        }`}
                        variant={isPremium ? 'default' : 'secondary'}
                      >
                        {checkoutLoading === plan.id ? (
                          <Loader2 className="h-5 w-5 animate-spin" />
                        ) : (
                          `Subscribe to ${plan.id === 'basic' ? 'Basic' : 'Premium'}`
                        )}
                      </Button>
                    </div>
                  )
                })}
              </div>
            )}

            <div className="mt-16 text-center">
              <p className="text-sm text-muted-foreground">
                Cancel anytime. All plans include a 7-day free trial.
              </p>
            </div>
          </div>
        </main>

        <Footer />
      </div>
    </>
  )
}
