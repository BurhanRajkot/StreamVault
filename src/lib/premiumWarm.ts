/**
 * Premium, ready before Play is pressed.
 *
 * Starting a film used to be three waits in a row once Play was pressed:
 * the release search (1-2 s, up to ~11 s when the indexers are asked
 * afresh), getting the release ready on Real-Debrid (~3-4 s: add it,
 * unrestrict the link, read its media info), and the video connecting.
 * The title page already starts the search (lib/premiumSearch). This does
 * the second step there too: once the viewer has settled on a title, the
 * release the player would start first is made ready (POST /debrid/warm,
 * always instant-only, so nothing is left downloading), and the player
 * takes that answer when Play comes — straight to the video.
 *
 * `planPlayback` is the player's own rule for which release goes first,
 * so the one warmed is the one played.
 */

import { playDebridRelease, type DebridPlayback, type DebridRelease } from './debridApi'
import { detectBrowserVideoSupport, fitReleasesToConnection, rankReleasesForPlayback, type BrowserVideoSupport } from './releasePlayback'
import { appConvertsAudio } from './localStream'
import { estimateConnection, knownThroughput } from './connection'
import { findPremiumReleases, type PremiumSearchTarget } from './premiumSearch'

/**
 * Releases tried automatically before an error is shown — each costs one
 * backend round trip (~3-4s; a release Real-Debrid refuses outright, e.g. a
 * DMCA'd one, well under 1s). Popular series often have several refused
 * packs at the top.
 */
export const MAX_AUTO_RELEASE_ATTEMPTS = 8

export interface PlayPlan {
  /** Releases tagged as in Real-Debrid's cache, best first — the Quality menu's list. */
  instant: DebridRelease[]
  /** What's tried automatically, in order. */
  queue: DebridRelease[]
  /** Nothing came tagged as cached: each in `queue` is asked "instant?" before anything is downloaded. */
  probing: boolean
  /** The best uncached, shared, single release — downloaded when nothing instant starts. */
  uncachedFallback: DebridRelease | null
}

export interface PlanOptions {
  support: BrowserVideoSupport
  /** What the connection carries, in kbit/s, when known. */
  kbps: number | null
  /** How long the film runs (its own figure or a typical one), in seconds. */
  durationS: number
  /** The film's own running time, when known — a heavy file is only told by its bitrate. */
  knownDurationS?: number
  /** Ask about releases nobody shares any more too (an archive's: lib/f1). */
  probeUnseeded?: boolean
  appConvertsAudio: boolean
  /** The audio language wanted (lib/audioLanguage) — English when not given. */
  audioLang?: string
  /** The language the title's releases are in when they don't say — Japanese for anime. */
  audioBase?: string
}

/** Which releases the player starts with, in which order. Pure. */
export function planPlayback(releases: DebridRelease[], opts: PlanOptions): PlayPlan {
  const ranked = rankReleasesForPlayback(releases, opts.support, {
    durationS: opts.knownDurationS,
    appConvertsAudio: opts.appConvertsAudio,
    audioLang: opts.audioLang,
    audioBase: opts.audioBase,
  })
  /** Best first, as far as this connection can carry it. */
  const fit = (list: DebridRelease[]) => fitReleasesToConnection(list, opts.kbps, opts.durationS, opts.support)
  // An uncached release needs live seeders, or it just sits in Real-Debrid's download queue forever
  const seeded = (r: DebridRelease) => parseInt(r.seeders, 10) > 0
  const uncached = fit(ranked.filter((r) => !r.cached && seeded(r)))
  // A pack would be downloaded whole for the one thing in it that's wanted: never the fallback
  const uncachedFallback = uncached.find((r) => !(r as { pack?: boolean }).pack) ?? null

  const instant = ranked.filter((r) => r.cached)
  if (instant.length > 0) return { instant, queue: fit(instant), probing: false, uncachedFallback }

  // Nothing says what's cached, but popular releases usually are: ask
  // Real-Debrid about the best few before downloading anything — and, for
  // an archive, about the ones nobody shares any more as well.
  const probe = opts.probeUnseeded ? [...uncached, ...ranked.filter((r) => !r.cached && !seeded(r))] : uncached
  return { instant: [], queue: probe.slice(0, MAX_AUTO_RELEASE_ATTEMPTS), probing: true, uncachedFallback }
}

/** Which file of a release: an episode's, or an F1 session's. */
export interface WarmFileOptions {
  season?: number
  episode?: number
  session?: string
}

/**
 * How long a viewer is on a title's page before its release is got ready —
 * past someone just passing through (each warm-up is a few Real-Debrid
 * calls). Short: the search it waits for takes a second or more anyway, and
 * every moment of it is a moment Play would wait (it was 1.2 s, and Play
 * pressed sooner found nothing ready).
 */
export const WARM_AFTER_MS = 300

/**
 * How long the release choice waits for the connection measurement — the
 * warm-up's and the player's alike. They must choose alike: the choice
 * follows the connection, and a warm-up that readied a release the player
 * then passed over (the 4K one ready, the 1080p one played) saved nothing.
 */
export const CONNECTION_WAIT_MS = 600

/** How far down the player's own order a release got ready ahead may sit and still be played first. */
const WARM_PREFERENCE_DEPTH = 3

/** A warmed answer is taken for this long — Real-Debrid's links last hours; the backend keeps its own answers 20 minutes. */
const WARM_TTL_MS = 10 * 60_000

