/**
 * The screens Premium shows in place of the picture: over the title's
 * artwork, dimmed. One look from Play to the first frame — finding a
 * release, getting it ready on Real-Debrid, then the video connecting — so
 * the wait reads as one thing moving forward rather than three different
 * spinners.
 */

import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'

/** Full-pane screen over the title's artwork. */
export function PaneBackdrop({
  backdropUrl,
  testId,
  onSwitchServer,
  className,
  children,
}: {
  backdropUrl?: string | null
  testId?: string
  /** A quiet way out while the viewer waits. */
  onSwitchServer?: () => void
  className?: string
  children: ReactNode
}) {
  return (
    <div
      className={cn('relative flex h-full w-full items-center justify-center overflow-hidden bg-black text-white', className)}
      data-testid={testId}
    >
      {backdropUrl && (
        <img
          src={backdropUrl}
          alt=""
          aria-hidden="true"
          decoding="async"
          className="absolute inset-0 h-full w-full scale-105 object-cover opacity-30"
        />
      )}
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,rgba(0,0,0,0.35)_0%,rgba(0,0,0,0.85)_75%)]" />
      <div className="relative z-10 flex max-w-md flex-col items-center px-6 text-center">{children}</div>
      {onSwitchServer && (
        <button
          onClick={onSwitchServer}
          className="absolute bottom-[max(0.75rem,env(safe-area-inset-bottom,0px))] right-[max(0.75rem,env(safe-area-inset-right,0px))] z-10 rounded-md px-3 py-2 text-xs font-medium text-white/55 transition-colors hover:bg-white/10 hover:text-white sm:bottom-4 sm:right-4"
        >
          Switch server
        </button>
      )}
    </div>
  )
}

export function TitleLines({ title, episodeLine }: { title: string; episodeLine?: string }) {
  return (
    <>
      <p className="line-clamp-2 font-display text-xl font-semibold leading-tight sm:text-3xl">{title}</p>
      {episodeLine && <p className="mt-1.5 text-sm text-white/60">{episodeLine}</p>}
    </>
  )
}

/** Finding a release → getting it ready on Real-Debrid → the video connecting. */
export type StartupStep = 'find' | 'prepare' | 'start'

const STEPS: { id: StartupStep; label: string }[] = [
  { id: 'find', label: 'Finding a release' },
  { id: 'prepare', label: 'Preparing it' },
  { id: 'start', label: 'Starting playback' },
]

interface PremiumLoadingProps {
  backdropUrl?: string | null
  title: string
  episodeLine?: string
  step: StartupStep
  message: string
  /** Download progress, 0-100 — shown as one bar instead of the steps. */
  percent?: number | null
  /** A line under the message (download speed, ...). */
  detail?: ReactNode
  onSwitchServer?: () => void
  testId?: string
  className?: string
}

export function PremiumLoading({
  backdropUrl,
  title,
  episodeLine,
  step,
  message,
  percent = null,
  detail,
  onSwitchServer,
  testId,
  className,
}: PremiumLoadingProps) {
  const current = STEPS.findIndex((s) => s.id === step)
  return (
    <PaneBackdrop backdropUrl={backdropUrl} testId={testId} onSwitchServer={onSwitchServer} className={className}>
      <TitleLines title={title} episodeLine={episodeLine} />
      {percent !== null ? (
        <div
          className="mt-7 h-[3px] w-44 overflow-hidden rounded-full bg-white/15 sm:w-56"
          role="progressbar"
          aria-label="Downloading"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={percent}
        >
          <div className="h-full rounded-full bg-white transition-[width] duration-700" style={{ width: `${percent}%` }} />
        </div>
      ) : (
        <div
          className="mt-7 flex items-center gap-1.5"
          role="progressbar"
          aria-label="Loading the stream"
          aria-valuemin={1}
          aria-valuemax={STEPS.length}
          aria-valuenow={current + 1}
          aria-valuetext={`Step ${current + 1} of ${STEPS.length}: ${STEPS[current]?.label}`}
        >
          {STEPS.map((s, i) => (
            <span key={s.id} className="relative h-[3px] w-12 overflow-hidden rounded-full bg-white/15 sm:w-16">
              {i < current && <span className="absolute inset-0 rounded-full bg-white" />}
              {i === current && <span className="pane-indeterminate absolute inset-y-0 left-0 w-2/5 rounded-full bg-white" />}
            </span>
          ))}
        </div>
      )}
      <p className="mt-4 text-sm text-white/75" aria-live="polite">
        {message}
      </p>
      {detail && <p className="mt-1 text-xs tabular-nums text-white/45">{detail}</p>}
    </PaneBackdrop>
  )
}
