/**
 * Signing in on a TV with a phone.
 *
 * A TV has no browser, and Google refuses sign-ins inside an app's own
 * WebView, so the TV app hands its sign-in to the viewer's phone. It works
 * like the desktop app's system-browser sign-in (src/lib/appSignIn.ts on the
 * site), except the phone is another device, so this route carries the two
 * halves across:
 *
 *   1. The TV starts an ordinary Auth0 sign-in (PKCE) but doesn't open it:
 *      POST /tv-link { authorizeUrl } → { code, secret }. The TV shows the
 *      code: "Go to stream-vault.site/activate and enter ABC-234".
 *   2. The phone's browser opens /activate, sends the code here —
 *      GET /tv-link/:code → { authorizeUrl } — and goes on to Auth0.
 *   3. Auth0 returns the phone to https://stream-vault.site/?code=…&state=…;
 *      the site passes that query here: POST /tv-link/:code/complete { search }.
 *   4. The TV, waiting on POST /tv-link/:code/wait { secret }, gets the query
 *      and exchanges the code itself. The code is useless without the PKCE
 *      verifier, which never left the TV — this route only ever holds an
 *      address anyone may see and a code nobody else can redeem.
 *
 * Links live 10 minutes in the cache (Redis, or memory). No database rows.
 */

import { Router, Request, Response } from 'express'
import { createHash, randomBytes, randomInt, timingSafeEqual } from 'crypto'
import { strictRateLimiter } from '../cybersecurity/rateLimiter'
import { tvLink as store } from '../services/cache'
import { logger } from '../lib/logger'

const router = Router()

/** How long a code works for (seconds). */
export const LINK_TTL_S = 10 * 60
/** How long one wait holds before answering "still waiting" (ms). */
const WAIT_MS = 20_000
const WAIT_STEP_MS = 1000

/** No 0/O, 1/I/L: a code read off a TV across a room and typed on a phone. */
const ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'
const CODE_LENGTH = 6

export type LinkStatus = 'waiting' | 'opened' | 'done'

interface LinkEntry {
  authorizeUrl: string
  secretHash: string
  expiresAt: number
  opened: boolean
  /** Auth0's answer as a query string (?code=…&state=…), once the phone is back. */
  search: string | null
}

export function newCode(): string {
  let code = ''
  for (let i = 0; i < CODE_LENGTH; i++) code += ALPHABET[randomInt(ALPHABET.length)]
  return code
}

/** A code as typed: any case, with or without the dash or spaces. Null when it can't be one. */
export function normalizeCode(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const code = value.toUpperCase().replace(/[\s-]/g, '')
  if (code.length !== CODE_LENGTH) return null
  for (const ch of code) if (!ALPHABET.includes(ch)) return null
  return code
}

function auth0Host(): string | null {
  const domain = process.env.AUTH0_DOMAIN?.trim()
  if (!domain) return null
  try {
    return new URL(domain.startsWith('http') ? domain : `https://${domain}`).hostname
  } catch {
    return null
  }
}

/**
 * Only this site's Auth0 authorize endpoint, rebuilt on the tenant's own
 * origin — the phone is sent wherever this says, so it must never be an open
 * redirect.
 */
export function parseAuthorizeUrl(value: unknown, host: string | null = auth0Host()): string | null {
  if (typeof value !== 'string' || !host || value.length > 4096) return null
  try {
    const url = new URL(value)
    if (url.protocol !== 'https:' || url.hostname !== host || url.port || url.pathname !== '/authorize') return null
    const params = url.searchParams
    if (!params.get('client_id') || !params.get('state') || !params.get('code_challenge')) return null
    return `https://${host}/authorize${url.search}`
  } catch {
    return null
  }
}

const KEPT_PARAMS: Record<string, number> = { code: 512, state: 1024, error: 100, error_description: 500 }

/** Auth0's answer, keeping only what a sign-in needs. Null when it isn't one. */
export function parseReturnSearch(value: unknown): string | null {
  if (typeof value !== 'string' || value.length > 4096) return null
  const params = new URLSearchParams(value.replace(/^\?/, ''))
  const kept = new URLSearchParams()
  for (const [name, max] of Object.entries(KEPT_PARAMS)) {
    const v = params.get(name)
    if (v !== null) kept.set(name, v.slice(0, max))
  }
  if (!kept.get('state') || !(kept.get('code') || kept.get('error'))) return null
  return `?${kept.toString()}`
}

