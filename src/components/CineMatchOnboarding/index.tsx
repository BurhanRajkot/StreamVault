import { useState, useCallback, useEffect } from 'react'
import { createPortal } from 'react-dom'
import { useAuth0 } from '@auth0/auth0-react'

import { API_BASE, CURATED_TITLES, MIN_SELECTIONS } from './constants'
import { StickyHeader } from './StickyHeader'
import { HeroCopy } from './HeroCopy'
import { MovieGrid } from './MovieGrid'
import { BottomActionBar } from './BottomActionBar'
import { SuccessScreen } from './SuccessScreen'

interface Props {
  onComplete: () => void
}

export function CineMatchOnboarding({ onComplete }: Props) {
  const { getAccessTokenSilently } = useAuth0()
  const [selectedIds, setSelectedIds] = useState<number[]>([])
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [submitted, setSubmitted] = useState(false)
  const [imgErrors, setImgErrors] = useState<Set<number>>(new Set())
  const [loadedImgs, setLoadedImgs] = useState<Set<number>>(new Set())

  useEffect(() => {
    const originalOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = originalOverflow
    }
  }, [])

  const toggleSelection = useCallback((tmdbId: number) => {
    setSelectedIds(prev =>
      prev.includes(tmdbId) ? prev.filter(id => id !== tmdbId) : [...prev, tmdbId]
    )
  }, [])

  const handleImgError = useCallback((tmdbId: number) => {
    setImgErrors(prev => new Set(prev).add(tmdbId))
  }, [])

  const handleImgLoad = useCallback((tmdbId: number) => {
    setLoadedImgs(prev => new Set(prev).add(tmdbId))
  }, [])

  const handleContinue = async () => {
    if (selectedIds.length < MIN_SELECTIONS || isSubmitting) return
    setIsSubmitting(true)

    try {
      const token = await getAccessTokenSilently()
      const selections = CURATED_TITLES
        .filter(t => selectedIds.includes(t.tmdbId))
        .map(t => ({ tmdbId: t.tmdbId, mediaType: t.mediaType }))

      await fetch(`${API_BASE}/recommendations/onboarding`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ selections }),
      })
    } catch {
      // Non-critical — complete onboarding even if seeding fails
    } finally {
      setIsSubmitting(false)
      setSubmitted(true)
      // Show success screen for 2.5s, THEN call onComplete so the parent
      // unmounts the overlay after the animation — not before it's visible.
      setTimeout(() => {
        onComplete()
      }, 2500)
    }
  }

  const isReady = selectedIds.length >= MIN_SELECTIONS
  const progress = Math.min((selectedIds.length / MIN_SELECTIONS) * 100, 100)

  const content = submitted ? (
    <SuccessScreen />
  ) : (
    <div className="min-h-full bg-[#0a0a0a] text-white pb-36 font-sans selection:bg-blue-500/30">
      <StickyHeader
        selectedCount={selectedIds.length}
        minSelections={MIN_SELECTIONS}
        progress={progress}
      />

      <main className="max-w-[1440px] mx-auto pt-12 md:pt-20">
        <HeroCopy minSelections={MIN_SELECTIONS} />

        <MovieGrid
          selectedIds={selectedIds}
          imgErrors={imgErrors}
          loadedImgs={loadedImgs}
          onToggleSelection={toggleSelection}
          onImgError={handleImgError}
          onImgLoad={handleImgLoad}
        />
      </main>

      <BottomActionBar
        selectedCount={selectedIds.length}
        minSelections={MIN_SELECTIONS}
        isReady={isReady}
        isSubmitting={isSubmitting}
        progress={progress}
        onContinue={handleContinue}
      />
    </div>
  )

  return createPortal(
    <div data-testid="onboarding" className="fixed inset-0 z-[9999] bg-[#0a0a0a] overflow-hidden">
      <div data-lenis-prevent className="h-full overflow-y-auto overflow-x-hidden scrollbar-thin scrollbar-thumb-zinc-700 scrollbar-track-transparent">
        {content}
      </div>
    </div>,
    document.body
  )
}
