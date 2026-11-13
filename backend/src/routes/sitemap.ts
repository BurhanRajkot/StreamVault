import { Router, Request, Response } from 'express'
import { logger } from '../lib/logger'
import { withTmdbRateLimit } from '../services/tmdbLimiter'
import { TMDB_BASE_URL } from '../lib/tmdbBase'
import { tmdbFetch } from '../lib/tmdbFetch'

/**
 * Title sitemap — every popular / top-rated / trending film, show and anime
 * as a /watch/<type>/<id>-<slug> URL, so search engines can find the title
 * pages. The site is a SPA: without this, the only way to reach a title page
 * is clicking through the app.
 *
 * Served at /sitemap-titles.xml; the frontend host (vercel.json, netlify.toml)
 * proxies its own /sitemap-titles.xml here so the URLs sit on the site's
 * domain, which is what a sitemap has to list.
 */

const router = Router()

const TMDB_API_KEY = process.env.TMDB_API_KEY || process.env.VITE_TMDB_API_KEY

/** The public site the URLs point at (not this API's host). */
export const SITE_URL = (process.env.SITE_URL || 'https://stream-vault-7u6q.vercel.app').replace(/\/+$/, '')

/** Rebuilt at most this often — the lists only move day to day. */
const TTL_MS = 12 * 60 * 60 * 1000
const TMDB_TIMEOUT_MS = 8000

type MediaType = 'movie' | 'tv'

interface TmdbListItem {
  id: number
  title?: string
  name?: string
  adult?: boolean
}

/** [TMDB endpoint, media type, pages] — ~2,500 distinct titles in all. */
const SOURCES: Array<[string, MediaType, number]> = [
  ['/trending/movie/week', 'movie', 5],
  ['/trending/tv/week', 'tv', 5],
  ['/movie/popular', 'movie', 25],
  ['/tv/popular', 'tv', 25],
  ['/movie/top_rated', 'movie', 20],
  ['/tv/top_rated', 'tv', 20],
  ['/discover/tv?with_genres=16&with_original_language=ja&sort_by=popularity.desc', 'tv', 10],
  ['/discover/movie?with_genres=16&with_original_language=ja&sort_by=popularity.desc', 'movie', 5],
  ['/discover/movie?with_genres=99&sort_by=popularity.desc', 'movie', 5],
]

/** Same rules as the frontend's slugify (src/lib/utils.ts) — the URLs must match the app's own. */
export function slugify(text: string): string {
  if (!text) return ''
  return text
    .toString()
    .toLowerCase()
    .replace(/\s+/g, '-')
    .replace(/[^\w-]+/g, '')
    .replace(/--+/g, '-')
    .replace(/^-+/, '')
    .replace(/-+$/, '')
}

function escapeXml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')
}

export function watchUrl(type: MediaType, id: number, title: string): string {
  const slug = slugify(title)
  return `${SITE_URL}/watch/${type}/${id}${slug ? `-${slug}` : ''}`
}

export function buildSitemapXml(urls: string[], lastmod: string): string {
  const entries = urls
    .map((loc) => `  <url>\n    <loc>${escapeXml(loc)}</loc>\n    <lastmod>${lastmod}</lastmod>\n    <changefreq>weekly</changefreq>\n    <priority>0.7</priority>\n  </url>`)
    .join('\n')
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${entries}\n</urlset>\n`
}

const fetchPage = withTmdbRateLimit(async (endpoint: string, page: number): Promise<TmdbListItem[]> => {
  const sep = endpoint.includes('?') ? '&' : '?'
  const url = `${TMDB_BASE_URL}${endpoint}${sep}page=${page}&language=en-US&api_key=${TMDB_API_KEY}`
  const res = await tmdbFetch(url, { signal: AbortSignal.timeout(TMDB_TIMEOUT_MS) })
  if (!res.ok) throw new Error(`TMDB ${res.status} for ${endpoint} p${page}`)
  const body = (await res.json()) as { results?: TmdbListItem[] }
  return body.results ?? []
})

async function collectUrls(): Promise<string[]> {
  const seen = new Set<string>()
  const urls: string[] = []

  const jobs = SOURCES.flatMap(([endpoint, type, pages]) =>
    Array.from({ length: pages }, (_, i) =>
      fetchPage(endpoint, i + 1)
        .then((items) => ({ type, items }))
        // One failed page shouldn't cost the whole sitemap
        .catch((err: unknown) => {
          logger.warn('[sitemap] page failed', { endpoint, page: i + 1, error: err instanceof Error ? err.message : String(err) })
          return { type, items: [] as TmdbListItem[] }
        })
    )
  )

  for (const { type, items } of await Promise.all(jobs)) {
    for (const item of items) {
      const title = item.title || item.name
      if (!item.id || !title || item.adult) continue
      const key = `${type}:${item.id}`
      if (seen.has(key)) continue
      seen.add(key)
      urls.push(watchUrl(type, item.id, title))
    }
  }
  return urls
}

let cached: { xml: string; at: number } | null = null
let inFlight: Promise<string> | null = null

async function getSitemap(): Promise<string> {
  if (cached && Date.now() - cached.at < TTL_MS) return cached.xml
  if (!inFlight) {
    inFlight = collectUrls()
      .then((urls) => {
        if (urls.length === 0) throw new Error('no titles collected')
        const xml = buildSitemapXml(urls, new Date().toISOString().slice(0, 10))
        cached = { xml, at: Date.now() }
        logger.info('[sitemap] built', { urls: urls.length })
        return xml
      })
      .finally(() => {
        inFlight = null
      })
  }
  try {
    return await inFlight
  } catch (err) {
    // A stale sitemap beats none
    if (cached) return cached.xml
    throw err
  }
}

router.get('/sitemap-titles.xml', async (_req: Request, res: Response) => {
  try {
    const xml = await getSitemap()
    res
      .status(200)
      .type('application/xml')
      .set('Cache-Control', 'public, max-age=3600, s-maxage=43200, stale-while-revalidate=86400')
      .send(xml)
  } catch (err: unknown) {
    logger.error('[sitemap] build failed', { error: err instanceof Error ? err.message : String(err) })
    res.status(503).set('Retry-After', '600').type('text/plain').send('Sitemap temporarily unavailable')
  }
})

export default router