function hashSecret(secret: string): string {
  return createHash('sha256').update(secret).digest('hex')
}

function secretMatches(secret: unknown, hash: string): boolean {
  if (typeof secret !== 'string' || secret.length > 200) return false
  const a = Buffer.from(hashSecret(secret), 'hex')
  const b = Buffer.from(hash, 'hex')
  return a.length === b.length && timingSafeEqual(a, b)
}

function statusOf(entry: LinkEntry): LinkStatus {
  return entry.search ? 'done' : entry.opened ? 'opened' : 'waiting'
}

async function read(code: string): Promise<LinkEntry | null> {
  const entry = await store.get<LinkEntry>(code)
  return entry && entry.expiresAt > Date.now() ? entry : null
}

async function write(code: string, entry: LinkEntry): Promise<void> {
  const ttl = Math.ceil((entry.expiresAt - Date.now()) / 1000)
  if (ttl > 0) await store.set(code, entry, ttl)
}

/** The TV: start a link. */
router.post('/', strictRateLimiter, async (req: Request, res: Response) => {
  const authorizeUrl = parseAuthorizeUrl(req.body?.authorizeUrl)
  if (!authorizeUrl) {
    res.status(400).json({ error: 'authorizeUrl must be this site’s Auth0 sign-in address' })
    return
  }
  let code = newCode()
  for (let tries = 0; (await store.get(code)) && tries < 5; tries++) code = newCode()
  const secret = randomBytes(32).toString('hex')
  await write(code, { authorizeUrl, secretHash: hashSecret(secret), expiresAt: Date.now() + LINK_TTL_S * 1000, opened: false, search: null })
  res.status(201).json({ code, secret, expiresIn: LINK_TTL_S })
})

/** The phone: where to sign in for this code. */
router.get('/:code', strictRateLimiter, async (req: Request, res: Response) => {
  const code = normalizeCode(req.params.code)
  const entry = code ? await read(code) : null
  if (!code || !entry || entry.search) {
    res.status(404).json({ error: 'That code isn’t valid. Check the code on your TV, or get a new one there.' })
    return
  }
  if (!entry.opened) await write(code, { ...entry, opened: true })
  res.json({ authorizeUrl: entry.authorizeUrl })
})

/** The site, back from Auth0 on the phone: hand the answer to the TV. */
router.post('/:code/complete', strictRateLimiter, async (req: Request, res: Response) => {
  const code = normalizeCode(req.params.code)
  const search = parseReturnSearch(req.body?.search)
  if (!code || !search) {
    res.status(400).json({ error: 'Invalid sign-in answer' })
    return
  }
  const entry = await read(code)
  if (!entry) {
    res.status(404).json({ error: 'This sign-in expired. Get a new code on your TV.' })
    return
  }
  if (entry.search) {
    res.status(409).json({ error: 'This code was already used.' })
    return
  }
  await write(code, { ...entry, opened: true, search })
  res.status(204).end()
})

/**
 * The TV: wait for the phone. Answers as soon as the status differs from
 * `seen` (or after 20 s), so the TV asks a few times a minute, not every second.
 * Once it has handed over the answer the link is gone.
 */
router.post('/:code/wait', async (req: Request, res: Response) => {
  const code = normalizeCode(req.params.code)
  let entry = code ? await read(code) : null
  if (!code || !entry) {
    res.status(410).json({ status: 'expired' })
    return
  }
  if (!secretMatches(req.body?.secret, entry.secretHash)) {
    res.status(403).json({ error: 'Not this TV’s code' })
    return
  }
  const seen = req.body?.seen
  let closed = false
  req.on('close', () => {
    closed = true
  })
  const until = Date.now() + WAIT_MS
  while (entry && statusOf(entry) === seen && Date.now() < until && !closed) {
    await new Promise((resolve) => setTimeout(resolve, WAIT_STEP_MS))
    entry = await read(code)
  }
  if (closed) return
  if (!entry) {
    res.status(410).json({ status: 'expired' })
    return
  }
  const status = statusOf(entry)
  if (status === 'done') {
    await store.del(code)
    logger.info('TV signed in with a phone')
    res.json({ status, search: entry.search })
    return
  }
  res.json({ status })
})

export default router
