/**
 * A site-wide cap on wrong admin codes.
 *
 * The per-IP limits in routes.ts stop one address from guessing, but the
 * login is a 6-digit code: an attacker who can rotate addresses (a botnet,
 * or one IPv6 block) gets a fresh allowance on each and could walk the whole
 * code space in minutes. Since 2026-11-15 an admin token also unlocks the
 * Real-Debrid account, so that is worth closing.
 *
 * This counts failures from everyone together. Past the limit, every login
 * attempt is refused until old failures age out of the window — at 10 wrong
 * codes per 15 minutes, guessing a code that way takes about a year.
 *
 * The cost: someone hammering the endpoint can keep the real admin from
 * signing in while they do. That only delays a new sign-in (a session lasts
 * 30 days), which is the right trade against a guessed admin token.
 */
export class FailureBudget {
  private failures: number[] = []

  constructor(
    private readonly limit: number,
    private readonly windowMs: number
  ) {}

  private prune(now: number): void {
    const cutoff = now - this.windowMs
    while (this.failures.length > 0 && this.failures[0] <= cutoff) this.failures.shift()
  }

  /** True when no more attempts should be accepted right now. */
  exhausted(now = Date.now()): boolean {
    this.prune(now)
    return this.failures.length >= this.limit
  }

  recordFailure(now = Date.now()): void {
    this.prune(now)
    this.failures.push(now)
  }

  /** Seconds until the next attempt will be accepted (0 when one is accepted now). */
  retryAfterSeconds(now = Date.now()): number {
    if (!this.exhausted(now)) return 0
    const oldestThatCounts = this.failures[this.failures.length - this.limit]
    return Math.max(1, Math.ceil((oldestThatCounts + this.windowMs - now) / 1000))
  }
}

export const GLOBAL_FAILED_LOGIN_LIMIT = 10
export const GLOBAL_FAILED_LOGIN_WINDOW_MS = 15 * 60 * 1000
