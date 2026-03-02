import NodeCache from 'node-cache'
import { logger } from '../../lib/logger'

// ── Config ────────────────────────────────────────────────
const OPENAI_API_KEY = process.env.OPENAI_API_KEY
const EMBEDDING_MODEL = 'text-embedding-3-small' // 1536-dim, cheap, fast
const EMBEDDING_DIM = 1536

// ── Cache ─────────────────────────────────────────────────
// 10-min TTL — user taste profile doesn't change mid-session
const embeddingCache = new NodeCache({ stdTTL: 600, checkperiod: 120 })

export type Embedding = number[]

/**
 * Generate an embedding vector for the given text using OpenAI's
 * text-embedding-3-small model.
 *
 * Returns null if OPENAI_API_KEY is not configured (graceful degradation).
 * The caller (vectorSource) will skip the ML path entirely in this case.
 */
export async function generateEmbedding(
  cacheKey: string,
  text: string,
): Promise<Embedding | null> {
  if (!OPENAI_API_KEY) {
    logger.warn('[Embedding] OPENAI_API_KEY not set — skipping vector source')
    return null
  }

  // L1 cache hit
  const cached = embeddingCache.get<Embedding>(cacheKey)
  if (cached) return cached

  try {
    const resp = await fetch('https://api.openai.com/v1/embeddings', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${OPENAI_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: EMBEDDING_MODEL,
        input: text.slice(0, 8192), // Hard limit — model max context
      }),
    })

    if (!resp.ok) {
      const err = await resp.text()
      logger.error('[Embedding] OpenAI API error', { status: resp.status, error: err })
      return null
    }

    const data = await resp.json()
    const embedding: Embedding = data.data?.[0]?.embedding

    if (!embedding || embedding.length !== EMBEDDING_DIM) {
      logger.error('[Embedding] Unexpected embedding shape', { length: embedding?.length })
      return null
    }

    embeddingCache.set(cacheKey, embedding)
    logger.info('[Embedding] Generated real embedding', { cacheKey, dim: embedding.length })
    return embedding
  } catch (err: any) {
    logger.error('[Embedding] Fetch failed', { error: err.message })
    return null
  }
}

/**
 * Build a human-readable interest description string from a user profile
 * for use as the embedding input. This summarises the user's taste without
 * exposing raw IDs to the model.
 */
export function buildInterestSummary(opts: {
  topGenreNames: string[]
  topKeywordNames: string[]
  recentTitles: string[]
  topCastNames: string[]
}): string {
  const parts: string[] = []

  if (opts.recentTitles.length > 0) {
    parts.push(`Recently watched: ${opts.recentTitles.slice(0, 5).join(', ')}`)
  }

  if (opts.topGenreNames.length > 0) {
    parts.push(`Favourite genres: ${opts.topGenreNames.slice(0, 5).join(', ')}`)
  }

  if (opts.topCastNames.length > 0) {
    parts.push(`Favourite actors: ${opts.topCastNames.slice(0, 4).join(', ')}`)
  }

  if (opts.topKeywordNames.length > 0) {
    parts.push(`Themes enjoyed: ${opts.topKeywordNames.slice(0, 6).join(', ')}`)
  }

  return parts.join('. ')
}
