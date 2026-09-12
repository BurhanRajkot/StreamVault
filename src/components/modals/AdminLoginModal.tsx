import { useState } from 'react'
import { X, Loader2, ShieldCheck, Hash } from 'lucide-react'
import { adminLogin, setAdminToken } from '@/lib/api'
import { cn, errorMessage } from '@/lib/utils'
import { AdminActivationEffect } from '@/components/effects/AdminActivationEffect'

interface AdminLoginModalProps {
  isOpen: boolean
  onClose: () => void
  onSuccess: () => void
}

const AdminLoginModal = ({ isOpen, onClose, onSuccess }: AdminLoginModalProps) => {
  const [code, setCode] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [activating, setActivating] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')

    // Client-side validation
    if (!code) {
      setError('Please enter your authenticator code')
      return
    }

    if (code.length !== 6) {
      setError('Code must be 6 digits')
      return
    }

    setLoading(true)

    try {
      const response = await adminLogin(code)

      // Store token
      setAdminToken(response.token)

      // Clear form
      setCode('')

      // Play the activation effect before handing control back — onSuccess/
      // onClose fire once it completes, in handleActivationComplete.
      setActivating(true)
    } catch (err: unknown) {
      console.error('Admin login error:', err)
      setError(errorMessage(err, 'Invalid code. Please try again.'))
    } finally {
      setLoading(false)
    }
  }

  const handleActivationComplete = () => {
    setActivating(false)
    onSuccess()
    onClose()
  }

  const handleClose = () => {
    if (!loading && !activating) {
      setCode('')
      setError('')
      onClose()
    }
  }

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <AdminActivationEffect active={activating} onComplete={handleActivationComplete} />

      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        onClick={handleClose}
        role="button"
        tabIndex={0}
      />

      {/* Modal */}
      <div
        className={cn(
          'relative w-full max-w-md rounded-2xl border border-border/50 bg-card/95 p-8 shadow-2xl',
          'backdrop-blur-xl backdrop-saturate-150',
          'animate-in fade-in-0 zoom-in-95 duration-300'
        )}
      >
        {/* Close Button */}
        <button
          onClick={handleClose}
          disabled={loading || activating}
          className={cn(
            'absolute right-4 top-4 rounded-lg p-2 text-muted-foreground transition-colors',
            'hover:bg-secondary hover:text-foreground',
            (loading || activating) && 'cursor-not-allowed opacity-50'
          )}
        >
          <X className="h-5 w-5" />
        </button>

        {/* Header */}
        <div className="mb-6 text-center">
          <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-primary/10">
            <ShieldCheck className="h-8 w-8 text-primary" />
          </div>
          <h2 className="text-2xl font-bold text-foreground">Admin Access</h2>
          <p className="mt-2 text-sm text-muted-foreground">
            Enter the 6-digit code from your authenticator app
          </p>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Code Field */}
          <div>
            <label htmlFor="admin-code" className="mb-2 block text-sm font-medium text-foreground">
              Authenticator Code
            </label>
            <div className="relative">
              <Hash className="absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-muted-foreground" />
              <input
                id="admin-code"
                type="password"
                inputMode="numeric"
                value={code}
                onChange={(e) => {
                  const val = e.target.value.replace(/[^0-9]/g, '').slice(0, 6)
                  setCode(val)
                }}
                disabled={loading}
                placeholder="000000"
                maxLength={6}
                className={cn(
                  'h-12 w-full rounded-lg border bg-secondary/50 pl-11 pr-4 text-sm text-center tracking-[0.5em] text-lg font-mono',
                  'placeholder:text-muted-foreground/50 placeholder:tracking-[0.5em] placeholder:font-mono',
                  'focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20',
                  'disabled:cursor-not-allowed disabled:opacity-50',
                  'transition-all duration-200'
                )}
                autoComplete="one-time-code"
                autoFocus
              />
            </div>
            <p className="mt-1.5 text-xs text-muted-foreground">
              From Google Authenticator, Authy, 1Password, etc.
            </p>
          </div>

          {/* Error Message */}
          {error && (
            <div className="rounded-lg bg-destructive/10 p-3 text-sm text-destructive">
              {error}
            </div>
          )}

          {/* Submit Button */}
          <button
            type="submit"
            disabled={loading}
            className={cn(
              'h-12 w-full rounded-lg bg-primary font-medium text-primary-foreground',
              'hover:bg-primary/90 active:scale-[0.98]',
              'disabled:cursor-not-allowed disabled:opacity-50',
              'transition-all duration-200',
              'flex items-center justify-center gap-2'
            )}
          >
            {loading ? (
              <>
                <Loader2 className="h-5 w-5 animate-spin" />
                <span>Authenticating...</span>
              </>
            ) : (
              <span>Login</span>
            )}
          </button>
        </form>

        {/* Security Notice */}
        <div className="mt-6 rounded-lg bg-secondary/30 p-3 text-center">
          <p className="text-xs text-muted-foreground">
            🔒 Code refreshes every 30 seconds. Rate-limited to 3 attempts per 15 minutes.
          </p>
        </div>
      </div>
    </div>
  )
}

export default AdminLoginModal
