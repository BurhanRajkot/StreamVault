/**
 * The "StreamVault isn't free to run — star it / buy me a coffee" prompt on
 * the Premium server: counts Premium plays on this device and says which ones
 * the prompt interrupts.
 *
 * Schedule: the 5th play, then 10 plays later, then 20, then 10, then every
 * 15 — i.e. plays 5, 15, 35, 45, 60, 75, 90, …
 */

import type { DonationDetails } from '@/lib/api'

export const GITHUB_REPO_URL = 'https://github.com/BurhanRajkot/StreamVault'

/** Opens a UPI app straight away on a phone, where scanning your own screen isn't an option. */
export function upiPayUrl({ upiId, payeeName }: DonationDetails): string {
  const params = new URLSearchParams({ pa: upiId, pn: payeeName, cu: 'INR', tn: 'Buy me a coffee - StreamVault' })
  return `upi://pay?${params.toString()}`
}

const PLAYS_KEY = 'sv:premium-plays'

/** Plays between one prompt and the next; the last gap repeats forever. */
const PROMPT_GAPS = [5, 10, 20, 10, 15] as const

/** True when the `count`-th Premium play (1-based) should show the prompt. */
export function isSupportPromptPlay(count: number): boolean {
  if (!Number.isInteger(count) || count < 1) return false
  let at = 0
  for (const gap of PROMPT_GAPS) {
    at += gap
    if (count === at) return true
    if (count < at) return false
  }
  const repeat = PROMPT_GAPS[PROMPT_GAPS.length - 1]
  return (count - at) % repeat === 0
}

/** Count one Premium play and say whether it should show the prompt. */
export function recordPremiumPlay(): boolean {
  try {
    const previous = parseInt(localStorage.getItem(PLAYS_KEY) ?? '0', 10)
    const count = (Number.isFinite(previous) && previous > 0 ? previous : 0) + 1
    localStorage.setItem(PLAYS_KEY, String(count))
    return isSupportPromptPlay(count)
  } catch {
    // No storage (private mode, blocked) — never nag.
    return false
  }
}
