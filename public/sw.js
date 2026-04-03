/**
 * StreamVault Service Worker
 *
 * Cache strategies:
 *   - image.tmdb.org  →  Cache-First  (images are immutable, 7-day TTL)
 *   - /tmdb/*         →  Stale-While-Revalidate (show cache, refresh in bg, 5-min TTL)
 *   - /recommendations* → Network-First (needs fresh personalization, 30-sec timeout)
 *
 * Version the cache name — updating CACHE_VERSION busts all caches on SW install.
 */

const CACHE_VERSION = 'v2'
const IMAGE_CACHE  = `sv-images-${CACHE_VERSION}`
const API_CACHE    = `sv-api-${CACHE_VERSION}`
const IMAGE_TTL    = 7  * 24 * 60 * 60 * 1000 // 7 days in ms
const API_TTL      = 5  * 60 * 1000            // 5 minutes in ms

// ── Install: activate immediately ────────────────────────────────────────────
self.addEventListener('install', () => self.skipWaiting())

// ── Activate: clean up old cache versions ────────────────────────────────────
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(
        keys
          .filter(k => k !== IMAGE_CACHE && k !== API_CACHE)
          .map(k => caches.delete(k))
      )
    ).then(() => self.clients.claim())
  )
})

// ── Fetch intercept ───────────────────────────────────────────────────────────
self.addEventListener('fetch', event => {
  const { request } = event
  const url = new URL(request.url)

  // Only intercept GET requests
  if (request.method !== 'GET') return

  // 1. TMDB images — Cache-First
  if (url.hostname === 'image.tmdb.org') {
    event.respondWith(cacheFirst(request, IMAGE_CACHE, IMAGE_TTL))
    return
  }

  // 2. Recommendations — Network-First (personalized, must be fresh)
  if (url.pathname.startsWith('/recommendations')) {
    event.respondWith(networkFirst(request, API_CACHE, API_TTL, 5000))
    return
  }

  // 3. TMDB proxy API calls — Stale-While-Revalidate
  if (url.pathname.startsWith('/tmdb/')) {
    event.respondWith(staleWhileRevalidate(request, API_CACHE, API_TTL))
    return
  }

  // Everything else: pass through to network
})

// ── Strategy: Cache-First ─────────────────────────────────────────────────────
async function cacheFirst(request, cacheName, ttlMs) {
  const cache    = await caches.open(cacheName)
  const cached   = await cache.match(request)

  if (cached && !isExpired(cached, ttlMs)) {
    return cached
  }

  try {
    const fresh = await fetch(request)
    if (fresh.ok) {
      cache.put(request, withTimestamp(fresh.clone()))
    }
    return fresh
  } catch {
    if (cached) return cached
    return new Response('Network error', { status: 408 })
  }
}

// ── Strategy: Stale-While-Revalidate ─────────────────────────────────────────
async function staleWhileRevalidate(request, cacheName, ttlMs) {
  const cache  = await caches.open(cacheName)
  const cached = await cache.match(request)

  // Fire a background revalidation regardless
  const fetchPromise = fetch(request).then(fresh => {
    if (fresh.ok) cache.put(request, withTimestamp(fresh.clone()))
    return fresh
  }).catch(() => cached)

  // If we have a non-expired cache entry, return it immediately
  if (cached && !isExpired(cached, ttlMs)) return cached

  // Otherwise wait for the network
  return fetchPromise
}

// ── Strategy: Network-First with timeout fallback ────────────────────────────
async function networkFirst(request, cacheName, ttlMs, timeoutMs) {
  const cache = await caches.open(cacheName)

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)

  try {
    const fresh = await fetch(request, { signal: controller.signal })
    clearTimeout(timer)
    if (fresh.ok) cache.put(request, withTimestamp(fresh.clone()))
    return fresh
  } catch {
    clearTimeout(timer)
    const cached = await cache.match(request)
    if (cached && !isExpired(cached, ttlMs)) return cached
    return new Response(JSON.stringify({ error: 'Offline' }), {
      status: 503,
      headers: { 'Content-Type': 'application/json' },
    })
  }
}

// ── Helpers ───────────────────────────────────────────────────────────────────

/**
 * Clone a Response and add an X-SW-Cached-At header with the current timestamp.
 * This lets isExpired() check if the cached entry is still fresh.
 */
function withTimestamp(response) {
  const headers = new Headers(response.headers)
  headers.set('X-SW-Cached-At', Date.now().toString())
  return new Response(response.body, {
    status:     response.status,
    statusText: response.statusText,
    headers,
  })
}

/** Returns true if the cached response's timestamp is older than ttlMs. */
function isExpired(response, ttlMs) {
  const cachedAt = response.headers.get('X-SW-Cached-At')
  if (!cachedAt) return true // No timestamp → treat as expired
  return Date.now() - parseInt(cachedAt, 10) > ttlMs
}
