import { afterEach, beforeEach, describe, expect, it } from 'bun:test'
import type { DebridRelease } from './debridApi'
import { MAX_AUTO_RELEASE_ATTEMPTS, hasWarmPlayback, planPlayback, preferWarmed, resetWarmForTests, takeWarmPlayback, warmPremiumPlay } from './premiumWarm'

const support = { hevc: false, av1: false }
const GB = 1024 ** 3

function release(name: string, overrides: Partial<DebridRelease> = {}): DebridRelease {
  return {
    id: name,
    name,
    info_hash: name.replace(/[^a-z0-9]/gi, '').padEnd(40, '0').slice(0, 40).toUpperCase(),
    seeders: '10',
    leechers: '1',
    size: String(4 * GB),
    num_files: '1',
    username: 'u',
    added: '0',
    category: '207',
    cached: false,
    ...overrides,
  }
}

const opts = { support, kbps: null, durationS: 7200, appConvertsAudio: false }

describe('planPlayback', () => {
  it('starts with the cached releases, keeping the best uncached one to download', () => {
    const cached = release('Film.2020.1080p.WEB-DL.x264.AAC', { cached: true })
    const uncached = release('Film.2020.720p.WEB-DL.x264.AAC')
    const plan = planPlayback([uncached, cached], opts)
    expect(plan.probing).toBe(false)
    expect(plan.queue.map((r) => r.name)).toEqual([cached.name])
    expect(plan.instant.map((r) => r.name)).toEqual([cached.name])
    expect(plan.uncachedFallback?.name).toBe(uncached.name)
  })

  it('probes the shared releases when nothing says what is cached — the unshared too, for an archive', () => {
    const shared = release('F1.2026.R21.Race.1080p.x264', { seeders: '50' })
    const unshared = release('F1.2026.R21.Race.720p.x264', { seeders: '0' })
    expect(planPlayback([shared, unshared], opts).queue.map((r) => r.name)).toEqual([shared.name])
    const archive = planPlayback([shared, unshared], { ...opts, probeUnseeded: true })
    expect(archive.probing).toBe(true)
    expect(archive.queue.map((r) => r.name)).toEqual([shared.name, unshared.name])
  })

  it('never lists more to probe than the player will try', () => {
    const many = Array.from({ length: 20 }, (_, i) => release(`Film.2020.1080p.WEB-DL.x264.AAC.v${i}`))
    expect(planPlayback(many, opts).queue).toHaveLength(MAX_AUTO_RELEASE_ATTEMPTS)
  })
})

describe('warmPremiumPlay', () => {
  const realFetch = globalThis.fetch
  let posts: Array<{ url: string; body: Record<string, unknown> }>

  beforeEach(() => {
    resetWarmForTests()
    posts = []
    globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
      posts.push({ url: String(input), body: JSON.parse(String(init?.body ?? '{}')) as Record<string, unknown> })
      return new Response(JSON.stringify({ status: 'ready', directUrl: 'https://rd/x.mkv' }), { status: 200, headers: { 'content-type': 'application/json' } })
    }) as typeof fetch
  })
  afterEach(() => {
    globalThis.fetch = realFetch
  })

  const film = release('Film.2020.1080p.WEB-DL.x264.AAC', { cached: true })
  const target = { releases: async () => [film], file: { season: 1, episode: 2 }, durationS: 2700 }

  it('gets the first release ready through /debrid/warm, once, and hands the answer over once', async () => {
    await warmPremiumPlay(target)
    await warmPremiumPlay(target)
    expect(posts).toHaveLength(1)
    expect(posts[0].url).toEndWith('/debrid/warm')
    expect(posts[0].body).toMatchObject({ hash: film.info_hash, season: 1, episode: 2, instantOnly: true })

    expect(takeWarmPlayback(film, { season: 1, episode: 3 })).toBeNull()
    const answer = takeWarmPlayback(film, { season: 1, episode: 2 })
    expect(await answer).toMatchObject({ status: 'ready' })
    expect(takeWarmPlayback(film, { season: 1, episode: 2 })).toBeNull()
  })

  it('does nothing when there is nothing to start, and never throws', async () => {
    await warmPremiumPlay({ ...target, releases: async () => [] })
    await warmPremiumPlay({ ...target, releases: async () => Promise.reject(new Error('down')) })
    expect(posts).toHaveLength(0)
  })

  it('plays the release got ready first when it is near the top of the player\'s own order', async () => {
    const best = release('Film.2020.2160p.WEB-DL.x265.AAC', { cached: true })
    const second = release('Film.2020.1080p.WEB-DL.x264.AAC', { cached: true })
    const third = release('Film.2020.1080p.BluRay.x264.AAC', { cached: true })
    const fourth = release('Film.2020.720p.WEB-DL.x264.AAC', { cached: true })
    const file = { season: 1, episode: 2 }

    // The warm-up chose the 1080p (it saw a slower connection than the player does)
    await warmPremiumPlay({ ...target, releases: async () => [second] })
    expect(hasWarmPlayback(second, file)).toBe(true)
    expect(hasWarmPlayback(second, { season: 1, episode: 3 })).toBe(false)
    expect(preferWarmed([best, second, third], file).map((r) => r.name)).toEqual([second.name, best.name, third.name])
    // Already first, or nothing warm: the order stands
    expect(preferWarmed([second, best], file).map((r) => r.name)).toEqual([second.name, best.name])
    expect(preferWarmed([best, third], file).map((r) => r.name)).toEqual([best.name, third.name])

    // Too far down the player's order: not worth playing over the better ones
    resetWarmForTests()
    await warmPremiumPlay({ ...target, releases: async () => [fourth] })
    expect(preferWarmed([best, second, third, fourth], file).map((r) => r.name)).toEqual([best.name, second.name, third.name, fourth.name])
  })

  it('stands down when Play already asked for that release itself', async () => {
    // The player found nothing ready and asks Real-Debrid on its own…
    expect(takeWarmPlayback(film, { season: 1, episode: 2 })).toBeNull()
    // …so a warm-up arriving afterwards doesn't ask a second time
    await warmPremiumPlay(target)
    expect(posts).toHaveLength(0)
  })
})

