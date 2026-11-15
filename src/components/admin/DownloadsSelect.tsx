import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { cn } from '@/lib/utils'

const LEVELS = ['allowed', 'paused'] as const
type Level = (typeof LEVELS)[number]

const LABELS: Record<'short' | 'long', Record<Level, string>> = {
  short: { allowed: 'Allowed', paused: 'Paused' },
  long: { allowed: 'Downloads allowed', paused: 'Downloads paused' },
}

interface DownloadsSelectProps {
  /** May this account save Premium's file (Real-Debrid download, open in VLC). */
  allowed: boolean
  onChange: (allowed: boolean) => void
  /** Who it's for, as the control's accessible name says: "Premium downloads for <who>". */
  who: string
  disabled?: boolean
  /** Say "Downloads …" in the control itself — where no column heading does. */
  long?: boolean
  className?: string
}

/**
 * Allow or pause one account's ⚡ Premium downloads. Paused, the account
 * still streams; the player just stops offering the file. Magnet links
 * aren't affected.
 */
export function DownloadsSelect({ allowed, onChange, who, disabled, long = false, className }: DownloadsSelectProps) {
  const labels = LABELS[long ? 'long' : 'short']
  return (
    <Select value={allowed ? 'allowed' : 'paused'} onValueChange={(value) => onChange(value === 'allowed')} disabled={disabled}>
      <SelectTrigger className={cn('h-8', long ? 'w-44' : 'w-28', className)} aria-label={`Premium downloads for ${who}`}>
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {LEVELS.map((level) => (
          <SelectItem key={level} value={level}>
            {labels[level]}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}
