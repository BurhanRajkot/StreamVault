/**
 * Reading Formula 1 release names: which season, which race weekend and
 * which sessions a torrent holds. Used by the F1 archive (lib/f1.ts) to sort
 * search results into a race's sessions, and by the Premium player
 * (lib/debrid.ts pickPlaybackFile) to pick one session's file out of a
 * torrent that holds several.
 *
 * Names follow no single scheme. Seen on apibay (2026-11-22):
 *   formula1 2025 abu dhabi grand prix 720p WEB H264-JFF              (no session word: the race)
 *   formula1 2025 canadian grand prix practice three 720p WEB H264-JFF
 *   Formula1.2023.Bahrain.Grand.Prix.1080p.WEB.h264-VERUM[TGx]
 *   Formula1 2021 Monaco Grand Prix Qualifying 1080p50 HDTV DD2.0 x264-wAm
 *   Formula.1.2023.Round.04.AzerbaijanGP.Sprint.Shootout.International.MULTi.1080p.SS
 *   Formula 1 2012 R10 German Grand Prix Race
 *   Formula 1 2015 Brazil Qualifying + Race 720p HD 50fps             (two sessions, one torrent)
 *   F1.2026.R18.United.States.Grand.Prix.SkyUHD.2160P                  (77 GB: the whole weekend)
 *   Formula 1 - 2008-11-02 - Round 18 - Brazil (Race)
 *
 * Pure: no I/O, so it's cheap to test against real names.
 */

/** A race weekend's sessions, in the order they're listed. */
export const F1_SESSIONS = ['fp1', 'fp2', 'fp3', 'sprint-qualifying', 'sprint', 'qualifying', 'race'] as const
export type F1Session = (typeof F1_SESSIONS)[number]

export function isF1Session(value: unknown): value is F1Session {
  return typeof value === 'string' && (F1_SESSIONS as readonly string[]).includes(value)
}

/**
 * Lowercase words, for matching: accents dropped ("São" → "sao"), joined
 * words split ("AbuDhabiGP" → "abu dhabi gp"), punctuation turned to spaces.
 */
export function normalizeName(name: string): string {
  return name
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/&amp;/gi, ' and ')
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
}

/** `phrase` (normalized) appears in `words` (normalized) as whole words. */
function hasPhrase(words: string, phrase: string): boolean {
  return phrase.length > 0 && ` ${words} `.includes(` ${phrase} `)
}

// ---------------------------------------------------------------------------
// Sessions
// ---------------------------------------------------------------------------

/**
 * Programmes around a session rather than the session itself. Taken out of
 * a name before its sessions are read, so "Pre Race Show" doesn't read as
 * the race.
 */
const SHOW_AROUND_SESSION =
  /\b(?:pre|post) ?(?:race|qualifying|quali|qualy|sprint|session)(?: (?:show|build ?up|analysis|reaction|interviews?|press conference))?\b|\b(?:race|qualifying|quali|sprint) (?:highlights|edit|analysis|reaction|recap|debrief|review)\b|\bweekend warm ?up\b/g

/** Words that mark a programme that isn't a session: shows, highlights, extras, testing. */
const EXTRA_WORDS =
  /\b(?:extra|build ?up|warm ?up|notebook|press|principals?|conferences?|confer|interviews?|highlights|analysis|debrief|preview|paddock|forum|show|review|teds|chequered flag|grid walk|podium|parade|onboards?|on board|team radio|pit ?lane|data channel|driver tracker|live timing|kids|tech talk|countdown|reaction|recap|magazine|documentary|drive to survive|testing|tests?|pre ?season|shakedown|launch|f1 live|uncut paddock)\b/

/** A whole season (or more) in one torrent — not offered: too big to stream, and no telling where a race is in it. */
const SEASON_PACK = /\b(?:season|complete|all races|championship|collection)\b/

/**
 * Torrents larger than this with no session in their name hold the whole
 * weekend (a 4K "R18.United.States.Grand.Prix.SkyUHD" pack is ~77 GB); below
 * it, a name with no session word is the race — JFF and VERUM name it so.
 */
const WEEKEND_PACK_BYTES = 40 * 1024 ** 3

export interface F1SessionRead {
  /** The sessions it holds, weekend order. Empty: it isn't a session (a show, an extra). */
  sessions: F1Session[]
  /** It holds more than one session — the one wanted has to be picked out of it. */
  pack: boolean
}

/**
 * The sessions a release (or a file inside one) holds, read from its name.
 *
 * @param year      - the season, when known: 2021's "Sprint Qualifying" was the Saturday sprint race itself
 * @param sizeBytes - the torrent's size, when known: tells a weekend pack from a race with no session in its name
 */
