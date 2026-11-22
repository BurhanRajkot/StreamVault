/**
 * The website's F1 archive pieces, shared by its three pages (pages/F1,
 * F1Race, F1Watch): the page chrome, the season picker, the results switch
 * and the race card. The app draws its own (app/src/screens/F1*).
 */

import type { ReactNode } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Eye, EyeOff, Trophy } from 'lucide-react'
import { Header } from '@/components/layout/Header'
import { MobileNav } from '@/components/layout/MobileNav'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { MODE_PATHS } from '@/lib/config'
import { cn } from '@/lib/utils'
import { f1RacePath, formatF1Date, isUpcoming, seasonYears, type F1Race } from '@/lib/f1'

export const f1Gutter = 'mx-auto w-full max-w-[1400px] px-[var(--sv-gutter)]'

/** The site's header and phone tab bar around an F1 page. */
export function F1Chrome({ children }: { children: ReactNode }) {
  const navigate = useNavigate()
  return (
    <div className="flex min-h-screen flex-col">
      <Header
        onModeChange={(m) => navigate(MODE_PATHS[m])}
        // The header searches every title — the home page shows the results
        onSearch={(q) => navigate('/', { state: { search: q } })}
        searchQuery=""
        onClearSearch={() => {}}
        onLogoClick={() => navigate('/')}
      />
      <MobileNav onModeChange={(m) => navigate(MODE_PATHS[m])} />
      {children}
    </div>
  )
}

export function SeasonSelect({ year, onChange }: { year: number; onChange: (year: number) => void }) {
  return (
    <Select value={String(year)} onValueChange={(v) => onChange(Number(v))}>
      <SelectTrigger aria-label="Season" className="h-10 w-[7.5rem] rounded-full bg-secondary/40 font-semibold tabular-nums">
        <SelectValue />
      </SelectTrigger>
      <SelectContent className="max-h-80">
        {seasonYears().map((y) => (
          <SelectItem key={y} value={String(y)} className="tabular-nums">
            {y}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}

/** Shows or hides who won — off by default, so a race isn't spoilt before it's watched. */
export function ResultsToggle({ show, onChange }: { show: boolean; onChange: (show: boolean) => void }) {
  return (
    <button
      type="button"
      aria-pressed={show}
      onClick={() => onChange(!show)}
      className={cn(
        'inline-flex h-10 items-center gap-2 rounded-full border px-4 text-sm font-medium transition-colors',
        show ? 'border-primary/40 bg-primary/10 text-foreground' : 'border-border/60 bg-secondary/40 text-muted-foreground hover:text-foreground'
      )}
    >
      {show ? <Eye className="h-4 w-4" aria-hidden="true" /> : <EyeOff className="h-4 w-4" aria-hidden="true" />}
      {show ? 'Results shown' : 'Results hidden'}
    </button>
  )
}

export function WinnerLine({ winner, className }: { winner: NonNullable<F1Race['winner']>; className?: string }) {
  return (
    <p className={cn('flex min-w-0 items-center gap-1.5 text-sm', className)}>
      <Trophy className="h-3.5 w-3.5 shrink-0 text-amber-400" aria-hidden="true" />
      <span className="truncate">
        <span className="font-medium text-foreground">{winner.driver}</span>
        {winner.team && <span className="text-muted-foreground"> · {winner.team}</span>}
      </span>
    </p>
  )
}

/** One race weekend in the season grid. */
export function RaceCard({ year, race, showResults }: { year: number; race: F1Race; showResults: boolean }) {
  const upcoming = isUpcoming({ date: race.date, time: race.time })
  const sprint = race.sessions.some((s) => s.key === 'sprint')
  return (
    <Link
      to={f1RacePath(year, race.round)}
      className="group flex gap-4 rounded-2xl border border-border/60 bg-secondary/25 p-4 transition-colors hover:border-primary/40 hover:bg-secondary/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      <span className="w-10 shrink-0 text-right text-[28px] font-bold leading-none tracking-tight text-primary/85 tabular-nums">
        {race.round}
      </span>
      <span className="min-w-0 flex-1">
        <span className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
          <span>{formatF1Date(race.date)}</span>
          {upcoming && <span className="rounded-full bg-primary/15 px-2 py-0.5 text-[11px] font-semibold text-primary">Upcoming</span>}
          {sprint && <span className="rounded-full bg-foreground/[0.08] px-2 py-0.5 text-[11px] font-semibold text-foreground/80">Sprint</span>}
        </span>
        <span className="mt-1 block truncate text-[15px] font-semibold text-foreground group-hover:text-primary">{race.name}</span>
        <span className="mt-0.5 block truncate text-sm text-muted-foreground">
          {[race.locality, race.country].filter(Boolean).join(', ')}
        </span>
        {showResults && race.winner && !upcoming && <WinnerLine winner={race.winner} className="mt-2" />}
      </span>
    </Link>
  )
}
