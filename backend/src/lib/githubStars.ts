/**
 * Has a GitHub account starred StreamVault's repository?
 *
 * Asked when someone requests Premium access with their GitHub username, so
 * the admin sees a checked star rather than a claim. The repository's own
 * stargazer list needs a GitHub login now, but a person's starred list is
 * public and newest first — a star given for this shows on its first page.
 * Answers are kept for a while (a miss briefly: they may star a moment
 * later). Without a token GitHub allows 60 calls an hour per IP; set
 * GITHUB_TOKEN (any token, no scopes) for 5,000. A refused token falls back
 * to asking without one.
 */

import { logger } from './logger'

export const STAR_REPO = process.env.GITHUB_STAR_REPO || 'BurhanRajkot/StreamVault'

/** GitHub's rule: 1–39 letters, digits or single hyphens, not starting or ending with one. */
export const GITHUB_USERNAME_RE = /^[A-Za-z0-9](?:[A-Za-z0-9]|-(?=[A-Za-z0-9])){0,38}$/

const HIT_TTL_MS = 10 * 60_000
const MISS_TTL_MS = 30_000
const MAX_PAGES = 10
const CACHE_CAP = 2_000

const cache = new Map<string, { at: number; starred: boolean }>()
let tokenRefused = false

async function ask(url: string): Promise<Response> {
  const headers: Record<string, string> = {
    Accept: 'application/vnd.github+json',
    'User-Agent': 'StreamVault-backend',
    'X-GitHub-Api-Version': '2022-11-28',
  }
  const token = process.env.GITHUB_TOKEN
  if (token && !tokenRefused) headers.Authorization = `Bearer ${token}`
  const res = await fetch(url, { headers, signal: AbortSignal.timeout(8_000) })
  if (res.status === 401 && headers.Authorization) {
    tokenRefused = true
    logger.warn('GITHUB_TOKEN was refused by GitHub; checking stars without it')
    return ask(url)
  }
  return res
}

async function lookUp(login: string): Promise<boolean> {
  const repo = STAR_REPO.toLowerCase()
  for (let page = 1; page <= MAX_PAGES; page++) {
    const res = await ask(`https://api.github.com/users/${encodeURIComponent(login)}/starred?per_page=100&page=${page}`)
    if (res.status === 404) return false // no such account
    if (!res.ok) throw new Error(`GitHub answered ${res.status}`)
    const batch = (await res.json()) as { full_name?: unknown }[]
    if (batch.some((r) => typeof r.full_name === 'string' && r.full_name.toLowerCase() === repo)) return true
    if (batch.length < 100) return false
  }
  return false
}

/**
 * true / false — or null when GitHub couldn't be asked (rate limit, outage),
 * so the request still goes through and the admin sees "not checked".
 */
export async function hasStarred(username: string): Promise<boolean | null> {
  const login = username.toLowerCase()
  const hit = cache.get(login)
  if (hit && Date.now() - hit.at < (hit.starred ? HIT_TTL_MS : MISS_TTL_MS)) return hit.starred
  try {
    const starred = await lookUp(login)
    if (cache.size >= CACHE_CAP) cache.clear()
    cache.set(login, { at: Date.now(), starred })
    return starred
  } catch (err) {
    logger.warn('GitHub star check failed', { error: err instanceof Error ? err.message : String(err) })
    return hit?.starred ?? null
  }
}

export const __test = {
  reset() {
    cache.clear()
    tokenRefused = false
  },
}
