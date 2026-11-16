// ============================================================
// CineMatch — Search entities
//
// Some searches name a thing that isn't a title: a person ("Christopher
// Nolan"), a studio ("Pixar"), a franchise ("Star Wars") or a topic ("true
// crime"). TMDB's multi-search only matches titles literally, so those used to
// come back as whatever happened to have the words in its name — "Christopher
// Nolan" found three making-of documentaries and none of his films.
//
// resolveSearchEntity recognises such a query and returns that entity's own
// titles, which the search route puts ahead of the ordinary title matches.
// ============================================================
import { fetchTMDB as rawFetchTMDB } from '../utils/tmdb'
import { normalizeTitle } from './hybridSearch'

export type SearchEntityKind = 'person' | 'company' | 'collection' | 'keyword'

export interface SearchEntity {
  kind: SearchEntityKind
  id: number
  name: string
  /** A TMDB image path: the person's photo or the studio's logo. */
  imagePath: string | null
  /** e.g. "Director", "Actor", "Studio", "Franchise", "Topic" */
  role: string
}

export interface EntityTitle {
  id: number
  media_type: 'movie' | 'tv'
  title?: string
  name?: string
  overview?: string
  poster_path?: string | null
  backdrop_path?: string | null
  vote_average?: number
  vote_count?: number
  popularity?: number
  release_date?: string
  first_air_date?: string
  genre_ids?: number[]
  original_language?: string
}

export interface ResolvedEntity {
  entity: SearchEntity
  results: EntityTitle[]
}

interface PersonHit {
  id: number
  media_type: 'person'
  name?: string
  popularity?: number
  profile_path?: string | null
  known_for_department?: string
}

interface Credit extends EntityTitle {
  character?: string
  job?: string
  episode_count?: number
}

const TIMEOUT = { timeoutMs: 5000 }

/** fetchTMDB refuses paths with characters outside its allowlist by throwing; a search must not fail over that. */
async function fetchTMDB(path: string, options: { timeoutMs?: number }): Promise<unknown> {
  try {
    return await rawFetchTMDB(path, options)
  } catch {
    return { results: [] }
  }
}
const MAX_RESULTS = 40

/** Talk shows, news and reality TV: appearances, not work. */
const APPEARANCE_GENRES = new Set([10767, 10763, 10764])
const SELF_CHARACTER = /\b(self|himself|herself|themselves|narrator \(voice\)|host)\b/i

