import { useEffect } from 'react'
import { createPortal } from 'react-dom'
import { useQuery } from '@tanstack/react-query'
import { AnimatePresence, motion } from 'framer-motion'
import { X } from 'lucide-react'
import { fetchTrailer, type Trailer } from '@app/lib/extras'

/** The title's trailer, when it has one — asked once a day per title. */
export function useTrailer(kind: 'movie' | 'tv', id: number) {
  return useQuery({
    queryKey: ['app-trailer', kind, id],
    queryFn: () => fetchTrailer(kind, id),
    enabled: id > 0,
    staleTime: 24 * 60 * 60 * 1000,
  }).data
}

/**
 * The trailer over everything, YouTube's player in a 16:9 frame on black.
 * Escape, the close button, a click outside it or Android's back button
 * close it (the app's back handler sends Escape to open dialogs).
 */
export function TrailerOverlay({ trailer, title, open, onClose }: { trailer: Trailer | null | undefined; title: string; open: boolean; onClose: () => void }) {
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [open, onClose])

  return createPortal(
    <AnimatePresence>
      {open && trailer && (
        <motion.div
          role="dialog"
          aria-modal="true"
          aria-label={`${title} — trailer`}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
          onClick={onClose}
          className="fixed inset-0 z-[400] flex items-center justify-center bg-black/90 px-[max(1rem,var(--sal))] pb-[var(--sab)] pt-[var(--sat)]"
        >
          <motion.div
            initial={{ scale: 0.94, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.97, opacity: 0 }}
            transition={{ duration: 0.25, ease: [0.25, 1, 0.5, 1] }}
            onClick={(e) => e.stopPropagation()}
            className="relative w-full max-w-[min(72rem,calc((100dvh-8rem)*16/9))]"
          >
            <div className="mb-3 flex items-center gap-3">
              <p className="t-headline min-w-0 flex-1 truncate text-white/90">{trailer.name || `${title} — Trailer`}</p>
              <button
                type="button"
                onClick={onClose}
                aria-label="Close trailer"
                className="glass-button press flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-white"
              >
                <X className="h-5 w-5" strokeWidth={2.4} />
              </button>
            </div>
            <div className="aspect-video w-full overflow-hidden rounded-[14px] bg-black shadow-[0_30px_80px_-20px_rgb(0_0_0/0.9)] ring-1 ring-white/10">
              <iframe
                src={`https://www.youtube-nocookie.com/embed/${encodeURIComponent(trailer.key)}?autoplay=1&rel=0&modestbranding=1&playsinline=1`}
                title={`${title} — trailer`}
                allow="autoplay; encrypted-media; picture-in-picture; fullscreen"
                allowFullScreen
                // YouTube refuses to play embeds that send no referrer (error 153)
                referrerPolicy="strict-origin-when-cross-origin"
                className="h-full w-full border-0"
              />
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>,
    document.body
  )
}
