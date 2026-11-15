import { useNavigate } from 'react-router-dom'
import { Check, Lock, Zap } from 'lucide-react'
import { CONFIG, DEBRID_SERVER_ID, serverOptions } from '@/lib/config'
import { usePremiumAccess } from '@/hooks/usePremiumAccess'
import { cn } from '@/lib/utils'
import { Sheet } from './Sheet'

/** Every server, Sol first and ⚡ Premium last — the website's same lineup. */
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
  const navigate = useNavigate()
  const { premium } = usePremiumAccess()
  const options = serverOptions(kind, { unlocked: premium })

  return (
    <Sheet open={open} onOpenChange={onOpenChange} title="Choose a server" description="If one doesn't play, try the next.">
      <ul className="flex flex-col gap-1.5">
        {options.map((option) => {
          const isPremium = option.id === DEBRID_SERVER_ID
          const meta = CONFIG.PROVIDER_METADATA[option.id]
          const active = option.id === server
          return (
            <li key={option.id}>
              <button
                onClick={() => {
                  if (option.locked) {
                    onOpenChange(false)
                    navigate('/premium')
                    return
                  }
                  onPick(option.id)
                  onOpenChange(false)
                }}
                className={cn(
                  'press flex w-full items-center gap-3 rounded-xl px-3.5 py-3 text-left transition-colors',
                  active ? 'bg-primary/15 ring-1 ring-primary/50' : 'bg-white/[0.04]',
                  isPremium && !active && 'bg-gradient-to-r from-amber-500/10 to-transparent ring-1 ring-amber-400/20'
                )}
              >
                <span
                  className={cn(
                    'flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-[13px] font-bold',
                    isPremium ? 'bg-amber-400/15 text-amber-300' : 'bg-white/[0.07] text-white/80'
                  )}
                >
                  {isPremium ? <Zap className="h-4 w-4" /> : option.name.slice(0, 2)}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="flex items-center gap-2 text-[14px] font-semibold">
                    {option.name}
                    {option.detail && (
                      <span className="rounded bg-white/10 px-1.5 py-px text-[10px] font-bold tracking-wide text-white/75">{option.detail}</span>
                    )}
                  </span>
                  <span className="mt-0.5 block truncate text-[11.5px] text-white/50">
                    {isPremium
                      ? option.locked ? 'Invite only — tap to get Premium' : 'Real-Debrid · our own player, subtitles, downloads'
                      : meta?.quality}
                  </span>
                </span>
                {option.locked ? <Lock className="h-4 w-4 text-white/40" /> : active && <Check className="h-5 w-5 text-primary" />}
              </button>
            </li>
          )
        })}
      </ul>
    </Sheet>
  )
}