export function readSessions(name: string, { year, sizeBytes }: { year?: number; sizeBytes?: number } = {}): F1SessionRead {
  let words = normalizeName(name).replace(SHOW_AROUND_SESSION, ' extra ')
  const found = new Set<F1Session>()
  const take = (pattern: RegExp, session: F1Session) => {
    if (!pattern.test(words)) return
    found.add(session)
    words = words.replace(new RegExp(pattern.source, 'g'), ' ')
  }

  // "Race 15" numbers the round (older names), it doesn't name the session
  words = words.replace(/\brace (\d{1,2})\b/g, ' round $1 ')
  // "Practice 1+2" / "Practice 1 and 2": each of them
  words = words.replace(/\bpractice ([123])((?: (?:and )?[123])+)\b/g, (_m, first: string, rest: string) =>
    [first, ...(rest.match(/[123]/g) ?? [])].map((n) => `practice ${n}`).join(' ')
  )

  take(/\bsprint (?:qualifying|quali|qualy|qual|qualification|shootout)\b/, year === 2021 ? 'sprint' : 'sprint-qualifying')
  take(/\bsprint(?: race)?\b/, 'sprint')
  take(/\b(?:fp ?1|p1|(?:friday )?(?:free )?practice (?:session )?0?(?:1|one)|first (?:free )?practice)\b/, 'fp1')
  take(/\b(?:fp ?2|p2|(?:friday )?(?:free )?practice (?:session )?0?(?:2|two)|second (?:free )?practice)\b/, 'fp2')
  take(/\b(?:fp ?3|p3|(?:saturday )?(?:free )?practice (?:session )?0?(?:3|three)|third (?:free )?practice|saturday (?:free )?practice)\b/, 'fp3')
  take(/\b(?:qualifying|quali|qualy|qual|qualify|qualification)\b/, 'qualifying')
  take(/\b(?:full race|grand prix race|race)\b/, 'race')

  const weekend = /\b(?:full weekend|complete weekend|whole weekend|all sessions|weekend)\b/.test(words)
  const extra = EXTRA_WORDS.test(words)
  // A practice it doesn't number ("Friday Practice", "Practice + Qualifying"): which one is anyone's guess
  const unnumberedPractice = /\b(?:practice|practices|training)\b/.test(words)

  let sessions = F1_SESSIONS.filter((s) => found.has(s))
  if (sessions.length === 0) {
    if (weekend) sessions = [...F1_SESSIONS]
    else if (!extra && !unnumberedPractice) sessions = sizeBytes !== undefined && sizeBytes > WEEKEND_PACK_BYTES ? [...F1_SESSIONS] : ['race']
  }
  return { sessions, pack: sessions.length > 1 }
}

/** The round number a name gives ("R08", "Round 08", "Race 15"), or null. */
export function readRound(name: string): number | null {
  const words = normalizeName(name)
  const m = /\b(?:r|rd)(\d{1,2})\b/.exec(words) ?? /\b(?:round|rd|race) (\d{1,2})\b/.exec(words)
  if (!m) return null
  const round = Number(m[1])
  return round >= 1 && round <= 30 ? round : null
}

// ---------------------------------------------------------------------------
// Which race weekend
// ---------------------------------------------------------------------------

/** What a season's calendar says about one race — enough to recognise it in a release name. */
export interface RaceToMatch {
  round: number
  /** "Abu Dhabi Grand Prix" */
  name: string
  /** "UAE" */
  country: string
  /** "Abu Dhabi" */
  locality: string
}

/**
 * Other names release groups use for a Grand Prix, keyed by the Grand Prix's
 * own (normalized, "Grand Prix" dropped). The first one is searched for as
 * well as the Grand Prix's own name, so it's the commonest — usually the
 * country. Circuit names come last: two races at one circuit in a season
 * (Silverstone, 2020) are told apart by the Grand Prix's own name, which
 * always outranks these.
 */
