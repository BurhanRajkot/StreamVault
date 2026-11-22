/**
 * The website's F1 archive pieces, shared by its three pages (pages/F1,
 * F1Race, F1Watch): the page chrome, the season picker, the results switch
 * and the race card. The app draws its own (app/src/screens/F1*).
 */

import type { ReactNode } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { ChevronRight, Eye, EyeOff, Play, Trophy } from 'lucide-react'
import { Header } from '@/components/layout/Header'
import { MobileNav } from '@/components/layout/MobileNav'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { MODE_PATHS } from '@/lib/config'
import { cn } from '@/lib/utils'
import { countryCode, f1RacePath, formatF1Date, isUpcoming, seasonYears, type F1Race } from '@/lib/f1'

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

/** One race weekend in the season list: country code, name, date and place. */
export function RaceRow({ year, race, showResults }: { year: number; race: F1Race; showResults: boolean }) {
  const upcoming = isUpcoming({ date: race.date, time: race.time })
  const sprint = race.sessions.some((s) => s.key === 'sprint')
  return (
    <Link
      to={f1RacePath(year, race.round)}
      className={cn(
        'group flex items-center gap-3.5 px-4 py-3 transition-colors hover:bg-secondary/50 focus-visible:bg-secondary/50 focus-visible:outline-none',
        upcoming && 'opacity-60'
      )}
    >
      <span className="flex h-10 w-11 shrink-0 flex-col items-center justify-center rounded-lg bg-secondary/70">
        <span className="text-[12px] font-extrabold leading-none tracking-wide text-foreground">{countryCode(race.country)}</span>
        <span className="mt-1 text-[9px] font-semibold leading-none text-muted-foreground">R{race.round}</span>
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[15px] font-semibold text-foreground group-hover:text-primary">{race.name}</span>
        {showResults && race.winner && !upcoming ? (
          <WinnerLine winner={race.winner} className="mt-0.5 text-xs" />
        ) : (
          <span className="mt-0.5 block truncate text-xs text-muted-foreground">
            {formatF1Date(race.date)} · {[race.locality, race.country].filter(Boolean).join(', ')}
          </span>
        )}
      </span>
      {upcoming ? (
        <span className="shrink-0 rounded-full bg-primary/15 px-2 py-0.5 text-[11px] font-semibold text-primary">Upcoming</span>
      ) : (
        sprint && <span className="shrink-0 rounded-full bg-foreground/[0.08] px-2 py-0.5 text-[11px] font-semibold text-foreground/80">Sprint</span>
      )}
      <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
    </Link>
  )
}

/** The latest race, big, with its race and qualifying a click away. */
export function LatestRaceHero({
  year,
  race,
  next,
  showResults,
  canWatch,
}: {
  year: number
  race: F1Race
  next: F1Race | null
  showResults: boolean
  canWatch: boolean
}) {
  const path = f1RacePath(year, race.round)
  const watchPath = (session: string) => (canWatch ? `${path}/${session}` : path)
  const hasQualifying = race.sessions.some((s) => s.key === 'qualifying')
  return (
    <section aria-label="Latest race" className="relative mb-8 overflow-hidden rounded-3xl bg-[#121218] text-white ring-1 ring-white/[0.06]">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(120%_140%_at_100%_0%,rgba(225,6,0,0.55)_0%,rgba(225,6,0,0.12)_45%,transparent_70%)]" />
      <span
        aria-hidden="true"
        className="pointer-events-none absolute -right-2 -top-6 select-none text-[140px] font-black leading-none tracking-tighter text-white/[0.06] sm:text-[220px]"
      >
        {countryCode(race.country)}
      </span>
      <div className="relative p-6 sm:p-9">
        <p className="text-xs font-semibold uppercase tracking-[0.16em] text-white/70">
          {next ? 'Latest race' : 'Season finale'} · Round {race.round}
        </p>
        <h2 className="mt-2 text-3xl font-bold tracking-tight sm:text-4xl">{race.name}</h2>
        <p className="mt-1.5 text-sm text-white/70">
          {formatF1Date(race.date)} · {[race.locality, race.country].filter(Boolean).join(', ')}
        </p>
        {showResults && race.winner && <WinnerLine winner={race.winner} className="mt-2 [&_*]:!text-white/90" />}
        <div className="mt-6 flex flex-wrap gap-2.5">
          <Link
            to={watchPath('race')}
            className="inline-flex h-11 items-center gap-2 rounded-full bg-white px-5 text-sm font-semibold text-black transition-colors hover:bg-white/85"
          >
            <Play className="h-4 w-4 fill-current" aria-hidden="true" /> Race
          </Link>
          {hasQualifying && (
            <Link
              to={watchPath('qualifying')}
              className="inline-flex h-11 items-center gap-2 rounded-full bg-white/15 px-5 text-sm font-semibold text-white transition-colors hover:bg-white/25"
            >
              <Play className="h-4 w-4 fill-current" aria-hidden="true" /> Qualifying
            </Link>
          )}
          <Link
            to={path}
            className="inline-flex h-11 items-center gap-1 rounded-full bg-white/15 px-5 text-sm font-semibold text-white transition-colors hover:bg-white/25"
          >
            All sessions <ChevronRight className="h-4 w-4" aria-hidden="true" />
          </Link>
        </div>
        {next && (
          <p className="mt-5 text-xs text-white/55">
            Next: <span className="text-white/85">{next.name}</span> · {formatF1Date(next.date, { year: false })}
          </p>
        )}
      </div>
    </section>
  )
}
