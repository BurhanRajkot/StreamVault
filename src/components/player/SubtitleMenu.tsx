/**
 * The settings menu's subtitle pages: languages (and Off), then — for the
 * language showing — its versions, a timing nudge and the text size.
 */

import { Check, Minus, Plus } from 'lucide-react'
import type { PlayerSubtitles } from '@/hooks/useSubtitles'
import { formatSubtitleDelay, type SubtitleSize } from '@/lib/subtitles'
import { cn } from '@/lib/utils'
import { MenuHeader, MenuRow } from './PlayerMenuParts'

/** One click of the timing nudge, in seconds. */
const DELAY_STEP_S = 0.5

const SIZES: { value: SubtitleSize; label: string; name: string }[] = [
  { value: 's', label: 'S', name: 'Small' },
  { value: 'm', label: 'M', name: 'Medium' },
  { value: 'l', label: 'L', name: 'Large' },
]

const itemClass =
  'flex w-full items-center gap-3 px-4 py-2.5 text-left transition-colors hover:bg-white/10 focus-visible:bg-white/10 focus-visible:outline-none'
const smallButtonClass =
  'flex h-8 items-center justify-center rounded-md transition-colors hover:bg-white/15 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/70'

export function SubtitleLanguagesPage({
  subtitles,
  onBack,
  onVersions,
}: {
  subtitles: PlayerSubtitles
  onBack: () => void
  onVersions: () => void
}) {
  const { status, languages, language, option, delay, size } = subtitles
  const showing = languages.find((l) => l.code === language)
  const versionIndex = showing && option ? showing.options.findIndex((o) => o.id === option.id) : -1

  return (
    <>
      <MenuHeader title="Subtitles" onBack={onBack} />
      <div className="overflow-y-auto overscroll-contain">
        {showing && option && (
          <div className="mb-1 border-b border-white/10 pb-1">
            {showing.options.length > 1 && (
              <MenuRow onClick={onVersions} label="Version" value={`${versionIndex + 1} of ${showing.options.length}`} chevron />
            )}
            <div className="flex items-center justify-between gap-3 px-4 py-1.5">
              <span>Timing</span>
              <span className="flex items-center gap-0.5">
                <button
                  onClick={() => subtitles.setDelay(delay - DELAY_STEP_S)}
                  aria-label="Show subtitles earlier"
                  title="Earlier"
                  className={cn(smallButtonClass, 'w-8')}
                >
                  <Minus className="h-4 w-4" />
                </button>
                <button
                  onClick={() => subtitles.setDelay(0)}
                  aria-label={`Subtitle timing ${formatSubtitleDelay(delay)}${delay ? ', reset' : ''}`}
                  title={delay ? 'Reset' : undefined}
                  className={cn(smallButtonClass, 'w-16 text-xs tabular-nums', delay ? 'text-white' : 'text-white/60')}
                >
                  {formatSubtitleDelay(delay)}
                </button>
                <button
                  onClick={() => subtitles.setDelay(delay + DELAY_STEP_S)}
                  aria-label="Show subtitles later"
                  title="Later"
                  className={cn(smallButtonClass, 'w-8')}
                >
                  <Plus className="h-4 w-4" />
                </button>
              </span>
            </div>
            <div className="flex items-center justify-between gap-3 px-4 py-1.5">
              <span>Size</span>
              <span className="flex items-center gap-0.5 rounded-lg bg-white/[0.08] p-0.5">
                {SIZES.map((s) => (
                  <button
                    key={s.value}
                    onClick={() => subtitles.setSize(s.value)}
                    aria-label={`${s.name} subtitles`}
                    aria-pressed={size === s.value}
                    className={cn(
                      smallButtonClass,
                      'h-7 w-9 text-xs font-semibold',
                      size === s.value ? 'bg-white text-black hover:bg-white' : 'text-white/70'
                    )}
                  >
                    {s.label}
                  </button>
                ))}
              </span>
            </div>
            <p className="px-4 pb-1.5 pt-0.5 text-[11px] leading-snug text-white/45">
              Out of sync? Try another version, or nudge the timing.
            </p>
          </div>
        )}

        <button onClick={() => subtitles.select(null)} aria-current={!language || undefined} className={itemClass}>
          <Check className={cn('h-4 w-4 shrink-0', language ? 'opacity-0' : 'opacity-100')} />
          Off
        </button>
        {languages.map((l) => {
          const selected = l.code === language
          return (
            <button key={l.code} onClick={() => subtitles.select(l.code)} aria-current={selected || undefined} className={itemClass}>
              <Check className={cn('h-4 w-4 shrink-0', selected ? 'opacity-100' : 'opacity-0')} />
              <span className="min-w-0 flex-1 truncate">{l.name}</span>
              {selected && subtitles.loadingTrack && <span className="text-xs text-white/50">Loading…</span>}
            </button>
          )
        })}
        {status === 'loading' && <p className="px-4 py-2.5 text-xs text-white/50">Finding subtitles…</p>}
        {status === 'none' && <p className="px-4 py-2.5 text-xs leading-relaxed text-white/50">No subtitles found for this file.</p>}
        {status === 'error' && (
          <p className="px-4 py-2.5 text-xs leading-relaxed text-white/50">Couldn’t reach the subtitle service. Try again in a bit.</p>
        )}
      </div>
    </>
  )
}

export function SubtitleVersionsPage({ subtitles, onBack }: { subtitles: PlayerSubtitles; onBack: () => void }) {
  const showing = subtitles.languages.find((l) => l.code === subtitles.language)
  if (!showing) return <MenuHeader title="Subtitles" onBack={onBack} />

  return (
    <>
      <MenuHeader title={`${showing.name} versions`} onBack={onBack} />
      <div className="overflow-y-auto overscroll-contain">
        {showing.options.map((o, i) => {
          const selected = o.id === subtitles.option?.id
          return (
            <button
              key={o.id}
              onClick={() => {
                subtitles.select(showing.code, o.id)
                onBack()
              }}
              aria-current={selected || undefined}
              title={o.release}
              className={cn(itemClass, 'items-start')}
            >
              <Check className={cn('mt-0.5 h-4 w-4 shrink-0', selected ? 'opacity-100' : 'opacity-0')} />
              <span className="min-w-0 flex-1">
                <span className="flex items-baseline gap-2">
                  <span className="font-semibold">{i === 0 ? 'Best match' : `Version ${i + 1}`}</span>
                  {o.hearingImpaired && <span className="text-xs text-white/60">SDH</span>}
                </span>
                <span className="mt-0.5 block truncate text-[11px] text-white/40">{o.release}</span>
              </span>
            </button>
          )
        })}
      </div>
    </>
  )
}
