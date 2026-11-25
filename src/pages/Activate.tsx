import { useState, type FormEvent } from 'react'
import { useSearchParams } from 'react-router-dom'
import { CircleAlert, CircleCheck, Tv } from 'lucide-react'
import { PageMeta } from '@/seo/PageMeta'
import { AuthButton, AuthLayout } from '@/auth/AuthLayout'
import { openTvLink } from '@/lib/api'
import { TV_CODE_KEY, tvSignInRecord } from '@/lib/appSignIn'

/** "ABC234" → "ABC-234" while typing; letters and digits only. */
function formatCode(value: string): string {
  const raw = value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6)
  return raw.length > 3 ? `${raw.slice(0, 3)}-${raw.slice(3)}` : raw
}

/**
 * stream-vault.site/activate — signing in the TV app from a phone.
 *
 * The TV shows a code (and a QR code that opens this page with it filled
 * in). This page looks the code up, remembers it for this tab and goes to
 * the TV's own Auth0 sign-in; when Auth0 comes back, lib/appSignIn.ts hands
 * the answer to the TV and lands here again with ?linked=1.
 */
export default function Activate() {
  const [params, setParams] = useSearchParams()
  const linked = params.get('linked')
  const [code, setCode] = useState(() => formatCode(params.get('code') ?? ''))
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const fromQr = !!params.get('code')
  const complete = code.replace('-', '').length === 6

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    if (!complete || busy) return
    setBusy(true)
    setError(null)
    try {
      const { authorizeUrl } = await openTvLink(code.replace('-', ''))
      try {
        sessionStorage.setItem(TV_CODE_KEY, tvSignInRecord(code.replace('-', ''), authorizeUrl))
        sessionStorage.removeItem('sv-app-signin-port')
      } catch {
        throw new Error('This browser blocks site storage, which signing in needs. Try another browser.')
      }
      window.location.assign(authorizeUrl)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong. Try again.')
      setBusy(false)
    }
  }

  return (
    <>
      <PageMeta title="Sign in on your TV" noindex />
      <AuthLayout>
        {linked === '1' ? (
          <div role="status">
            <CircleCheck className="mb-5 h-12 w-12 text-emerald-400" strokeWidth={2} />
            <h1 className="mb-3 text-[30px] font-bold leading-[1.15] tracking-tight text-white">Your TV is signing in</h1>
            <p className="text-[15px] leading-relaxed text-slate-400">
              StreamVault on your TV will be ready in a moment. You can close this page.
            </p>
          </div>
        ) : linked === '0' ? (
          <div role="alert">
            <CircleAlert className="mb-5 h-12 w-12 text-amber-400" strokeWidth={2} />
            <h1 className="mb-3 text-[30px] font-bold leading-[1.15] tracking-tight text-white">That didn’t work</h1>
            <p className="mb-8 text-[15px] leading-relaxed text-slate-400">{params.get('reason') || 'The TV didn’t get the sign-in.'}</p>
            <AuthButton onClick={() => setParams({}, { replace: true })}>Try again</AuthButton>
          </div>
        ) : (
          <form onSubmit={submit} noValidate>
            <Tv className="mb-5 h-11 w-11 text-blue-500" strokeWidth={2} />
            <h1 className="mb-3 text-[30px] font-bold leading-[1.15] tracking-tight text-white">Sign in on your TV</h1>
            <p className="mb-8 text-[15px] leading-relaxed text-slate-400">
              {fromQr ? 'Check that this is the code on your TV, then sign in here.' : 'Enter the code shown on your TV, then sign in here.'}
            </p>
            <label htmlFor="tv-code" className="mb-2 block text-[13px] font-medium text-slate-300">
              Code
            </label>
            <input
              id="tv-code"
              value={code}
              onChange={(e) => {
                setCode(formatCode(e.target.value))
                setError(null)
              }}
              autoFocus={!fromQr}
              autoComplete="one-time-code"
              autoCapitalize="characters"
              autoCorrect="off"
              spellCheck={false}
              maxLength={7}
              placeholder="ABC-234"
              aria-invalid={!!error}
              aria-describedby={error ? 'tv-code-error' : undefined}
              className="mb-3 h-14 w-full rounded-lg border border-white/10 bg-white/[0.04] text-center font-mono text-[28px] font-semibold tracking-[0.25em] text-white placeholder:text-white/20 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/30"
            />
            {error && (
              <p id="tv-code-error" role="alert" className="mb-3 text-[14px] text-amber-300">
                {error}
              </p>
            )}
            <button
              type="submit"
              disabled={!complete || busy}
              className="mt-3 flex h-12 w-full items-center justify-center rounded-lg bg-white text-[15px] font-semibold text-black transition-colors hover:bg-white/90 disabled:cursor-not-allowed disabled:opacity-40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400 focus-visible:ring-offset-2 focus-visible:ring-offset-[#020617]"
            >
              {busy ? 'Opening sign-in…' : 'Continue'}
            </button>
          </form>
        )}
      </AuthLayout>
    </>
  )
}