const RACE_ALIASES: Record<string, string[]> = {
  'abu dhabi': ['abudhabi', 'yas marina', 'uae'],
  australian: ['australia', 'melbourne', 'albert park'],
  austrian: ['austria', 'spielberg', 'red bull ring'],
  azerbaijan: ['baku'],
  bahrain: ['bahrein'],
  barcelona: ['catalunya'],
  belgian: ['belgium', 'spa'],
  brazilian: ['brazil', 'interlagos', 'sao paulo'],
  british: ['britain', 'great britain', 'england', 'silverstone'],
  canadian: ['canada', 'montreal'],
  chinese: ['china', 'shanghai'],
  dutch: ['netherlands', 'holland', 'zandvoort'],
  eifel: ['nurburgring'],
  'emilia romagna': ['imola'],
  european: ['europe', 'valencia'],
  french: ['france', 'paul ricard', 'magny cours'],
  german: ['germany', 'hockenheim', 'nurburgring'],
  hungarian: ['hungary', 'hungaroring', 'budapest'],
  indian: ['india', 'buddh'],
  italian: ['italy', 'monza'],
  japanese: ['japan', 'suzuka'],
  korean: ['korea', 'yeongam'],
  'las vegas': ['vegas'],
  malaysian: ['malaysia', 'sepang'],
  mexican: ['mexico', 'mexico city'],
  'mexico city': ['mexico', 'mexican'],
  miami: [],
  monaco: ['monte carlo'],
  portuguese: ['portugal', 'portimao', 'algarve'],
  qatar: ['lusail', 'losail'],
  russian: ['russia', 'sochi'],
  'sakhir': [],
  'san marino': ['imola'],
  'sao paulo': ['brazilian', 'brazil', 'interlagos'],
  'saudi arabian': ['saudi arabia', 'saudi', 'jeddah'],
  singapore: ['marina bay'],
  spanish: ['spain', 'barcelona', 'catalunya', 'madrid'],
  styrian: ['styria'],
  turkish: ['turkey', 'istanbul'],
  tuscan: ['tuscany', 'mugello'],
  'united states': ['usa', 'usgp', 'us', 'austin', 'cota'],
  '70th anniversary': [],
}

/**
 * Grand Prix names that are also a language, which release names use for
 * the commentary ("GP.Australia.2009.[Spanish]"): they only name the race
 * followed by "Grand Prix" or "GP".
 */
const LANGUAGE_NAMES = new Set([
  'spanish', 'german', 'french', 'italian', 'hungarian', 'portuguese', 'dutch', 'turkish',
  'russian', 'chinese', 'japanese', 'korean', 'swedish', 'polish', 'brazilian',
])

/** A Grand Prix's own name, normalized: "São Paulo Grand Prix" → ["sao paulo"]; "Bahrain Grand Prix in Malaysia" → its parts too. */
function ownNames(race: RaceToMatch): string[] {
  const own = normalizeName(race.name).replace(/\bgrand prix\b/g, ' ').replace(/\s+/g, ' ').trim()
  const parts = own.split(' in ').map((p) => p.trim()).filter(Boolean)
  return [...new Set([own, ...(parts.length > 1 ? parts : [])])].filter(Boolean)
}

function aliasesOf(race: RaceToMatch): string[] {
  return ownNames(race).flatMap((n) => RACE_ALIASES[n] ?? [])
}

/**
 * The country a Grand Prix is often called by instead ("Formula 1 2015
 * Brazil Qualifying + Race") — searched for as well as its own name.
 */
const SEARCH_ALIASES: Record<string, string> = {
  australian: 'australia',
  austrian: 'austria',
  belgian: 'belgium',
  brazilian: 'brazil',
  british: 'britain',
  canadian: 'canada',
  chinese: 'china',
  dutch: 'netherlands',
  'emilia romagna': 'imola',
  european: 'europe',
  french: 'france',
  german: 'germany',
  hungarian: 'hungary',
  indian: 'india',
  italian: 'italy',
  japanese: 'japan',
  korean: 'korea',
  malaysian: 'malaysia',
  mexican: 'mexico',
  'mexico city': 'mexico',
  portuguese: 'portugal',
  russian: 'russia',
  'sao paulo': 'brazil',
  'saudi arabian': 'saudi arabia',
  spanish: 'spain',
  turkish: 'turkey',
  'united states': 'usa',
}

/** What to search the indexers for to find `race`'s releases: its own name, and the country it's often called by. */
export function searchNames(race: RaceToMatch): string[] {
  const own = ownNames(race)
  const alias = SEARCH_ALIASES[own[0]]
  return [...new Set([...own, ...(alias ? [alias] : [])])]
}

/**
 * The race weekend a release name is about, out of a season's calendar —
 * null when it names none of them, or two equally.
 *
 * The Grand Prix's own name counts most, then the names in RACE_ALIASES,
 * then the country and town (only when no other race that season shares
 * them); a round number that agrees adds to it, and alone is enough.
 */
