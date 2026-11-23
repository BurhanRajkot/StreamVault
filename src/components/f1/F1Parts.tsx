/**
 * The website's F1 archive pieces, shared by its three pages (pages/F1,
 * F1Race, F1Watch): the page chrome, the season picker, the results switch
 * and the race card. The app draws its own (app/src/screens/F1*).
 */

import { useEffect, useState, type ReactNode } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { ChevronRight, Eye, EyeOff, Play, Timer, Trophy } from 'lucide-react'
import { Header } from '@/components/layout/Header'
import { MobileNav } from '@/components/layout/MobileNav'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { MODE_PATHS } from '@/lib/config'
import { cn } from '@/lib/utils'
import {
  countdown,
  countryCode,
  f1RacePath,
  formatF1Date,
  raceState,
  sessionLabel,
  sessionTime,
  seasonYears,
  weekendDates,
  weekendStart,
  type F1Race,
  type F1Season,
  type RaceState,
} from '@/lib/f1'

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

/** F1's own red — the archive's accent, whatever the site's theme colour. */
export const F1_RED = '#e10600'

/** The country's three letters in a tile — what F1's graphics put by a race. */
export function CountryTile({ race, className }: { race: F1Race; className?: string }) {
  return (
    <span className={cn('flex h-11 w-12 shrink-0 flex-col items-center justify-center rounded-xl bg-foreground/[0.07]', className)}>
      <span className="text-[13px] font-extrabold leading-none tracking-wide text-foreground">{countryCode(race.country)}</span>
      <span className="mt-1 text-[10px] font-semibold leading-none text-muted-foreground">R{race.round}</span>
    </span>
  )
}

const STATE_CHIP: Record<Exclude<RaceState, 'done'>, { label: string; className: string }> = {
  live: { label: 'This weekend', className: 'bg-[#e10600] text-white' },
  next: { label: 'Next', className: 'bg-[#e10600]/15 text-[#ff4d47]' },
  upcoming: { label: 'Upcoming', className: 'bg-foreground/[0.07] text-muted-foreground' },
}

/** One race weekend in the season's grid: its round, name, days and place — and, when shown, who won. */
export function RaceCard({ year, race, season, showResults }: { year: number; race: F1Race; season: F1Season; showResults: boolean }) {
  const state = raceState(race, season)
  const sprint = race.sessions.some((s) => s.key === 'sprint')
  const chip = state === 'done' ? null : STATE_CHIP[state]
  return (
    <Link
      to={f1RacePath(year, race.round)}
      className={cn(
        'group relative flex h-full min-w-0 flex-col gap-3 rounded-2xl border border-border/60 bg-secondary/20 p-4 transition-colors',
        'hover:border-foreground/20 hover:bg-secondary/45 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#e10600]/60',
        (state === 'next' || state === 'live') && 'border-[#e10600]/45 bg-[#e10600]/[0.06]'
      )}
    >
      <div className="flex items-start gap-3">
        <CountryTile race={race} />
        <div className="min-w-0 flex-1">
          <p className="truncate text-[15px] font-semibold leading-snug text-foreground">{race.name}</p>
          <p className="mt-0.5 truncate text-xs text-muted-foreground">
            {weekendDates(race, { year: false })} · {race.locality || race.country}
          </p>
        </div>
        <ChevronRight className="mt-1 h-4 w-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5" aria-hidden="true" />
      </div>
      {(chip || sprint || (state === 'done' && showResults && race.winner)) && (
        <div className="flex min-w-0 items-center gap-2 sm:mt-auto">
          {chip && <span className={cn('rounded-full px-2 py-0.5 text-[11px] font-semibold', chip.className)}>{chip.label}</span>}
          {sprint && <span className="rounded-full bg-foreground/[0.07] px-2 py-0.5 text-[11px] font-semibold text-foreground/80">Sprint</span>}
          {state === 'done' && showResults && race.winner && <WinnerLine winner={race.winner} className="min-w-0 text-xs" />}
        </div>
      )}
    </Link>
  )
}

/** Re-renders every `ms` — for a countdown. */
function useNow(ms: number): number {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), ms)
    return () => clearInterval(timer)
  }, [ms])
  return now
}

