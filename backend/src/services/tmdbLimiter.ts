import Bottleneck from 'bottleneck';

// TMDB API allows around 40 requests per 10 seconds.
// We configure Bottleneck to ensure we never exceed this limit across the Node server.
export const tmdbLimiter = new Bottleneck({
  maxConcurrent: 10,       // Maximum active connections to TMDB at any given moment
  minTime: 250,            // Absolute minimum time (ms) between dispatching requests (Max 4/sec)
  reservoir: 40,           // The total pool of available requests
  reservoirRefreshAmount: 40, // How many requests to add back to the pool
  reservoirRefreshInterval: 10 * 1000, // Refreshes the pool every 10 seconds
});

// Listener for debugging limit hits (optional, good for prod monitoring)
tmdbLimiter.on('depleted', function (empty) {
  console.warn('[Bottleneck] TMDB Rate Limit Reservoir Depleted. Requests will be queued.');
});

/**
 * Wraps any promise-returning function with the TMDB rate limiter.
 * @param fn The fetch function to limit
 */
export function withTmdbRateLimit<T extends (...args: any[]) => Promise<any>>(fn: T): T {
  return ((...args: Parameters<T>) => tmdbLimiter.schedule(() => fn(...args))) as T;
}
