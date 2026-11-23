import { useNavigate } from 'react-router-dom'
import { motion } from 'framer-motion'
import { AlertTriangle, Check, Lock, Zap } from 'lucide-react'
import { CONFIG, DEBRID_SERVER_ID } from '@/lib/config'
import { usePremiumAccess } from '@/hooks/usePremiumAccess'
import { cn } from '@/lib/utils'
import { spring } from '@app/lib/motion'
import { appServerOptions } from '@app/lib/servers'
import { IconTile } from './kit'
import { Sheet } from './Sheet'

export function useServerOptions(kind: 'movie' | 'tv') {
  const { premium } = usePremiumAccess()
  return appServerOptions(kind, { unlocked: premium })
}

/** A server's display name — "Premium" for Real-Debrid. */
export function serverName(id: string): string {
  return id === DEBRID_SERVER_ID ? 'Premium' : CONFIG.PROVIDER_NAMES[id] ?? 'Player'
}

/**
 * The app's two servers — the embed first, ⚡ Premium last (see servers.ts).
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
    <div className="glass-card overflow-hidden rounded-[16px]">
      {options.map((option, i) => {
        const isPremium = option.id === DEBRID_SERVER_ID
        const meta = CONFIG.PROVIDER_METADATA[option.id]
        const active = option.id === server
        const didFail = !active && failed?.has(option.id)
        return (
          <button
            key={option.id}
            type="button"
            onClick={() => {
              if (option.locked) {
                onLocked?.()
                navigate('/premium')
                return
              }
              onPick(option.id)
            }}
            className="tap cell-sep-inset relative flex min-h-[58px] w-full items-center gap-3 px-4 py-2.5 text-left"
            style={{ '--sep-inset': '58px' } as React.CSSProperties}
          >
            <IconTile color={isPremium ? 'yellow' : active ? 'blue' : 'graphite'}>
              {isPremium ? <Zap className="fill-current" /> : <span className="text-[13px] font-semibold">{option.name.slice(0, 1)}</span>}
            </IconTile>
            <span className="min-w-0 flex-1">
              <span className="t-body flex items-center gap-2">
                {option.name}
                {option.detail && <span className="rounded-[5px] bg-fill px-1.5 text-[11px] font-semibold leading-[18px] text-white/80">{option.detail}</span>}
                {i === 0 && !isPremium && <span className="text-[12px] font-medium text-label-2">Default</span>}
              </span>
              <span className={cn('t-footnote mt-0.5 block truncate', didFail ? 'text-ios-orange' : 'text-label-2')}>
                {didFail
                  ? 'Didn’t start just now'
                  : isPremium
                    ? option.locked ? 'Invite only — tap to get Premium' : 'Real-Debrid · our own player, subtitles, downloads'
                    : meta?.quality}
              </span>
            </span>
            {option.locked ? (
              <Lock className="h-4 w-4 shrink-0 text-label-3" />
            ) : active ? (
              <motion.span initial={{ scale: 0.6, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={spring}>
                <Check className="h-5 w-5 text-tint" strokeWidth={2.6} />
              </motion.span>
            ) : didFail ? (
              <AlertTriangle className="h-4 w-4 shrink-0 text-ios-orange" />
            ) : null}
          </button>
        )
      })}
    </div>
  )
}

/** The lineup as one row of chips — the title screen's "Play on". */
export function ServerChips({ kind, server, onPick, layoutId = 'server-chip' }: { kind: 'movie' | 'tv'; server: string; onPick: (server: string) => void; layoutId?: string }) {
  const navigate = useNavigate()
  const options = useServerOptions(kind)
  return (
    <div className="no-scrollbar -mx-4 flex gap-2 overflow-x-auto px-4 lg:mx-0 lg:flex-wrap lg:px-0">
      {options.map((option) => {
        const active = option.id === server
        const isPremium = option.id === DEBRID_SERVER_ID
        return (
          <button
            key={option.id}
            onClick={() => (option.locked ? navigate('/premium') : onPick(option.id))}
            className={cn(
              'press relative z-0 flex h-8 shrink-0 items-center gap-1.5 rounded-full px-3.5 text-[14px] font-semibold transition-colors',
              active ? 'text-black' : 'bg-fill text-white/85 hover:bg-[rgb(118_118_128/0.32)]'
            )}
          >
            {active && <motion.span layoutId={layoutId} transition={spring} className="absolute inset-0 -z-10 rounded-full bg-white" />}
            {isPremium && (option.locked ? <Lock className="h-3.5 w-3.5" /> : <Zap className={cn('h-3.5 w-3.5 fill-current', !active && 'text-ios-yellow')} />)}
            {option.name}
            {option.detail && <span className={cn('text-[11px] font-semibold', active ? 'text-black/55' : 'text-label-2')}>{option.detail}</span>}
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
