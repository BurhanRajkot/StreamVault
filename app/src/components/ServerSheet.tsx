import { useNavigate } from 'react-router-dom'
import { motion } from 'framer-motion'
import { AlertTriangle, Check, Lock, Zap } from 'lucide-react'
import { CONFIG, DEBRID_SERVER_ID, serverOptions } from '@/lib/config'
import { usePremiumAccess } from '@/hooks/usePremiumAccess'
import { cn } from '@/lib/utils'
import { spring } from '@app/lib/motion'
import { Sheet } from './Sheet'

export function useServerOptions(kind: 'movie' | 'tv') {
  const { premium } = usePremiumAccess()
  return serverOptions(kind, { unlocked: premium })
}

/** A server's display name — "Premium" for Real-Debrid. */
export function serverName(id: string): string {
  return id === DEBRID_SERVER_ID ? 'Premium' : CONFIG.PROVIDER_NAMES[id] ?? 'Sol'
}

/**
 * Every server, Sol first and ⚡ Premium last — the website's same lineup.
 * `failed` marks the ones that already didn't start this time, so the next
 * pick is obvious.
 */
export function ServerList({
  kind,
  server,
  onPick,
  failed,
  onLocked,
}: {
  kind: 'movie' | 'tv'
  server: string
  onPick: (server: string) => void
  failed?: ReadonlySet<string>
  onLocked?: () => void
}) {
  const navigate = useNavigate()
  const options = useServerOptions(kind)
  return (
    <ul className="flex flex-col gap-1.5">
      {options.map((option, i) => {
        const isPremium = option.id === DEBRID_SERVER_ID
        const meta = CONFIG.PROVIDER_METADATA[option.id]
        const active = option.id === server
        const didFail = !active && failed?.has(option.id)
        return (
          <motion.li key={option.id} initial={{ opacity: 0, x: 16 }} animate={{ opacity: 1, x: 0 }} transition={{ ...spring, delay: i * 0.03 }}>
            <button
              onClick={() => {
                if (option.locked) {
                  onLocked?.()
                  navigate('/premium')
                  return
                }
                onPick(option.id)
              }}
              className={cn(
                'press relative flex w-full items-center gap-3 overflow-hidden rounded-2xl px-3.5 py-3 text-left transition-colors',
                active ? 'bg-primary/[0.16] ring-1 ring-primary/60' : 'bg-white/[0.045] hover:bg-white/[0.08]',
                isPremium && !active && 'bg-gradient-to-r from-amber-500/[0.12] to-transparent ring-1 ring-amber-400/25'
              )}
            >
              <span
                className={cn(
                  'font-display flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-[14px] font-extrabold',
                  isPremium ? 'bg-amber-400/15 text-amber-300' : active ? 'bg-primary text-white' : 'bg-white/[0.08] text-white/80'
                )}
              >
                {isPremium ? <Zap className="h-[18px] w-[18px]" /> : option.name.slice(0, 2)}
              </span>
              <span className="min-w-0 flex-1">
                <span className="flex items-center gap-2 text-[14.5px] font-bold">
                  {option.name}
                  {option.detail && <span className="rounded-md bg-white/10 px-1.5 py-px text-[10px] font-bold tracking-wide text-white/75">{option.detail}</span>}
                  {i === 0 && !isPremium && <span className="rounded-md bg-emerald-400/15 px-1.5 py-px text-[10px] font-bold tracking-wide text-emerald-300">DEFAULT</span>}
                </span>
                <span className={cn('mt-0.5 block truncate text-[11.5px]', didFail ? 'text-amber-300/90' : 'text-white/50')}>
                  {didFail
                    ? 'Didn’t start just now'
                    : isPremium
                      ? option.locked ? 'Invite only — tap to get Premium' : 'Real-Debrid · our own player, subtitles, downloads'
                      : meta?.quality}
                </span>
              </span>
              {option.locked ? (
                <Lock className="h-4 w-4 text-white/40" />
              ) : active ? (
                <motion.span initial={{ scale: 0 }} animate={{ scale: 1 }} transition={spring} className="flex h-6 w-6 items-center justify-center rounded-full bg-primary">
                  <Check className="h-4 w-4 text-white" strokeWidth={3} />
                </motion.span>
              ) : didFail ? (
                <AlertTriangle className="h-4 w-4 text-amber-300/70" />
              ) : null}
            </button>
          </motion.li>
        )
      })}
    </ul>
  )
}

/** The lineup as one row of chips — the title screen's "Play on". */
export function ServerChips({ kind, server, onPick, layoutId = 'server-chip' }: { kind: 'movie' | 'tv'; server: string; onPick: (server: string) => void; layoutId?: string }) {
  const navigate = useNavigate()
  const options = useServerOptions(kind)
  return (
    <div className="no-scrollbar -mx-4 flex gap-1.5 overflow-x-auto px-4 lg:mx-0 lg:flex-wrap lg:px-0">
      {options.map((option) => {
        const active = option.id === server
        const isPremium = option.id === DEBRID_SERVER_ID
        return (
          <button
            key={option.id}
            onClick={() => (option.locked ? navigate('/premium') : onPick(option.id))}
            className={cn(
              'press relative flex shrink-0 items-center gap-1.5 rounded-full px-3.5 py-2 text-[12.5px] font-bold transition-colors',
              active ? 'text-white' : isPremium ? 'text-amber-300 ring-1 ring-inset ring-amber-400/30 hover:bg-amber-400/10' : 'text-white/65 ring-1 ring-inset ring-white/12 hover:bg-white/[0.06] hover:text-white'
            )}
          >
            {active && <motion.span layoutId={layoutId} transition={spring} className="absolute inset-0 -z-10 rounded-full bg-primary" />}
            {isPremium && (option.locked ? <Lock className="h-3.5 w-3.5" /> : <Zap className="h-3.5 w-3.5" />)}
            {option.name}
            {option.detail && <span className={cn('text-[10px] font-bold', active ? 'text-white/80' : 'text-white/40')}>{option.detail}</span>}
          </button>
        )
      })}
    </div>
  )
}

export function ServerSheet({
  open,
  onOpenChange,
  kind,
  server,
  onPick,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  kind: 'movie' | 'tv'
  server: string
  onPick: (server: string) => void
}) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange} title="Choose a server" description="If one doesn't play, try the next.">
      <ServerList
        kind={kind}
        server={server}
        onLocked={() => onOpenChange(false)}
        onPick={(id) => {
          onPick(id)
          onOpenChange(false)
        }}
      />
    </Sheet>
  )
}
