import type { ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion } from 'framer-motion'
import { ArrowLeft } from 'lucide-react'
import { EASE_OUT } from '@app/lib/motion'

/** A screen's big title: it rises in, with an optional phone back button and actions on the right. */
export function PageHeader({ title, subtitle, back, actions }: { title: string; subtitle?: ReactNode; back?: boolean; actions?: ReactNode }) {
  const navigate = useNavigate()
  return (
    <motion.header
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, ease: EASE_OUT }}
      className="mb-6 flex items-end gap-3 lg:mb-8"
    >
      {back && (
        <button
          onClick={() => (window.history.state?.idx > 0 ? navigate(-1) : navigate('/me'))}
          aria-label="Back"
          className="press -ml-1.5 mb-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-white/[0.06] lg:hidden"
        >
          <ArrowLeft className="h-5 w-5" />
        </button>
      )}
      <div className="min-w-0 flex-1">
        <h1 className="font-display text-[28px] font-extrabold leading-tight tracking-tight lg:text-[40px]">{title}</h1>
        {subtitle && <p className="mt-1 text-[13.5px] text-white/55 lg:text-[15px]">{subtitle}</p>}
      </div>
      {actions}
    </motion.header>
  )
}

/** An empty state: an icon, a line and an action. */
export function EmptyState({ icon, title, text, action }: { icon: ReactNode; title: string; text: string; action?: ReactNode }) {
  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.96 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ duration: 0.5, ease: EASE_OUT }}
      className="flex flex-col items-center px-6 pt-14 text-center lg:pt-24"
    >
      <span className="mb-5 flex h-20 w-20 items-center justify-center rounded-full bg-white/[0.06] text-white/70">{icon}</span>
      <p className="font-display text-[20px] font-extrabold">{title}</p>
      <p className="mt-2 max-w-sm text-[13.5px] leading-relaxed text-white/55">{text}</p>
      {action && <div className="mt-6">{action}</div>}
    </motion.div>
  )
}
