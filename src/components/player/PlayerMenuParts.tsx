/** Rows of the player's settings menu (PlayerControls, SubtitleMenu). */

import type { ReactNode } from 'react'
import { ChevronLeft, ChevronRight } from 'lucide-react'

export function MenuRow({
  label,
  value,
  chevron,
  icon,
  onClick,
}: {
  label: string
  value?: string
  chevron?: boolean
  icon?: ReactNode
  onClick: () => void
}) {
  return (
    <button
      onClick={onClick}
      className="flex w-full items-center justify-between gap-4 px-4 py-2.5 text-left transition-colors hover:bg-white/10 focus-visible:bg-white/10 focus-visible:outline-none"
    >
      <span>{label}</span>
      <span className="flex min-w-0 items-center gap-1 text-white/60">
        <span className="truncate">{value}</span>
        {chevron && <ChevronRight className="h-4 w-4 shrink-0" />}
        {icon}
      </span>
    </button>
  )
}

export function MenuHeader({ title, onBack }: { title: string; onBack: () => void }) {
  return (
    <button
      onClick={onBack}
      className="mb-1 flex w-full shrink-0 items-center gap-2 border-b border-white/10 px-3 pb-2.5 pt-1.5 text-left font-semibold transition-colors hover:text-white/80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-white/60"
    >
      <ChevronLeft className="h-4 w-4" />
      {title}
    </button>
  )
}
