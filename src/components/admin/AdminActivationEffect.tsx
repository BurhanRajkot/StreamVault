import { useEffect } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { ShieldCheck } from 'lucide-react'

interface AdminActivationEffectProps {
  active: boolean
  onComplete: () => void
}

/**
 * Full-screen "droplet" reveal played once, right after a successful admin
 * login. A shield drops in, hits center, and the impact ripples outward in
 * an amber/violet wash — signalling the switch into admin mode before the
 * dashboard underneath is revealed. Purely presentational; the caller still
 * owns auth state and decides what to render once `onComplete` fires.
 */
export function AdminActivationEffect({ active, onComplete }: AdminActivationEffectProps) {
  useEffect(() => {
    if (!active) return
    const timer = window.setTimeout(onComplete, 1350)
    return () => window.clearTimeout(timer)
  }, [active, onComplete])

  return (
    <AnimatePresence>
      {active && (
        <motion.div
          className="pointer-events-none fixed inset-0 z-[100] flex items-center justify-center overflow-hidden"
          initial={{ opacity: 1 }}
          exit={{ opacity: 0, transition: { duration: 0.35 } }}
        >
          {/* Ripple rings expanding from the impact point, like a droplet hitting water */}
          {[0, 0.15, 0.3, 0.45].map((delay, i) => (
            <motion.span
              key={delay}
              className="absolute rounded-full border-2"
              style={{
                borderColor: i % 2 === 0 ? 'rgba(245, 197, 90, 0.55)' : 'rgba(167, 139, 250, 0.5)',
              }}
              initial={{ width: 0, height: 0, opacity: 0.9 }}
              animate={{
                width: ['0px', '1600px'],
                height: ['0px', '1600px'],
                opacity: [0.9, 0],
              }}
              transition={{ duration: 1.1, delay, ease: 'easeOut' }}
            />
          ))}

          {/* Radial color wash that floods the screen then fades */}
          <motion.div
            className="absolute inset-0"
            style={{
              background:
                'radial-gradient(circle at 50% 50%, rgba(245,197,90,0.35) 0%, rgba(124,58,237,0.22) 35%, transparent 70%)',
            }}
            initial={{ opacity: 0, scale: 0.3 }}
            animate={{ opacity: [0, 1, 0], scale: [0.3, 1.4, 1.6] }}
            transition={{ duration: 1.2, ease: 'easeOut' }}
          />

          {/* The droplet itself: falls in, then bursts into the shield */}
          <motion.div
            className="relative flex flex-col items-center gap-3"
            initial={{ y: -220, opacity: 0, scale: 0.6 }}
            animate={{
              y: [-220, 0, 0],
              opacity: [0, 1, 1],
              scale: [0.6, 1.15, 1],
            }}
            transition={{ duration: 0.55, ease: [0.34, 1.56, 0.64, 1] }}
          >
            <motion.div
              className="flex h-24 w-24 items-center justify-center rounded-full shadow-[0_0_60px_rgba(245,197,90,0.55)]"
              style={{
                background: 'linear-gradient(135deg, #f5c55a 0%, #a78bfa 100%)',
              }}
              animate={{ boxShadow: ['0 0 60px rgba(245,197,90,0.55)', '0 0 90px rgba(167,139,250,0.65)', '0 0 20px rgba(245,197,90,0.2)'] }}
              transition={{ duration: 1.1, delay: 0.2 }}
            >
              <ShieldCheck className="h-11 w-11 text-black/80" strokeWidth={2.25} />
            </motion.div>

            <motion.p
              className="text-sm font-semibold uppercase tracking-[0.3em] text-white"
              style={{ textShadow: '0 0 18px rgba(245,197,90,0.6)' }}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: [0, 1, 1, 0], y: 0 }}
              transition={{ duration: 1.2, delay: 0.15 }}
            >
              Admin Mode Activated
            </motion.p>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}

export default AdminActivationEffect
