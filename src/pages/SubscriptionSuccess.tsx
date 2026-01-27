import { useState, useEffect } from 'react'
import { Helmet } from 'react-helmet-async'
import { useSearchParams, Link } from 'react-router-dom'
import { CheckCircle2, Loader2, XCircle, Sparkles, ArrowRight } from 'lucide-react'
import { Button } from '@/components/ui/button'

interface SessionDetails {
  status: string
  customerEmail: string
  subscriptionStatus: string
  subscriptionId: string
  currentPeriodEnd: number
}

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:4000'

export default function SubscriptionSuccess() {
  const [searchParams] = useSearchParams()
  const sessionId = searchParams.get('session_id')
  
  const [loading, setLoading] = useState(true)
  const [session, setSession] = useState<SessionDetails | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (sessionId) {
      fetchSession()
    } else {
      setError('No session ID found')
      setLoading(false)
    }
  }, [sessionId])

  const fetchSession = async () => {
    try {
      const res = await fetch(`${API_URL}/subscriptions/session/${sessionId}`)
      if (!res.ok) throw new Error('Failed to fetch session')
      const data = await res.json()
      setSession(data)
    } catch (err) {
      setError('Unable to verify subscription')
    } finally {
      setLoading(false)
    }
  }

  const formatDate = (timestamp: number) => {
    return new Date(timestamp * 1000).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    })
  }

  return (
    <>
      <Helmet>
        <title>Subscription Confirmed - StreamVault</title>
      </Helmet>

      <div className="min-h-screen flex flex-col items-center justify-center bg-gradient-to-br from-background via-background to-violet-500/5 px-4">
        <div className="w-full max-w-md">
          {loading && (
            <div className="text-center py-20">
              <Loader2 className="h-12 w-12 animate-spin text-violet-400 mx-auto mb-4" />
              <p className="text-muted-foreground">Verifying your subscription...</p>
            </div>
          )}

          {error && (
            <div className="text-center py-20">
              <div className="h-16 w-16 rounded-full bg-destructive/10 flex items-center justify-center mx-auto mb-6">
                <XCircle className="h-8 w-8 text-destructive" />
              </div>
              <h1 className="text-2xl font-bold mb-2">Something went wrong</h1>
              <p className="text-muted-foreground mb-6">{error}</p>
              <Button asChild>
                <Link to="/pricing">Try Again</Link>
              </Button>
            </div>
          )}

          {!loading && !error && session && (
            <div className="text-center animate-in fade-in-0 slide-in-from-bottom-4 duration-500">
              <div className="relative mb-8">
                <div className="h-20 w-20 rounded-full bg-gradient-to-br from-violet-500 to-fuchsia-500 flex items-center justify-center mx-auto shadow-2xl shadow-violet-500/40">
                  <CheckCircle2 className="h-10 w-10 text-white" />
                </div>
                <div className="absolute -top-2 -right-2 h-8 w-8 rounded-full bg-gradient-to-br from-amber-400 to-orange-500 flex items-center justify-center">
                  <Sparkles className="h-4 w-4 text-white" />
                </div>
              </div>

              <h1 className="text-3xl font-bold mb-3 bg-gradient-to-r from-white to-violet-200 bg-clip-text text-transparent">
                Welcome to StreamVault!
              </h1>
              <p className="text-muted-foreground mb-8">
                Your subscription is now active
              </p>

              <div className="bg-card/50 rounded-2xl border border-border/50 p-6 mb-8 text-left">
                <div className="space-y-4">
                  <div className="flex justify-between items-center pb-4 border-b border-border/50">
                    <span className="text-sm text-muted-foreground">Status</span>
                    <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-emerald-500/10 text-emerald-400 text-sm font-medium">
                      <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
                      Active
                    </span>
                  </div>
                  {session.customerEmail && (
                    <div className="flex justify-between items-center">
                      <span className="text-sm text-muted-foreground">Email</span>
                      <span className="text-sm font-medium">{session.customerEmail}</span>
                    </div>
                  )}
                  {session.currentPeriodEnd && (
                    <div className="flex justify-between items-center">
                      <span className="text-sm text-muted-foreground">Next billing</span>
                      <span className="text-sm font-medium">{formatDate(session.currentPeriodEnd)}</span>
                    </div>
                  )}
                </div>
              </div>

              <div className="space-y-3">
                <Button asChild size="lg" className="w-full bg-gradient-to-r from-violet-500 to-fuchsia-500 hover:from-violet-600 hover:to-fuchsia-600">
                  <Link to="/" className="flex items-center gap-2">
                    Start Watching
                    <ArrowRight className="h-4 w-4" />
                  </Link>
                </Button>
                <Button asChild variant="ghost" size="sm" className="w-full">
                  <Link to="/pricing">Manage Subscription</Link>
                </Button>
              </div>
            </div>
          )}
        </div>
      </div>
    </>
  )
}
