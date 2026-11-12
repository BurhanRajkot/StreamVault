import { useEffect, useRef, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Heart, PauseCircle, Star } from 'lucide-react'
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog'
import { fetchDonationDetails } from '@/lib/api'
import { PREMIUM_PAUSED_NOTICE_MS, PREMIUM_PAUSED_SEEN_KEY } from '@/lib/premiumPause'
import { GITHUB_REPO_URL, upiPayUrl } from '@/lib/supportPrompt'

function wasSeen(): boolean {
  try {
    return sessionStorage.getItem(PREMIUM_PAUSED_SEEN_KEY) === 'true'
  } catch {
    return false
  }
}

function markSeen() {
  try {
    sessionStorage.setItem(PREMIUM_PAUSED_SEEN_KEY, 'true')
  } catch {
    // Shows again on the next page load — harmless.
  }
}

/**
 * "Premium is paused for a few days" popup, shown once per visit on whichever
 * page someone opens first while PREMIUM_PAUSED is on. It closes by itself
 * after 7 seconds; the countdown waits while the pointer is over it, and stops
 * for good once the viewer opens the donation QR code.
 */
export function PremiumPausedNotice() {
  const [open, setOpen] = useState(() => !wasSeen())
  const [hovered, setHovered] = useState(false)
  const [showQr, setShowQr] = useState(false)
  const remainingMs = useRef(PREMIUM_PAUSED_NOTICE_MS)
  const contentRef = useRef<HTMLDivElement>(null)

  const { data: donation } = useQuery({
    queryKey: ['donation-details'],
    queryFn: fetchDonationDetails,
    staleTime: 60 * 60 * 1000,
    retry: false,
    enabled: open,
  })

  // Seen as soon as it shows, so moving to another page (where another copy
  // is mounted — see App) doesn't bring it back
  useEffect(() => {
    if (open) markSeen()
  }, [open])

  const counting = open && !hovered && !showQr

  useEffect(() => {
    if (!counting) return
    const startedAt = Date.now()
    const timer = window.setTimeout(() => setOpen(false), remainingMs.current)
    return () => {
      window.clearTimeout(timer)
      remainingMs.current = Math.max(0, remainingMs.current - (Date.now() - startedAt))
    }
  }, [counting])

  const onOpenChange = (next: boolean) => {
    if (!next) setOpen(false)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        ref={contentRef}
        onOpenAutoFocus={(event) => {
          // Focus the card itself, not the first button — a focus ring on
          // "Donate" the moment the page opens reads as a nudge.
          event.preventDefault()
          contentRef.current?.focus()
        }}
        onPointerEnter={() => setHovered(true)}
        onPointerLeave={() => setHovered(false)}
        className="w-[calc(100%-2rem)] max-w-md gap-0 overflow-hidden rounded-2xl p-0 text-center outline-none sm:rounded-2xl"
      >
        {showQr && donation ? (
          <div className="flex flex-col items-center px-6 pb-6 pt-8">
            <DialogTitle className="text-lg">Thank you for helping</DialogTitle>
            <DialogDescription className="mt-1.5">Scan with any UPI app — any amount helps.</DialogDescription>
            <img
              src={donation.qrCode}
              alt="UPI QR code to donate to StreamVault"
              className="mt-4 h-40 w-40 rounded-lg bg-white p-1.5 sm:h-44 sm:w-44"
            />
            <p className="mt-2 font-mono text-xs text-muted-foreground">UPI: {donation.upiId}</p>
            <div className="mt-5 flex flex-wrap items-center justify-center gap-2.5">
              <a href={upiPayUrl(donation)} className={`${secondaryAction} sm:hidden`}>
                Open UPI app
              </a>
              <button onClick={() => onOpenChange(false)} className={primaryAction}>
                Done
              </button>
            </div>
          </div>
        ) : (
          <div className="flex flex-col items-center px-6 pb-6 pt-8">
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-amber-500/15">
              <PauseCircle className="h-6 w-6 text-amber-500" />
            </div>
            <DialogTitle className="mt-4 text-xl leading-snug">Premium is paused for a few days</DialogTitle>
            <DialogDescription className="mt-3 text-sm leading-relaxed">
              StreamVault now gets <strong className="text-foreground">40,000+ visitors</strong> and streams over{' '}
              <strong className="text-foreground">25 TB</strong> every day — more than I can pay for on my own. I’ve
              paused the Premium server while I sort things out, and it’ll be back in{' '}
              <strong className="text-foreground">3–4 days</strong>.
            </DialogDescription>
            <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
              Until then, all the free servers work as usual. If you’d like to help keep StreamVault running, a
              donation or a GitHub star means a lot.
            </p>
            <div className="mt-5 flex flex-wrap items-center justify-center gap-2.5">
              {donation && (
                <button onClick={() => setShowQr(true)} className={primaryAction}>
                  <Heart className="h-4 w-4 fill-rose-500 text-rose-500" />
                  Donate
                </button>
              )}
              <a
                href={GITHUB_REPO_URL}
                target="_blank"
                rel="noopener noreferrer"
                className={donation ? secondaryAction : primaryAction}
              >
                <Star className="h-4 w-4" />
                Star on GitHub
              </a>
            </div>
          </div>
        )}

        {/* The 7-second countdown; freezes with the timer while hovered */}
        {!showQr && (
          <div aria-hidden className="h-1 w-full bg-muted motion-reduce:hidden">
            <div
              className="h-full origin-left bg-amber-500"
              style={{
                animationName: 'sv-countdown',
                animationDuration: `${PREMIUM_PAUSED_NOTICE_MS}ms`,
                animationTimingFunction: 'linear',
                animationFillMode: 'forwards',
                animationPlayState: hovered ? 'paused' : 'running',
              }}
            />
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}

const primaryAction =
  'inline-flex h-10 items-center justify-center gap-2 rounded-full bg-foreground px-5 text-sm font-semibold text-background transition-opacity hover:opacity-85 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background'
const secondaryAction =
  'inline-flex h-10 items-center justify-center gap-2 rounded-full bg-muted px-5 text-sm font-medium text-foreground transition-colors hover:bg-muted/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring'
