/**
 * True while the ⚡ Premium (Real-Debrid) server isn't working (since
 * 2026-11-12). While it is:
 * - Premium sits last in the server list (it always does now — see
 *   serverOptions) and a continue-watching row saved on it starts on the
 *   default server instead (MovieDetailModal);
 * - the home page leaves out the "Premium is free" card.
 *
 * There is no popup about it any more (removed 2026-11-13).
 *
 * Set it back to false when Premium is running again.
 */
export const PREMIUM_PAUSED = true