export function matchRace<T extends RaceToMatch>(name: string, races: readonly T[]): T | null {
  const words = normalizeName(name)
  const round = readRound(name)
  const countries = new Map<string, number>()
  const towns = new Map<string, number>()
  for (const race of races) {
    const c = normalizeName(race.country)
    const t = normalizeName(race.locality)
    countries.set(c, (countries.get(c) ?? 0) + 1)
    towns.set(t, (towns.get(t) ?? 0) + 1)
  }

  let best: T | null = null
  let bestScore = 0
  let tied = false
  /** Names the race outright — a language-like name only as "<name> Grand Prix" / "<name> GP". */
  const namesOutright = (n: string) =>
    LANGUAGE_NAMES.has(n) ? hasPhrase(words, `${n} grand prix`) || hasPhrase(words, `${n} gp`) : hasPhrase(words, n)

  for (const race of races) {
    let score = 0
    const own = ownNames(race)
    if (own.some(namesOutright)) score = 3
    else if (aliasesOf(race).some((n) => hasPhrase(words, n))) score = 2
    // "Spanish" alone is likelier the commentary: not enough by itself, but a round number that agrees settles it
    else if (own.some((n) => hasPhrase(words, n))) score = 0.5
    else {
      const c = normalizeName(race.country)
      const t = normalizeName(race.locality)
      if ((countries.get(c) === 1 && hasPhrase(words, c)) || (towns.get(t) === 1 && hasPhrase(words, t))) score = 1
    }
    if (round !== null && round === race.round) score += score > 0 ? 1.5 : 1
    if (score < 1) continue
    if (score > bestScore) {
      best = race
      bestScore = score
      tied = false
    } else if (score > 0 && score === bestScore) {
      tied = true
    }
  }
  return best && !tied ? best : null
}

// ---------------------------------------------------------------------------
// A whole release
// ---------------------------------------------------------------------------

/** Names of things that aren't race broadcasts but share the words: games, the film, the series. */
const NOT_A_BROADCAST =
  /\b(?:ps[2-5]|xbox|wii|switch|pc game|game|codex|plaza|reloaded|razor1911|flt|skidrow|fitgirl|dodi|empress|denuvo|repack by|the movie|manager|soundtrack|ost|mp3|flac|epub|pdf|ebook|magazine|calendar|wallpapers?)\b/

/**
 * Commentary in another language: its session words, the broadcasters that
 * only air it so, a "[Spanish]" tag. Not offered — every release here is
 * someone's TV broadcast, and the commentary is half of it.
 */
const FOREIGN_WORDS =
  /\b(?:treino|entrenamientos|clasificacion|carrera|libres|qualifiche|gara|prove libere|essais|qualifs|rennen|qualifikation|freies training|wyscig|kwalifikacje|estonian|swedish|svensk|norsk|norwegian|dansk|danish|suomi|finnish|polski|magyar|cesky|czech|latino|castellano|espanol|vostfr|truefrench|gp de|pl|viasat|movistar|ziggo|servus|orf|rtl|canal|sport1|tvp|polsat|tv3)\b|\b(?:spanish|german|french|italian|hungarian|polish|russian|portuguese|dutch|turkish|greek|romanian|brazilian|latin) (?:commentary|commentators?|audio|dub|dubbed|version|feed)\b/
const FOREIGN_TAG = /[[(](?:spanish|german|french|italian|hungarian|polish|russian|portuguese|dutch|czech|estonian|swedish|finnish|esp|ita|ger|fra|rus|pl|nl|pt)[\])]/i

/** A broadcast release of `year` holding the sessions it does — or null when it isn't one. */
export interface F1ReleaseRead extends F1SessionRead {
  /** The round its name gives, if any. */
  round: number | null
}

/**
 * What a release name says, for the archive: null unless it's a Formula 1
 * broadcast of `year` holding at least one session (not a show, a season
 * pack, a game or the 2025 film).
 */
export function readF1Release(name: string, year: number, sizeBytes?: number): F1ReleaseRead | null {
  const words = normalizeName(name)
  if (!/\b(?:formula ?1|formula one|f1)\b/.test(words)) return null
  if (!hasPhrase(words, String(year))) return null
  if (NOT_A_BROADCAST.test(words) || SEASON_PACK.test(words)) return null
  if (FOREIGN_WORDS.test(words) || FOREIGN_TAG.test(name)) return null
  const read = readSessions(name, { year, sizeBytes })
  if (read.sessions.length === 0) return null
  return { ...read, round: readRound(name) }
}

/**
 * The file holding `session` among a torrent's video files (paths as
 * Real-Debrid lists them), or null when none of them says so. A file that
 * is a show rather than the session ("Pre-Race Show.mkv") never counts.
 */
export function findSessionFile<T extends { path: string; bytes: number }>(files: readonly T[], session: F1Session): T | null {
  const sessionsOf = (f: T) => {
    const base = (f.path.split('/').pop() ?? f.path).replace(/\.[a-z0-9]{2,4}$/i, '')
    return readSessions(base).sessions
  }
  const pick = (wanted: F1Session) => {
    const matching = files
      .map((f) => ({ f, sessions: sessionsOf(f) }))
      .filter(({ sessions }) => sessions.includes(wanted) && sessions.length < F1_SESSIONS.length)
    if (matching.length === 0) return null
    // A file of that session alone before one that holds more; then the biggest
    matching.sort((a, b) => a.sessions.length - b.sessions.length || b.f.bytes - a.f.bytes)
    return matching[0].f
  }
  // 2021's sprint was named "Sprint Qualifying"
  return pick(session) ?? (session === 'sprint' ? pick('sprint-qualifying') : null)
}
