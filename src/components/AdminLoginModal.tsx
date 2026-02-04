import { useState } from 'react'
import { X, Lock, Loader2, ShieldCheck, Hash } from 'lucide-react'
import { adminLogin, setAdminToken } from '@/lib/api'
import { cn } from '@/lib/utils'

interface AdminLoginModalProps {
  isOpen: boolean
  onClose: () => void
  onSuccess: () => void
}

const AdminLoginModal = ({ isOpen, onClose, onSuccess }: AdminLoginModalProps) => {
  const [code, setCode] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')

    // Client-side validation
    if (!code) {
      setError('Please enter the admin code')
      return
    }

    if (code.length < 4) {
      setError('Code must be at least 4 digits')
      return
    }

    setLoading(true)

    try {
      const response = await adminLogin(code)

      // Store token
      setAdminToken(response.token)

      // Clear form
      setCode('')

      // Call success callback
      onSuccess()

      // Close modal
      onClose()
    } catch (err: any) {
      console.error('Admin login error:', err)
      setError(err.message || 'Invalid code. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  const handleClose = () => {
    if (!loading) {
      setCode('')
      setError('')
      onClose()
    }
  }

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        onClick={handleClose}
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
          disabled={loading}
          className={cn(
            'absolute right-4 top-4 rounded-lg p-2 text-muted-foreground transition-colors',
            'hover:bg-secondary hover:text-foreground',
            loading && 'cursor-not-allowed opacity-50'
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
            Enter today's admin code to access downloads
          </p>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Code Field */}
          <div>
            <label htmlFor="admin-code" className="mb-2 block text-sm font-medium text-foreground">
              Admin Code
            </label>
            <div className="relative">
              <Hash className="absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-muted-foreground" />
              <input
                id="admin-code"
                type="text"
                value={code}
                onChange={(e) => {
                  // Allow numbers only
                  const val = e.target.value.replace(/[^0-9]/g, '')

                  // If user pastes/types a long number (likely the full calculation),
                  // take the last 6 digits automatically
                  if (val.length > 6) {
                     setCode(val.slice(-6))
                  } else {
                     setCode(val)
                  }
                }}
                disabled={loading}
                placeholder="123456"
                maxLength={20} // Allow typing more to let the auto-slice work
                className={cn(
                  'h-12 w-full rounded-lg border bg-secondary/50 pl-11 pr-4 text-sm text-center tracking-widest text-lg font-mono',
                  'placeholder:text-muted-foreground/50 placeholder:tracking-normal placeholder:font-sans',
                  'focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20',
                  'disabled:cursor-not-allowed disabled:opacity-50',
                  'transition-all duration-200'
                )}
                autoComplete="off"
                autoFocus
              />
            </div>
            <p className="mt-1.5 text-xs text-muted-foreground">
              💡 Formula: (Day × Month × Year × Secret) <strong>% 1,000,000</strong>
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
            🔒 Code changes daily. Rate-limited to 3 attempts per 15 minutes.
          </p>
        </div>
      </div>
    </div>
  )
}

export default AdminLoginModal
