import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Coffee, Heart, Star } from 'lucide-react'
import { fetchDonationDetails, type DonationDetails } from '@/lib/api'
import { GITHUB_REPO_URL } from '@/lib/supportPrompt'

interface SupportPromptProps {
  /** Close the prompt and start the video — every way out ends here. */
  onDismiss: () => void
}

/** Opens a UPI app straight away on a phone, where scanning your own screen isn't an option. */
function upiPayUrl({ upiId, payeeName }: DonationDetails): string {
  const params = new URLSearchParams({ pa: upiId, pn: payeeName, cu: 'INR', tn: 'Buy me a coffee - StreamVault' })
  return `upi://pay?${params.toString()}`
}

/**
 * Shown in place of the video on some Premium plays (see lib/supportPrompt):
 * asks for a GitHub star or a coffee. Nothing is required — "Not now" plays
 * the video, and so does either of the other choices.
 */
export function SupportPrompt({ onDismiss }: SupportPromptProps) {
  const [showQr, setShowQr] = useState(false)
  const { data: donation } = useQuery({
    queryKey: ['donation-details'],
    queryFn: fetchDonationDetails,
    staleTime: 60 * 60 * 1000,
    retry: false,
  })

  if (showQr && donation) {
    return (
      <section aria-labelledby="support-prompt-heading" className="flex flex-col items-center">
        <p id="support-prompt-heading" className="text-lg font-semibold leading-snug sm:text-xl">
          Buy me a coffee
        </p>
        <p className="mt-1.5 text-sm text-white/65">Scan with any UPI app — any amount helps.</p>
        <img
          src={donation.qrCode}
          alt="UPI QR code to buy me a coffee"
          className="mt-4 h-32 w-32 rounded-lg bg-white p-1.5 sm:h-44 sm:w-44"
        />
        <p className="mt-2 font-mono text-xs text-white/60">UPI: {donation.upiId}</p>
        <div className="mt-4 flex flex-wrap items-center justify-center gap-2.5">
          <a href={upiPayUrl(donation)} className={`${secondaryAction} sm:hidden`}>
            Open UPI app
          </a>
          <button onClick={onDismiss} className={primaryAction}>
            Continue watching
          </button>
        </div>
      </section>
    )
  }

  return (
    <section aria-labelledby="support-prompt-heading" className="flex flex-col items-center">
      <div className="flex h-10 w-10 items-center justify-center rounded-full bg-rose-500/15 sm:h-12 sm:w-12">
        <Heart className="h-5 w-5 fill-rose-500 text-rose-500 sm:h-6 sm:w-6" />
      </div>
      <p id="support-prompt-heading" className="mt-3 text-lg font-semibold leading-snug sm:text-xl">
        StreamVault isn’t free to run
      </p>
      <p className="mt-2 text-sm leading-relaxed text-white/70">
        It’s open source, and the Premium server costs real money every month. If you’re enjoying it, please leave a
        star on GitHub{donation ? ' or buy me a coffee' : ''} — it keeps this going.
      </p>
      <div className="mt-5 flex flex-wrap items-center justify-center gap-2.5">
        <a href={GITHUB_REPO_URL} target="_blank" rel="noopener noreferrer" onClick={onDismiss} className={primaryAction}>
          <Star className="h-4 w-4" />
          Star on GitHub
        </a>
        {donation && (
          <button onClick={() => setShowQr(true)} className={secondaryAction}>
            <Coffee className="h-4 w-4" />
            Buy me a coffee
          </button>
        )}
        <button onClick={onDismiss} className={quietAction}>
          Not now
        </button>
      </div>
    </section>
  )
}

const primaryAction =
  'inline-flex h-10 items-center justify-center gap-2 rounded-md bg-white px-5 text-sm font-semibold text-black transition-colors hover:bg-white/85 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/70 focus-visible:ring-offset-2 focus-visible:ring-offset-black'
const secondaryAction =
  'inline-flex h-10 items-center justify-center gap-2 rounded-md bg-white/10 px-4 text-sm font-medium text-white transition-colors hover:bg-white/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/70'
const quietAction =
  'inline-flex h-10 items-center justify-center rounded-md px-3 text-sm text-white/60 transition-colors hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/70'
