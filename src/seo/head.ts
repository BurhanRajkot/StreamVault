import { SEO } from './constants'

/**
 * A tiny document-head manager — what react-helmet-async did for us, minus
 * its React 19 failure.
 *
 * Why not Helmet: react-helmet-async 2.0.5 registers each <Helmet> during
 * *render* and unregisters with `splice(indexOf(instance), 1)`. Under React 19
 * a render can be thrown away (StrictMode in dev, a Suspense boundary, a
 * concurrent re-render) and a component can unmount without ever having been
 * registered — `indexOf` is then -1 and the splice removes the LAST live
 * instance instead. Pages ended up with no registered head at all, so every
 * page kept index.html's generic title, description and canonical.
 *
 * Model: every mounted user contributes a HeadSpec, in mount order. The specs
 * are merged — later mounts win per key (the title page opened over the home
 * page wins; closing it restores the home page's) — and written to <head>.
 * Tags index.html already has are updated in place and restored when nothing
 * sets them any more, so crawlers that don't run JS and the app agree.
 */

export interface HeadMeta {
  /** `name="description"` style */
  name?: string
  /** `property="og:title"` style */
  property?: string
  content: string
}

export interface HeadSpec {
  title?: string
  meta?: HeadMeta[]
  /** One link per rel — canonical is the only one pages set. */
  links?: Array<{ rel: string; href: string }>
  /** JSON-LD blocks, keyed so two pages can't clobber each other's. */
  jsonLd?: Array<{ id: string; data: unknown }>
}

export interface MergedHead {
  title?: string
  meta: Map<string, HeadMeta>
  links: Map<string, string>
  jsonLd: Map<string, unknown>
}

export function metaKey(m: HeadMeta): string {
  return m.property ? `property:${m.property}` : `name:${m.name ?? ''}`
}

/** Later specs win, key by key. */
export function mergeHead(specs: HeadSpec[]): MergedHead {
  const out: MergedHead = { meta: new Map(), links: new Map(), jsonLd: new Map() }
  for (const spec of specs) {
    if (spec.title !== undefined) out.title = spec.title
    for (const m of spec.meta ?? []) out.meta.set(metaKey(m), m)
    for (const l of spec.links ?? []) out.links.set(l.rel, l.href)
    // By id: a page on top replaces a block of the same id (every page's
    // WebPage block is "page") and adds its own beside the rest
    for (const b of spec.jsonLd ?? []) out.jsonLd.set(b.id, b.data)
  }
  return out
}

// ── DOM side ─────────────────────────────────────────────────────────────────

const entries = new Map<number, HeadSpec>()
let nextId = 1
let staticTitle: string | null = null
const MANAGED = 'data-sv-head'
/** index.html's own tags we've overwritten, with their original value — kept here, not read back from the DOM. */
const originalMeta = new Map<HTMLMetaElement, string>()
/**
 * What index.html's own links say, for when no page sets them. Constants on
 * purpose: an href is never read back out of the DOM and written again.
 */
const STATIC_LINKS: Record<string, string> = { canonical: `${SEO.SITE_URL}/` }

export function registerHead(): number {
  return nextId++
}

export function setHead(id: number, spec: HeadSpec): void {
  entries.set(id, spec)
  apply()
}

export function removeHead(id: number): void {
  if (entries.delete(id)) apply()
}

function metaSelector(key: string): string {
  const [attr, value] = key.split(/:(.*)/s)
  return `meta[${attr}="${CSS.escape(value)}"]`
}

function apply(): void {
  if (typeof document === 'undefined') return
  const head = document.head
  // Mount order = id order, so sort by id
  const merged = mergeHead([...entries.entries()].sort((a, b) => a[0] - b[0]).map(([, s]) => s))

  if (staticTitle === null) staticTitle = document.title
  document.title = merged.title ?? staticTitle

  // Meta: update or create the ones set; restore or drop the ones no longer set
  const seen = new Set<string>()
  for (const [key, m] of merged.meta) {
    seen.add(key)
    let el = head.querySelector<HTMLMetaElement>(metaSelector(key))
    if (!el) {
      el = document.createElement('meta')
      if (m.property) el.setAttribute('property', m.property)
      else if (m.name) el.setAttribute('name', m.name)
      el.setAttribute(MANAGED, '')
      head.appendChild(el)
    } else if (!el.hasAttribute(MANAGED) && !originalMeta.has(el)) {
      originalMeta.set(el, el.content)
    }
    el.setAttribute('content', m.content)
  }
  const metaKeyOf = (el: HTMLMetaElement) =>
    el.hasAttribute('property') ? `property:${el.getAttribute('property')}` : `name:${el.getAttribute('name') ?? ''}`
  head.querySelectorAll<HTMLMetaElement>(`meta[${MANAGED}]`).forEach((el) => {
    if (!seen.has(metaKeyOf(el))) el.remove()
  })
  originalMeta.forEach((content, el) => {
    if (seen.has(metaKeyOf(el))) return
    el.setAttribute('content', content)
    originalMeta.delete(el)
  })

  // Links (canonical)
  const seenRel = new Set<string>()
  for (const [rel, href] of merged.links) {
    seenRel.add(rel)
    let el = head.querySelector<HTMLLinkElement>(`link[rel="${CSS.escape(rel)}"]`)
    if (!el) {
      el = document.createElement('link')
      el.rel = rel
      el.setAttribute(MANAGED, '')
      head.appendChild(el)
    }
    el.setAttribute('href', href)
  }
  head.querySelectorAll<HTMLLinkElement>('link[rel]').forEach((el) => {
    if (seenRel.has(el.rel)) return
    if (el.hasAttribute(MANAGED)) el.remove()
    else if (el.rel in STATIC_LINKS) el.setAttribute('href', STATIC_LINKS[el.rel])
  })

  // JSON-LD: managed blocks only; index.html's site-level block stays put
  const existing = new Map<string, HTMLScriptElement>()
  head.querySelectorAll<HTMLScriptElement>(`script[${MANAGED}]`).forEach((el) => existing.set(el.getAttribute(MANAGED) ?? '', el))
  for (const [id, data] of merged.jsonLd) {
    let el = existing.get(id)
    if (!el) {
      el = document.createElement('script')
      el.type = 'application/ld+json'
      el.setAttribute(MANAGED, id)
      head.appendChild(el)
    }
    const json = JSON.stringify(data)
    if (el.textContent !== json) el.textContent = json
    existing.delete(id)
  }
  existing.forEach((el) => el.remove())
}
