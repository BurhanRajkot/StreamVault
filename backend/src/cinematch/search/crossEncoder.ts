import { logger } from '../../lib/logger'
import { HybridSearchResult } from './hybridSearch'

const MODEL_NAME = 'gemini-flash-latest'

/**
 * Stage 2 Precision Re-Ranking (Cross-Encoder Proxy)
 * 
 * Instead of relying purely on Bi-Encoders or lexical BM25 (which score documents 
 * independently of the deep token relationships in the query), a Cross-Encoder 
 * evaluates the (Query, Document) pair simultaneously. 
 * 
 * Since deploying a live BERT sequence-pair classification model in Node is heavy,
 * we use a fast LLM to proxy this deep contextual matching for the top 10 candidates.
 */
export async function crossEncoderReRank(
  query: string,
  candidates: HybridSearchResult[],
  topK: number = 10
): Promise<HybridSearchResult[]> {
  const GEMINI_API_KEY = process.env.GEMINI_API_KEY
  if (!GEMINI_API_KEY || candidates.length === 0) {
    return candidates
  }

  // Only re-rank the top K to save latency
  const toRerank = candidates.slice(0, topK)
  const remainder = candidates.slice(topK)

  const documentsJson = toRerank.map((c, idx) => ({
    id: c.id,
    index: idx,
    title: c.title || c.name,
    overview: c.overview,
    mediaType: c.media_type,
    release: c.release_date || c.first_air_date
  }))

  const prompt = `
You are a relevance Cross-Encoder. Grade the relevance of these media documents to the search query.
Score each document from 0.0 (completely irrelevant) to 1.0 (perfect match).
Pay deep attention to semantic nuances, character names, or thematic elements in the query vs the overview.

Query: "${query}"

Documents:
${JSON.stringify(documentsJson, null, 2)}

Return a strict JSON object with a single key "scores" containing an array of objects: { "id": number, "score": number }.
`

  try {
    const startTime = Date.now()
    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${MODEL_NAME}:generateContent?key=${GEMINI_API_KEY}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: {
          responseMimeType: 'application/json',
          temperature: 0.0,
        }
      })
    })

    if (!response.ok) {
      return candidates
    }

    const data = await response.json()
    const textContent = data.candidates?.[0]?.content?.parts?.[0]?.text || '{}'
    const parsed = JSON.parse(textContent)

    // Merge cross-encoder scores
    const scoreMap = new Map<number, number>()
    if (parsed.scores && Array.isArray(parsed.scores)) {
      for (const item of parsed.scores) {
        scoreMap.set(item.id, item.score)
      }
    }

    const reRanked = toRerank.map(c => {
      const ceScore = scoreMap.get(c.id) || 0
      // Blend the Cross-Encoder score (weight 0.6) with the previous Hybrid score (weight 0.4)
      const finalScore = (ceScore * 0.6) + (c.hybridScore * 0.4)
      return {
        ...c,
        crossEncoderScore: ceScore,
        hybridScore: finalScore
      }
    })

    // Sort the top K by the newly computed cross-encoder enhanced score
    reRanked.sort((a, b) => b.hybridScore - a.hybridScore)

    logger.info('[CrossEncoder] Re-ranking completed', {
      query,
      topK,
      latencyMs: Date.now() - startTime
    })

    return [...reRanked, ...remainder]

  } catch (err: any) {
    logger.error('[CrossEncoder] Failed to execute', { error: err.message })
    return candidates
  }
}