const warmed = new Map<string, { at: number; answer: Promise<DebridPlayback> }>()

/**
 * Releases the player has already asked for itself, by key → when: a
 * warm-up arriving after Play mustn't ask Real-Debrid a second time (two
 * requests could each add the release to the account).
 */
const claimed = new Map<string, number>()
/** A claim stands this long — longer than any start takes. */
const CLAIM_MS = 2 * 60_000

function warmKey(hash: string, file: WarmFileOptions): string {
  return [hash.toLowerCase(), file.season ?? '', file.episode ?? '', file.session ?? ''].join('|')
}

/**
 * The answer a warm-up got (or is getting) for this release and file, if
 * any — taken once: a retry asks afresh.
 */
export function takeWarmPlayback(release: Pick<DebridRelease, 'info_hash'>, file: WarmFileOptions): Promise<DebridPlayback> | null {
  const key = warmKey(release.info_hash, file)
  const hit = warmed.get(key)
  if (!hit) {
    // Nothing ready: the player asks for this one itself, and a warm-up still on its way stands down
    claimed.set(key, Date.now())
    return null
  }
  warmed.delete(key)
  return Date.now() - hit.at < WARM_TTL_MS ? hit.answer : null
}

export interface WarmTarget {
  /** The releases, as the player will find them (the same shared request). */
  releases: () => Promise<DebridRelease[]>
  file: WarmFileOptions
  token?: string
  durationS: number
  knownDurationS?: number
  probeUnseeded?: boolean
  audioLang?: string
  audioBase?: string
}

/**
 * Get the release the player would start first ready on Real-Debrid, so
 * Play takes the answer instead of waiting for it. Never throws; does
 * nothing when that release is warm already.
 */
export async function warmPremiumPlay(target: WarmTarget): Promise<void> {
  try {
    // Measured alongside the search, and kept: the player reads the same figure
    const connection = settleWithin(estimateConnection(), CONNECTION_WAIT_MS)
    const releases = await target.releases()
    const kbps = (await connection) ?? knownThroughput()
    const plan = planPlayback(releases, {
      support: detectBrowserVideoSupport(),
      kbps,
      durationS: target.durationS,
      knownDurationS: target.knownDurationS,
      probeUnseeded: target.probeUnseeded,
      appConvertsAudio: appConvertsAudio(),
      audioLang: target.audioLang,
      audioBase: target.audioBase,
    })
    const first = plan.queue[0]
    if (!first) return
    const key = warmKey(first.info_hash, target.file)
    const held = warmed.get(key)
    if (held && Date.now() - held.at < WARM_TTL_MS) return
    // Play came first and is asking for it already
    const claim = claimed.get(key)
    if (claim && Date.now() - claim < CLAIM_MS) return
    const answer = playDebridRelease(first, target.token, { ...target.file, warm: true })
    const entry = { at: Date.now(), answer }
    warmed.set(key, entry)
    answer.catch(() => {
      if (warmed.get(key) === entry) warmed.delete(key)
    })
  } catch {
    // A warm-up is a nicety: Play does it all itself when it didn't happen
  }
}

/** A warm-up is ready or on its way for this release and file. */
export function hasWarmPlayback(release: Pick<DebridRelease, 'info_hash'>, file: WarmFileOptions): boolean {
  const hit = warmed.get(warmKey(release.info_hash, file))
  return !!hit && Date.now() - hit.at < WARM_TTL_MS
}

/**
 * The player's order, with a release got ready ahead of Play moved to the
 * front when it's among the first few — near enough the player's own first
 * choice that starting at once beats waiting a few seconds for that one.
 * Further down (the connection changed a lot since), the order stands.
 */
export function preferWarmed(queue: DebridRelease[], file: WarmFileOptions): DebridRelease[] {
  const index = queue.slice(0, WARM_PREFERENCE_DEPTH).findIndex((r) => hasWarmPlayback(r, file))
  if (index <= 0) return queue
  return [queue[index], ...queue.slice(0, index), ...queue.slice(index + 1)]
}

/** `promise`'s value if it settles within `ms`, else null. Never rejects. */
function settleWithin<T>(promise: Promise<T>, ms: number): Promise<T | null> {
  return new Promise((resolve) => {
    const timer = setTimeout(() => resolve(null), ms)
    promise.then(
      (value) => {
        clearTimeout(timer)
        resolve(value)
      },
      () => {
        clearTimeout(timer)
        resolve(null)
      }
    )
  })
}

/** Forget every warmed answer — tests only. */
export function resetWarmForTests(): void {
  warmed.clear()
  claimed.clear()
}

/**
 * Warm a movie or an episode from its title page: its search (shared with
 * the player) and then the release Play would start. Running times as the
 * player sizes them — the title's own, else a typical one.
 */
export function warmPremiumTitle(target: PremiumSearchTarget, token: string | undefined, runtimeMinutes?: number | null): Promise<void> {
  const tv = target.mediaType === 'tv'
  const known = runtimeMinutes && runtimeMinutes > 0 ? runtimeMinutes * 60 : undefined
  return warmPremiumPlay({
    releases: () => findPremiumReleases(target, token),
    file: tv ? { season: target.season, episode: target.episode } : {},
    token,
    durationS: known ?? (tv ? 45 : 120) * 60,
    knownDurationS: known,
    audioLang: target.audioLang,
    audioBase: target.audioBase,
  })
}
