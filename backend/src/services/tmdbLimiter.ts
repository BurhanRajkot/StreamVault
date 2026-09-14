import Bottleneck from 'bottleneck';

// TMDB dropped its old 40-requests-per-10-seconds cap in 2019; the current
// ceiling is roughly 50 requests/second per IP. The previous config enforced
// the legacy limit (250ms between dispatches), which alone added ~2.5s to a
// 10-item Continue Watching row whenever its details weren't cached yet.
// Stay comfortably under the modern limit — fetchTMDB still backs off on 429.
export const tmdbLimiter = new Bottleneck({
  maxConcurrent: 20,       // Maximum active connections to TMDB at any given moment
  minTime: 25,             // Minimum time (ms) between dispatching requests (max 40/sec)
  reservoir: 40,           // The total pool of available requests
  reservoirRefreshAmount: 40, // How many requests to add back to the pool
  reservoirRefreshInterval: 1000, // Refreshes the pool every second
});

// Listener for debugging limit hits (optional, good for prod monitoring)
tmdbLimiter.on('depleted', function (_empty: unknown) {
  console.warn('[Bottleneck] TMDB Rate Limit Reservoir Depleted. Requests will be queued.');
});

/**
 * Wraps any promise-returning function with the TMDB rate limiter.
 * @param fn The fetch function to limit
 */
export function withTmdbRateLimit<A extends unknown[], R>(fn: (...args: A) => Promise<R>): (...args: A) => Promise<R> {
  return (...args: A) => tmdbLimiter.schedule(() => fn(...args));
}
