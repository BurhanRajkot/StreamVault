import { useEffect } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { useDebridToken } from '@/hooks/useDebridToken'
import { usePremiumAccess } from '@/hooks/usePremiumAccess'
import { warmNearestEdge } from '@/lib/debridHost'
import { SESSION_MINUTES, f1ReleaseSource, type F1Session } from '@/lib/f1'
import { WARM_AFTER_MS, warmPremiumPlay } from '@/lib/premiumWarm'

/**
 * Premium, started while the viewer looks at a race weekend: once they've
 * stayed a moment, the release the player would start for `session` (the
 * race, usually) is made ready on Real-Debrid (lib/premiumWarm), so Watch
 * goes straight to the video. Only for viewers Premium plays for, and only
 * for a session that has run (`round` undefined: nothing to warm).
 */
export function useF1HeadStart(year: number, round: number | undefined, session: F1Session = 'race') {
  const queryClient = useQueryClient()
  const getToken = useDebridToken()
  const { premium } = usePremiumAccess()
  useEffect(() => {
    if (!premium || round === undefined) return
    let live = true
    const timer = setTimeout(() => {
      warmNearestEdge()
      void getToken().then((token) => {
        if (!live) return
        const source = f1ReleaseSource(queryClient, year, round, session)
        const seconds = SESSION_MINUTES[session] * 60
        void warmPremiumPlay({
          releases: () => source.find({ fresh: false }),
          file: { session },
          token,
          durationS: seconds,
          knownDurationS: seconds,
          probeUnseeded: source.probeUnseeded,
        })
      })
    }, WARM_AFTER_MS)
    return () => {
      live = false
      clearTimeout(timer)
    }
  }, [premium, year, round, session, queryClient, getToken])
}