/** The next race weekend: a countdown to its first session, and its timetable in the viewer's time. */
export function NextRaceCard({ year, race }: { year: number; race: F1Race }) {
  const now = useNow(30_000)
  const start = weekendStart(race)
  const left = start !== null ? countdown(start, now) : null
  const started = start !== null && start <= now
  return (
    <section aria-label="Next race" className="flex flex-col rounded-3xl border border-border/60 bg-secondary/20 p-5 sm:p-6">
      <p className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">
        <Timer className="h-3.5 w-3.5" aria-hidden="true" /> {started ? 'This weekend' : 'Up next'} · Round {race.round}
      </p>
      <Link to={f1RacePath(year, race.round)} className="mt-2 text-xl font-bold tracking-tight text-foreground hover:text-[#ff4d47]">
        {race.name}
      </Link>
      <p className="mt-0.5 text-sm text-muted-foreground">
        {weekendDates(race)} · {[race.locality, race.country].filter(Boolean).join(', ')}
      </p>
      {left && !started && (
        <div className="mt-4 grid grid-cols-3 gap-2" aria-label={`Starts in ${left.days} days, ${left.hours} hours`}>
          {(
            [
              [left.days, 'days'],
              [left.hours, 'hours'],
              [left.minutes, 'min'],
            ] as const
          ).map(([n, unit]) => (
            <div key={unit} className="rounded-xl bg-foreground/[0.06] py-2.5 text-center">
              <p className="text-2xl font-bold tabular-nums leading-none text-foreground">{n}</p>
              <p className="mt-1 text-[11px] uppercase tracking-wider text-muted-foreground">{unit}</p>
            </div>
          ))}
        </div>
      )}
      <ul className="mt-4 space-y-1.5 text-sm">
        {race.sessions.map((s) => (
          <li key={s.key} className="flex items-baseline justify-between gap-3">
            <span className={cn('text-muted-foreground', s.key === 'race' && 'font-semibold text-foreground')}>{sessionLabel(s.key, year)}</span>
            <span className="shrink-0 tabular-nums text-foreground/85">
              {formatF1Date(s.date, { year: false })}
              {sessionTime(s) && ` · ${sessionTime(s)}`}
            </span>
          </li>
        ))}
      </ul>
    </section>
  )
}

/** The latest race, big, with its race and qualifying a click away. */
export function LatestRaceHero({
  year,
  race,
  finale,
  showResults,
  canWatch,
}: {
  year: number
  race: F1Race
  /** The season is over: this was its last race. */
  finale: boolean
  showResults: boolean
  canWatch: boolean
}) {
  const path = f1RacePath(year, race.round)
  const watchPath = (session: string) => (canWatch ? `${path}/${session}` : path)
  const hasQualifying = race.sessions.some((s) => s.key === 'qualifying')
  const hasSprint = race.sessions.some((s) => s.key === 'sprint')
  return (
    <section aria-label="Latest race" className="relative flex min-h-[260px] overflow-hidden rounded-3xl bg-[#121218] text-white ring-1 ring-white/[0.06]">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(120%_140%_at_100%_0%,rgba(225,6,0,0.6)_0%,rgba(225,6,0,0.14)_45%,transparent_72%)]" />
      {/* Racing stripes */}
      <div className="pointer-events-none absolute inset-y-0 right-[18%] hidden w-24 -skew-x-12 bg-white/[0.03] sm:block" />
      <span
        aria-hidden="true"
        className="pointer-events-none absolute -bottom-8 -right-3 select-none text-[130px] font-black leading-none tracking-tighter text-white/[0.07] sm:text-[200px]"
      >
        {countryCode(race.country)}
      </span>
      <div className="relative flex flex-1 flex-col justify-end p-6 sm:p-9">
        <p className="text-xs font-semibold uppercase tracking-[0.16em] text-white/70">
          {finale ? 'Season finale' : 'Latest race'} · Round {race.round}
        </p>
        <h2 className="mt-2 text-3xl font-bold tracking-tight sm:text-[40px] sm:leading-[1.1]">{race.name}</h2>
        <p className="mt-1.5 text-sm text-white/70">
          {weekendDates(race)} · {[race.locality, race.country].filter(Boolean).join(', ')}
        </p>
        {showResults && race.winner && <WinnerLine winner={race.winner} className="mt-2 [&_*]:!text-white/90" />}
        <div className="mt-6 flex flex-wrap gap-2.5">
          <Link
            to={watchPath('race')}
            className="inline-flex h-11 items-center gap-2 rounded-full bg-white px-5 text-sm font-semibold text-black transition-colors hover:bg-white/85"
          >
            <Play className="h-4 w-4 fill-current" aria-hidden="true" /> Watch the race
          </Link>
          {(hasSprint || hasQualifying) && (
            <Link
              to={watchPath(hasSprint ? 'sprint' : 'qualifying')}
              className="inline-flex h-11 items-center gap-2 rounded-full bg-white/15 px-5 text-sm font-semibold text-white transition-colors hover:bg-white/25"
            >
              <Play className="h-4 w-4 fill-current" aria-hidden="true" /> {hasSprint ? 'Sprint' : 'Qualifying'}
            </Link>
          )}
          <Link
            to={path}
            className="inline-flex h-11 items-center gap-1 rounded-full bg-white/15 px-5 text-sm font-semibold text-white transition-colors hover:bg-white/25"
          >
            All sessions <ChevronRight className="h-4 w-4" aria-hidden="true" />
          </Link>
        </div>
      </div>
    </section>
  )
}
