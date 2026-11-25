import { useEffect, useMemo } from 'react'
import { Navigate, useLocation, useNavigate, useParams } from 'react-router-dom'
import { PremiumPane } from '@/components/player/PremiumPane'
import { useIsAdmin } from '@/hooks/useIsAdmin'
import { libraryHitFromPath, libraryReleaseSource } from '@/lib/librarySearch'
import { setPlaybackMode } from '@app/native/platform'

/** One file from the account's own library (My files), full screen in the Premium player. */
export function LibraryPlayerScreen() {
  const { hash } = useParams()
  const { search } = useLocation()
  const navigate = useNavigate()
  const isAdmin = useIsAdmin()
  const hit = useMemo(() => libraryHitFromPath(hash, search), [hash, search])
  const source = useMemo(() => (hit ? libraryReleaseSource(hit) : null), [hit])

  // The whole screen, sideways, for as long as the player is open
  useEffect(() => {
    void setPlaybackMode(true)
    return () => void setPlaybackMode(false)
  }, [])

  if (!isAdmin) return <Navigate to="/admin" replace />
  if (!hit || !source) return <Navigate to="/files" replace />

  const close = () => ((window.history.state as { idx?: number } | null)?.idx ? navigate(-1) : navigate('/files', { replace: true }))
  const title = hit.file?.name ?? hit.torrentName

  return (
    <div className="app-player fixed inset-0 z-[300] bg-black">
      <div data-own-controls className="player-shell relative overflow-hidden bg-black">
        <div className="player-frame">
          <PremiumPane
            key={source.key}
            title={title}
            mediaType="movie"
            subtitle={hit.file ? hit.torrentName : undefined}
            releaseSource={source}
            onSwitchServer={close}
            onBack={close}
            exitLabel="Back to my files"
            elsewhere="Your files play on Premium only."
          />
        </div>
      </div>
    </div>
  )
}
