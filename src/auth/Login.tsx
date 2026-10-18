import { useEffect } from 'react'
import { useAuth0 } from '@auth0/auth0-react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { Helmet } from 'react-helmet-async'
import { AuthButton, AuthLayout, BenefitList } from './AuthLayout'

/**
 * Where to go after signing in: the page that sent the viewer here, if it's
 * one of ours. Only same-site paths — "//evil.com" and "/\evil.com" are
 * other sites to a browser.
 */
function safeReturnTo(value: string | null): string {
  if (!value || !value.startsWith('/') || value.startsWith('//') || value.startsWith('/\\')) return '/'
  return value
}

export default function Login() {
  const { loginWithRedirect, isAuthenticated, isLoading } = useAuth0()
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const returnTo = safeReturnTo(searchParams.get('returnTo'))

  useEffect(() => {
    if (isAuthenticated) navigate(returnTo, { replace: true })
  }, [isAuthenticated, navigate, returnTo])

  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#020617]">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-blue-500 border-t-transparent" />
      </div>
    )
  }

  return (
    <>
      <Helmet>
        <title>Sign In – StreamVault</title>
      </Helmet>

      <AuthLayout>
        <h1 className="mb-3 text-[34px] font-bold leading-[1.1] tracking-tight text-white xl:text-[40px]">Welcome back</h1>
        <p className="mb-8 text-[15px] leading-relaxed text-slate-400">
          Sign in to pick up where you left off, on any device.
        </p>
        <BenefitList />
        <AuthButton onClick={() => void loginWithRedirect({ appState: { returnTo } })}>Sign in</AuthButton>
        <p className="mt-6 text-center text-sm text-slate-400">
          New to StreamVault?{' '}
          <Link to="/signup" className="font-semibold text-blue-400 underline-offset-4 hover:text-blue-300 hover:underline">
            Create an account
          </Link>
        </p>
      </AuthLayout>
    </>
  )
}