const enc = (s: string) => encodeURIComponent(s).replace(/[!'()*]/g, (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`)

function words(s: string): string[] {
  return normalizeTitle(s).split(' ').filter(Boolean)
}

/**
 * Whether a person's name answers the query. Two or more words must all be in
 * the name (the last may still be being typed: "christopher nol"). A single
 * word must be the whole name ("Zendaya") — "tom" is a search for titles, not
 * for Tom Hanks.
 */
export function nameAnswersQuery(name: string, query: string): boolean {
  const q = words(query)
  const n = words(name)
  if (q.length === 0 || n.length === 0) return false
  if (q.length === 1) return n.length === 1 && n[0] === q[0]
  const last = q[q.length - 1]
  if (last.length < 2) return false
  return q.slice(0, -1).every((w) => n.includes(w)) && n.some((w) => w.startsWith(last)) && q.length <= n.length + 1
}

/** A well-matched, findable person among multi-search hits — the most popular one if several share the name. */
export function pickPerson(hits: ReadonlyArray<{ media_type?: unknown; [key: string]: unknown }>, query: string): PersonHit | null {
  const people = hits.filter((h) => h.media_type === 'person') as unknown as PersonHit[]
  const matching = people
    .filter((p) => p.name && nameAnswersQuery(p.name, query) && (p.popularity ?? 0) >= 0.5)
    .sort((a, b) => (b.popularity ?? 0) - (a.popularity ?? 0))
  if (matching[0]) return matching[0]
  // One word that is a famous surname ("nolan", "tarantino"): the person TMDB
  // ranks first, if they're well known
  const q = words(query)
  const first = people[0]
  if (q.length === 1 && q[0].length >= 4 && first?.name && (first.popularity ?? 0) >= 3) {
    const n = words(first.name)
    if (n.length > 1 && n[n.length - 1] === q[0]) return first
  }
  return null
}

const ROLE_FOR_DEPARTMENT: Record<string, string> = {
  Directing: 'Director',
  Writing: 'Writer',
  Acting: 'Actor',
  Production: 'Producer',
  Sound: 'Composer',
  Camera: 'Cinematographer',
  Editing: 'Editor',
  Creator: 'Creator',
}

const CREW_JOBS: Record<string, Set<string>> = {
  Directing: new Set(['Director', 'Creator', 'Series Director']),
  Writing: new Set(['Screenplay', 'Writer', 'Story', 'Novel', 'Creator', 'Author', 'Teleplay']),
  Production: new Set(['Producer', 'Executive Producer', 'Creator']),
  Sound: new Set(['Original Music Composer', 'Music', 'Composer']),
  Camera: new Set(['Director of Photography']),
  Editing: new Set(['Editor']),
}

/** Popular now and well-loved over time both count; one mention in a credit list doesn't. */
function workRank(c: EntityTitle): number {
  return Math.log1p(c.vote_count ?? 0) + 1.5 * Math.log1p(c.popularity ?? 0)
}

/**
 * A person's own work, best known first: the films they directed (or wrote,
 * produced, scored) for crew, the roles they played for actors. Cameos as
 * themselves, talk-show spots, one-episode guest parts and unrated filler are
 * left out.
 */
export function filmography(
  credits: { cast?: Credit[]; crew?: Credit[] },
  department: string | undefined,
): EntityTitle[] {
  const jobs = department ? CREW_JOBS[department] : undefined
  let picked: Credit[]
  if (jobs) {
    picked = (credits.crew ?? []).filter((c) => c.job && jobs.has(c.job))
    // A director who also acts still reads as a director; one with almost no
    // directing credits (an actor's single short film) falls back to the roles
    if (picked.length < 3) picked = [...picked, ...(credits.cast ?? [])]
  } else {
    picked = credits.cast ?? []
  }

  const seen = new Set<string>()
  const out: EntityTitle[] = []
  for (const c of picked) {
    if (c.media_type !== 'movie' && c.media_type !== 'tv') continue
    const key = `${c.media_type}:${c.id}`
    if (seen.has(key)) continue
    if (!c.poster_path) continue
    if ((c.genre_ids ?? []).some((g) => APPEARANCE_GENRES.has(g))) continue
    if (c.character && SELF_CHARACTER.test(c.character)) continue
    if (c.media_type === 'tv' && c.episode_count !== undefined && c.episode_count <= 1 && !c.job) continue
    // Unreleased or unrated: keep only what people are already looking for
    if ((c.vote_count ?? 0) < 15 && (c.popularity ?? 0) < 8) continue
    seen.add(key)
    out.push(stripCredit(c))
  }
  return out.sort((a, b) => workRank(b) - workRank(a)).slice(0, MAX_RESULTS)
}

function stripCredit(c: Credit): EntityTitle {
  return {
    id: c.id,
    media_type: c.media_type,
    title: c.title,
    name: c.name,
    overview: c.overview,
    poster_path: c.poster_path,
    backdrop_path: c.backdrop_path,
    vote_average: c.vote_average,
    vote_count: c.vote_count,
    popularity: c.popularity,
    release_date: c.release_date,
    first_air_date: c.first_air_date,
    genre_ids: c.genre_ids,
    original_language: c.original_language,
  }
}

interface Named {
  id: number
  name?: string
  logo_path?: string | null
}

/** Studios named exactly what was typed — "Marvel" finds Marvel Studios. A24 has two entries, so it can be several. */
export function matchCompanies(companies: Named[], query: string): Named[] {
  const q = normalizeTitle(query)
  if (!q) return []
  const exact = companies.filter((c) => c.name && normalizeTitle(c.name) === q)
  if (exact.length > 0) return exact.slice(0, 3)
  const studio = companies.find((c) => c.name && normalizeTitle(c.name) === `${q} studios`)
  return studio ? [studio] : []
}

/** "Star Wars" → "Star Wars Collection". */
export function matchCollection(collections: Named[], query: string): Named | null {
  const q = normalizeTitle(query)
  if (!q) return null
  return collections.find((c) => c.name && (normalizeTitle(c.name) === `${q} collection` || normalizeTitle(c.name) === q)) ?? null
}

/** A TMDB keyword spelled exactly as typed — only for phrases ("true crime", "time travel"), never single words. */
export function matchKeyword(keywords: Named[], query: string): Named | null {
  const q = normalizeTitle(query)
  if (q.split(' ').length < 2) return null
  return keywords.find((k) => k.name && normalizeTitle(k.name) === q) ?? null
}

function results<T>(data: unknown): T[] {
  return data && typeof data === 'object' && Array.isArray((data as { results?: unknown }).results)
    ? ((data as { results: T[] }).results)
    : []
}

async function discover(mediaType: 'movie' | 'tv', filter: string, minVotes: number): Promise<EntityTitle[]> {
  const data = await fetchTMDB(`/discover/${mediaType}?sort_by=popularity.desc&vote_count.gte=${minVotes}&${filter}&page=1`, TIMEOUT)
  return results<EntityTitle>(data).map((r) => ({ ...r, media_type: mediaType }))
}

/** Movies and shows merged, most popular first. */
async function discoverBoth(filter: string): Promise<EntityTitle[]> {
  const [movies, tv] = await Promise.all([discover('movie', filter, 80), discover('tv', filter, 30)])
  return [...movies, ...tv]
    .filter((r) => r.poster_path)
    .sort((a, b) => workRank(b) - workRank(a))
    .slice(0, MAX_RESULTS)
}

/**
 * The person, studio, franchise or topic this query names, with its titles —
 * or null when it's an ordinary title search. People come from the same
 * multi-search the title search runs (it's cached), the rest from TMDB's
 * company, collection and keyword search.
 */
export async function resolveSearchEntity(query: string): Promise<ResolvedEntity | null> {
  const q = query.trim()
  if (normalizeTitle(q).length < 3 || q.split(/\s+/).length > 5) return null

  const [multi, companies, collections, keywords] = await Promise.all([
    // Same URL as hybridSearch's page 1, so the two share one cached call
    fetchTMDB(`/search/multi?query=${encodeURIComponent(q)}&page=1`, TIMEOUT),
    fetchTMDB(`/search/company?query=${enc(q)}&page=1`, TIMEOUT),
    fetchTMDB(`/search/collection?query=${enc(q)}&page=1`, TIMEOUT),
    fetchTMDB(`/search/keyword?query=${enc(q)}&page=1`, TIMEOUT),
  ])

  const person = pickPerson(results(multi), q)
  if (person) {
    const credits = (await fetchTMDB(`/person/${person.id}/combined_credits`, TIMEOUT)) as { cast?: Credit[]; crew?: Credit[] }
    const works = filmography(credits, person.known_for_department)
    if (works.length >= 3) {
      return {
        entity: {
          kind: 'person',
          id: person.id,
          name: person.name ?? q,
          imagePath: person.profile_path ?? null,
          role: ROLE_FOR_DEPARTMENT[person.known_for_department ?? ''] ?? 'Person',
        },
        results: works,
      }
    }
  }

  const studios = matchCompanies(results<Named>(companies), q)
  if (studios.length > 0) {
    const works = await discoverBoth(`with_companies=${studios.map((s) => s.id).join('%7C')}`)
    if (works.length >= 3) {
      const lead = studios.find((s) => s.logo_path) ?? studios[0]
      return {
        entity: { kind: 'company', id: lead.id, name: lead.name ?? q, imagePath: lead.logo_path ?? null, role: 'Studio' },
        results: works,
      }
    }
  }

  const collection = matchCollection(results<Named>(collections), q)
  if (collection) {
    const data = (await fetchTMDB(`/collection/${collection.id}`, TIMEOUT)) as { name?: string; poster_path?: string | null; parts?: EntityTitle[] }
    const parts = (data.parts ?? [])
      .filter((p) => p.poster_path)
      .map((p) => ({ ...p, media_type: 'movie' as const }))
      .sort((a, b) => (a.release_date || '9999').localeCompare(b.release_date || '9999'))
    if (parts.length >= 2) {
      return {
        entity: {
          kind: 'collection',
          id: collection.id,
          name: (data.name ?? collection.name ?? q).replace(/\s+Collection$/i, ''),
          imagePath: data.poster_path ?? null,
          role: 'Franchise',
        },
        results: parts,
      }
    }
  }

  const keyword = matchKeyword(results<Named>(keywords), q)
  if (keyword) {
    const works = await discoverBoth(`with_keywords=${keyword.id}`)
    if (works.length >= 3) {
      const label = (keyword.name ?? q).replace(/\b\w/g, (c) => c.toUpperCase())
      return { entity: { kind: 'keyword', id: keyword.id, name: label, imagePath: null, role: 'Topic' }, results: works }
    }
  }

  return null
}
