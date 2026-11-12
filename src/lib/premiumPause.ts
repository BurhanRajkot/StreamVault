/**
 * The Premium (Real-Debrid) server is paused while hosting costs get sorted
 * out (2026-11-12, expected back in 3–4 days). While this is true the home
 * page shows the "Premium is paused" popup instead of the "Premium is free"
 * card.
 *
 * Set it back to false when Premium is running again.
 */
export const PREMIUM_PAUSED = true

/** sessionStorage: set once the popup has been seen, so it shows once per visit. */
export const PREMIUM_PAUSED_SEEN_KEY = 'sv:notice:premium-paused-2026-11'

/** How long the popup stays up before closing by itself. */
export const PREMIUM_PAUSED_NOTICE_MS = 7000
