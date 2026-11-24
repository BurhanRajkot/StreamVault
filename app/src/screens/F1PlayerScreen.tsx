import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { motion } from 'framer-motion'
import { ChevronDown, ListVideo } from 'lucide-react'
import { PremiumPane } from '@/components/player/PremiumPane'
import { F1_ELSEWHERE, SESSION_MINUTES, f1ReleaseSource, f1SeasonQuery, isF1Session, isUpcoming, sessionLabel } from '@/lib/f1'
import { setPlaybackMode } from '@app/native/platform'
import { Sheet } from '@app/components/Sheet'
import { ListRow, ListSection } from '@app/components/kit'

/**
 * One F1 session on Premium, full screen like a film's player. The
 * player's own controls carry a session switcher.
 */
export function F1PlayerScreen() {
  const params = useParams()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const year = Number(params.year)
  const round = Number(params.round)
  const session = isF1Session(params.session) ? params.session : null
  const [picking, setPicking] = useState(false)

  const { data: season, isError } = useQuery(f1SeasonQuery(year))
  const race = season?.races.find((r) => r.round === round)
  const source = useMemo(() => (session ? f1ReleaseSource(queryClient, year, round, session) : null), [queryClient, year, round, session])

  // The whole screen, sideways, for as long as the player is open
  useEffect(() => {
    void setPlaybackMode(true)
    return () => void setPlaybackMode(false)
  }, [])

  const close = () => ((window.history.state as { idx?: number } | null)?.idx ? navigate(-1) : navigate(`/f1/${year}/${round}`, { replace: true }))
  const label = session ? sessionLabel(session, year) : ''
  const sessions = race?.sessions.filter((s) => !isUpcoming(s)) ?? []

  const sessionButton =
    sessions.length > 1 ? (
      <motion.button
        whileTap={{ scale: 0.94 }}
        onClick={() => setPicking(true)}
        className="glass-button flex h-10 items-center gap-2 rounded-full pl-3 pr-3 text-[14px] font-semibold text-white transition-colors hover:bg-white/25"
      >
        <ListVideo className="h-4 w-4" />
        {label}
        <ChevronDown className="h-4 w-4 opacity-60" strokeWidth={2.4} />
      </motion.button>
    ) : undefined

  return (
    <div className="app-player fixed inset-0 z-[300] bg-black">
      {race && source && session ? (
        <div data-own-controls className="player-shell relative overflow-hidden bg-black">
          <div className="player-frame">
            <PremiumPane
              key={source.key}
              title={race.name}
              year={year}
              mediaType="movie"
              subtitle={`${year} · ${label}`}
              releaseSource={source}
              runtimeMinutes={SESSION_MINUTES[session]}
              onSwitchServer={close}
              onBack={close}
              exitLabel="Back to the race"
              elsewhere={F1_ELSEWHERE}
              topActions={
                sessionButton
              }
            />
          </div>
        </div>
      ) : (
        <div className="flex h-full flex-col items-center justify-center gap-4 px-8 text-center">
          {isError || !session || (season && !race) ? (
            <>
              <p className="t-subhead text-white/70">{isError ? 'The calendar didn’t load.' : 'That session isn’t in the archive.'}</p>
              <button onClick={close} className="glass-button press h-10 rounded-full px-5 text-[15px] font-semibold text-white">
                Back
              </button>
            </>
          ) : (
            <span className="player-spinner" aria-label="Loading" />
          )}
        </div>
      )}

      <Sheet side="right" open={picking} onOpenChange={setPicking} title="Sessions" description={race ? `${race.name} ${year}` : undefined}>
        <ListSection className="mb-0">
          {sessions.map((s) => (
            <ListRow
              key={s.key}
              label={sessionLabel(s.key, year)}
              accessory={s.key === session ? 'check' : 'none'}
              onClick={() => {
                setPicking(false)
                if (s.key !== session) navigate(`/watch/f1/${year}/${round}/${s.key}`, { replace: true })
              }}
            />
          ))}
        </ListSection>
      </Sheet>
    </div>
  )
}
