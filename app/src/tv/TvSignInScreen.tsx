import { useEffect, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { useAuth0 } from '@auth0/auth0-react'
import { toast } from 'sonner'
import { Loader2, RefreshCw, Smartphone } from 'lucide-react'
import { startTvLink, waitForTvLink, type TvLinkStatus } from '@/lib/api'
import { SITE_URL } from '@app/native/platform'
import { Button } from '@app/components/kit'
import { QrCode } from './QrCode'

type Step = 'starting' | 'waiting' | 'opened' | 'finishing' | 'error'

/** Where the phone goes — short enough to type off the screen. */
const ACTIVATE_HOST = SITE_URL.replace(/^https:\/\//, '')

/**
 * Signing in on a TV, with the viewer's phone. A TV has no browser and
 * Google refuses sign-ins inside the app, so the TV starts an ordinary
 * Auth0 sign-in, puts its address behind a short code (backend
 * routes/tvLink.ts) and shows the code; the phone signs in at
 * stream-vault.site/activate, and the TV finishes the sign-in itself — the
 * PKCE verifier never leaves it. A code lasts 10 minutes; a new one comes up
 * by itself after that.
 */
export function TvSignInScreen() {
  const { loginWithRedirect, handleRedirectCallback, isAuthenticated } = useAuth0()
  const navigate = useNavigate()
  const location = useLocation()
  const returnTo = (location.state as { returnTo?: string } | null)?.returnTo
  const [attempt, setAttempt] = useState(0)
  const [code, setCode] = useState<string | null>(null)
  const [step, setStep] = useState<Step>('starting')
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (isAuthenticated && step !== 'finishing') navigate(returnTo || '/me', { replace: true })
  }, [isAuthenticated, step, navigate, returnTo])

  useEffect(() => {
    const controller = new AbortController()
    let cancelled = false
    void (async () => {
      setStep('starting')
      setError(null)
      setCode(null)
      try {
        // The sign-in starts here (its PKCE verifier stays in this app); the phone only gets its address
        let authorizeUrl = ''
        await loginWithRedirect({
          appState: { returnTo },
          openUrl: (url) => {
            authorizeUrl = url
          },
        })
        const link = await startTvLink(authorizeUrl)
        if (cancelled) return
        setCode(link.code)
        setStep('waiting')
        const deadline = Date.now() + link.expiresIn * 1000
        let seen: TvLinkStatus | undefined
        while (!cancelled) {
          let answer: { status: TvLinkStatus; search?: string }
          try {
            answer = await waitForTvLink(link.code, link.secret, seen, controller.signal)
          } catch (err) {
            if (cancelled) return
            // A dropped connection isn't the end: ask again shortly
            if (err instanceof TypeError && Date.now() < deadline) {
              await new Promise((resolve) => setTimeout(resolve, 3000))
              continue
            }
            throw err
          }
          if (cancelled) return
          if (answer.status === 'expired' || Date.now() > deadline) {
            setAttempt((n) => n + 1)
            return
          }
          if (answer.status === 'opened') setStep('opened')
          if (answer.status === 'done' && answer.search) {
            const params = new URLSearchParams(answer.search)
            if (params.has('error')) throw new Error(params.get('error_description') || 'Sign-in was cancelled on the phone')
            setStep('finishing')
            const result = await handleRedirectCallback(`${SITE_URL}/${answer.search}`)
            const back = (result?.appState as { returnTo?: string } | undefined)?.returnTo
            toast.success('Signed in')
            navigate(back || '/me', { replace: true })
            return
          }
          seen = answer.status
        }
      } catch (err) {
        if (cancelled) return
        // A code is good for one sign-in: this one is spent
        setCode(null)
        setError(`${err instanceof Error ? err.message : 'Sign-in failed'} — get a new code to try again.`)
        setStep('error')
        requestAnimationFrame(() => document.querySelector<HTMLElement>('[data-tv-retry]')?.focus())
      }
    })()
    return () => {
      cancelled = true
      controller.abort()
    }
    // Only a new attempt (an expired code, "Get a new code") starts over — not a re-render
  }, [attempt])

  const shownCode = code ? `${code.slice(0, 3)}-${code.slice(3)}` : '•••-•••'

  return (
    <div className="flex min-h-[100dvh] items-center justify-center px-12 pb-10 pt-[calc(var(--topbar-h)+24px)]">
      <div className="grid w-full max-w-[980px] grid-cols-[1fr_auto] items-center gap-16">
        <div>
          <p className="mb-3 flex items-center gap-2 text-[15px] font-semibold text-tint">
            <Smartphone className="h-[18px] w-[18px]" /> Sign in with your phone
          </p>
          <h1 className="mb-8 text-[38px] font-bold leading-[1.1] tracking-[-0.02em] text-white">Your list, your progress and Premium — on the TV</h1>
          <ol className="space-y-5 text-[19px] text-white/85">
            <li className="flex gap-4">
              <Num n={1} />
              <span>
                On your phone, go to <strong className="font-semibold text-white">{ACTIVATE_HOST}/activate</strong>
                <span className="block text-[15px] text-label-2">or scan the code with your phone’s camera</span>
              </span>
            </li>
            <li className="flex gap-4">
              <Num n={2} />
              <span>
                Enter
                <span
                  aria-live="polite"
                  aria-label={code ? `the code ${code.split('').join(' ')}` : 'the code, coming up'}
                  className="ml-3 inline-block rounded-[12px] bg-white/[0.08] px-4 py-1.5 align-middle font-mono text-[34px] font-bold tracking-[0.18em] text-white"
                >
                  {shownCode}
                </span>
              </span>
            </li>
            <li className="flex gap-4">
              <Num n={3} />
              <span>Sign in there — this TV signs in by itself</span>
            </li>
          </ol>

          <p role="status" className="mt-9 flex min-h-7 items-center gap-2.5 text-[16px] text-label-2">
            {step === 'error' ? (
              <span className="text-ios-red">{error}</span>
            ) : (
              <>
                <Loader2 className="h-[18px] w-[18px] animate-spin" />
                {step === 'starting' && 'Getting a code…'}
                {step === 'waiting' && 'Waiting for your phone…'}
                {step === 'opened' && 'Continue on your phone…'}
                {step === 'finishing' && 'Signing in…'}
              </>
            )}
          </p>

          <div className="mt-8 flex gap-3">
            <Button variant="gray" data-tv-retry onClick={() => setAttempt((n) => n + 1)}>
              <RefreshCw /> Get a new code
            </Button>
            <Button variant="glass" onClick={() => (window.history.state?.idx > 0 ? navigate(-1) : navigate('/me', { replace: true }))}>
              Not now
            </Button>
          </div>
        </div>

        <div className="flex flex-col items-center gap-3">
          {code ? (
            <QrCode value={`${SITE_URL}/activate?code=${code}`} label="QR code: opens the sign-in page on your phone" className="h-[260px] w-[260px]" />
          ) : (
            <div className="skeleton h-[260px] w-[260px] rounded-[14px]" />
          )}
          <p className="text-[14px] text-label-2">Scan to sign in</p>
        </div>
      </div>
    </div>
  )
}

function Num({ n }: { n: number }) {
  return (
    <span aria-hidden="true" className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-white/10 text-[15px] font-bold text-white">
      {n}
    </span>
  )
}
