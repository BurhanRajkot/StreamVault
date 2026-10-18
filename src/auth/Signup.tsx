import { useEffect } from 'react'
import { useAuth0 } from '@auth0/auth0-react'
import { Link, useNavigate } from 'react-router-dom'
import { Helmet } from 'react-helmet-async'
import { AuthButton, AuthLayout, BenefitList } from './AuthLayout'

export default function Signup() {
  const { loginWithRedirect, isAuthenticated, isLoading } = useAuth0()
  const navigate = useNavigate()

  useEffect(() => {
    if (isAuthenticated) navigate('/')
  }, [isAuthenticated, navigate])

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
        <title>Sign Up – StreamVault</title>
      </Helmet>

      <AuthLayout>
        <h1 className="mb-3 text-[34px] font-bold leading-[1.1] tracking-tight text-white xl:text-[40px]">
          Create your account
        </h1>
        <p className="mb-8 text-[15px] leading-relaxed text-slate-400">It&apos;s free, and takes a few seconds.</p>
        <BenefitList />
        <AuthButton onClick={() => void loginWithRedirect({ authorizationParams: { screen_hint: 'signup' } })}>
          Create account
        </AuthButton>
        <p className="mt-6 text-center text-sm text-slate-400">
          Already have an account?{' '}
          <Link to="/login" className="font-semibold text-blue-400 underline-offset-4 hover:text-blue-300 hover:underline">
            Sign in
          </Link>
        </p>
      </AuthLayout>
    </>
  )
}
