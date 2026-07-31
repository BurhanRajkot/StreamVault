import './loadEnv'

/**
 * Canonical TMDB API base URL for every outbound upstream call.
 *
 * Why this is configurable: some networks (notably several Indian ISPs) filter
 * `api.themoviedb.org` by TLS SNI — the connection is reset during the Client
 * Hello, so HTTPS fails while DNS, plain HTTP and `image.tmdb.org` all work.
 * `api.tmdb.org` is a TMDB-owned alias serving the identical API and is not
 * caught by that filter, so it is a drop-in escape hatch for local development.
 *
 * The default is unchanged, so deployed environments keep their existing
 * behaviour; set TMDB_BASE_URL in the environment to override.
 */

/**
 * Hosts we are willing to send the TMDB API key to. The override is an
 * operational convenience, not an open redirect — restricting it to
 * TMDB-owned hostnames keeps the SSRF guarantees of the callers intact.
 */
export const TMDB_ALLOWED_HOSTS = new Set(['api.themoviedb.org', 'api.tmdb.org'])

const DEFAULT_TMDB_BASE_URL = 'https://api.themoviedb.org/3'

function resolveBaseUrl(): string {
  const configured = process.env.TMDB_BASE_URL?.trim()
  if (!configured) return DEFAULT_TMDB_BASE_URL

  let parsed: URL
  try {
    parsed = new URL(configured)
  } catch {
    throw new Error(`TMDB_BASE_URL is not a valid URL: ${JSON.stringify(configured)}`)
  }

  if (parsed.protocol !== 'https:') {
    throw new Error(`TMDB_BASE_URL must use https, got: ${parsed.protocol}`)
  }

  if (!TMDB_ALLOWED_HOSTS.has(parsed.hostname)) {
    throw new Error(
      `TMDB_BASE_URL host not allowed: ${parsed.hostname}. ` +
      `Allowed: ${[...TMDB_ALLOWED_HOSTS].join(', ')}`
    )
  }

  // Normalise away a trailing slash so callers can concatenate `/path` safely.
  return configured.replace(/\/+$/, '')
}

export const TMDB_BASE_URL = resolveBaseUrl()

/**
 * Defence-in-depth check for a fully constructed TMDB URL. Throws if the URL
 * resolves to anything outside the TMDB allowlist.
 */
export function assertTmdbHost(url: string): void {
  const { hostname } = new URL(url)
  if (!TMDB_ALLOWED_HOSTS.has(hostname)) {
    throw new Error(`SSRF blocked — unexpected host: ${hostname}`)
  }
}
