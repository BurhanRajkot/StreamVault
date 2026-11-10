import { motion } from 'framer-motion'
import { ShieldCheck } from 'lucide-react'
import { cn } from '@/lib/utils'

interface AdminModeBadgeProps {
  className?: string
}

/**
 * Small persistent pill shown anywhere the admin session is active, so it's
 * always visually obvious you're operating with elevated access — not just
 * for a moment right after logging in.
 */
export function AdminModeBadge({ className }: AdminModeBadgeProps) {
  return (
    <motion.div
      initial={{ opacity: 0, y: -8, scale: 0.9 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ duration: 0.4, ease: 'easeOut' }}
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[11px] font-bold uppercase tracking-[0.15em] text-black/85',
        'shadow-[0_0_18px_rgba(245,197,90,0.45)]',
        className
      )}
      style={{
        background: 'linear-gradient(135deg, #f5c55a 0%, #a78bfa 100%)',
      }}
    >
      <motion.span
        animate={{ opacity: [1, 0.4, 1] }}
        transition={{ duration: 1.8, repeat: Infinity, ease: 'easeInOut' }}
        className="flex h-2 w-2 rounded-full bg-black/70"
      />
      <ShieldCheck className="h-3.5 w-3.5" strokeWidth={2.5} />
      Admin Mode
    </motion.div>
  )
}

export default AdminModeBadge
