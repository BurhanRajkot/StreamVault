// ============================================================
// CineMatch — BM25 Implementation
// Based on: Okapi BM25 (Robertson & Zaragoza, 2009)
//
// Score(D, Q) = Σ IDF(qi) * [ f(qi,D)(k1+1) / (f(qi,D) + k1(1-b+b*|D|/avgdl)) ]
//
// Field weights (title >> overview >> tagline):
//   title:    k1=0.9, b=0.10  (very short doc, one hit very significant)
//   overview: k1=1.5, b=0.75  (longer doc, needs saturation + length norm)
//   tagline:  k1=1.0, b=0.30  (brief, poetic — moderate treatment)
// ============================================================

// English stopwords — common words that shouldn't affect relevance
const STOPWORDS = new Set([
  'a','an','the','and','or','but','in','on','at','to','for',
  'of','with','by','from','up','about','into','through','is',
  'are','was','were','be','been','being','have','has','had',
  'do','does','did','will','would','shall','should','may',
  'might','must','can','could','not','no','it','its','this',
  'that','these','those','i','you','he','she','we','they',
])

// ── Tokenization ─────────────────────────────────────────

export function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter(t => t.length > 1 && !STOPWORDS.has(t))
}

// ── BM25 Field Config ─────────────────────────────────────

export interface FieldConfig {
  weight: number  // Multiplier on the field's score contribution
  k1: number      // Term frequency saturation
  b: number       // Document length normalization
}

export const FIELD_CONFIGS: Record<string, FieldConfig> = {
  title:    { weight: 3.0, k1: 0.9, b: 0.10 },
  name:     { weight: 3.0, k1: 0.9, b: 0.10 }, // TV show equivalent of title
  overview: { weight: 1.0, k1: 1.5, b: 0.75 },
  tagline:  { weight: 1.5, k1: 1.0, b: 0.30 },
}

// ── IDF Calculation ──────────────────────────────────────

/**
 * Robertson & Zaragoza IDF formulation with smoothing to avoid negative IDF
 * IDF(q) = ln((N - df + 0.5) / (df + 0.5) + 1)
 */
function computeIDF(docFreq: number, totalDocs: number): number {
  return Math.log((totalDocs - docFreq + 0.5) / (docFreq + 0.5) + 1)
}

// ── Corpus Statistics ─────────────────────────────────────

export interface CorpusStats {
  /** Inverted index: term → set of doc indices */
  docFreqMap: Map<string, Set<number>>
  /** Average document length per field */
  avgFieldLength: Record<string, number>
  /** Total number of documents */
  totalDocs: number
}

export function buildCorpusStats(
  docs: string[][],          // docs[i] = tokens for document i (already field-merged)
  fieldLabelDocs: Array<Record<string, string[]>>, // field tokens per doc
): CorpusStats {
  const docFreqMap = new Map<string, Set<number>>()
  const fieldLengthSums: Record<string, number> = {}
  const fieldCounts: Record<string, number> = {}

  for (let i = 0; i < docs.length; i++) {
    const seen = new Set<string>()
    for (const token of docs[i]) {
      if (!seen.has(token)) {
        if (!docFreqMap.has(token)) docFreqMap.set(token, new Set())
        docFreqMap.get(token)!.add(i)
        seen.add(token)
      }
    }

    // Accumulate per-field lengths for avgdl calculation
    const fieldDoc = fieldLabelDocs[i]
    for (const [field, tokens] of Object.entries(fieldDoc)) {
      fieldLengthSums[field] = (fieldLengthSums[field] || 0) + tokens.length
      fieldCounts[field] = (fieldCounts[field] || 0) + 1
    }
  }

  const avgFieldLength: Record<string, number> = {}
  for (const [field, sum] of Object.entries(fieldLengthSums)) {
    avgFieldLength[field] = sum / (fieldCounts[field] || 1)
  }

  return { docFreqMap, avgFieldLength, totalDocs: docs.length }
}

// ── Score a single document against a query ───────────────

/**
 * Score a document against a BM25 query across multiple fields.
 *
 * @param queryTokens — tokenized query terms
 * @param docFields   — the document's field tokens { title: [...], overview: [...] }
 * @param stats       — pre-computed corpus statistics
 */
export function scoreBM25(
  queryTokens: string[],
  docFields: Record<string, string[]>,
  stats: CorpusStats,
): number {
  let totalScore = 0

  for (const [field, tokens] of Object.entries(docFields)) {
    const config = FIELD_CONFIGS[field]
    if (!config || tokens.length === 0) continue

    const { weight, k1, b } = config
    const avgdl = stats.avgFieldLength[field] || 1
    const docLen = tokens.length

    // Term frequency map for this field
    const tfMap = new Map<string, number>()
    for (const t of tokens) tfMap.set(t, (tfMap.get(t) || 0) + 1)

    for (const qterm of queryTokens) {
      const tf = tfMap.get(qterm) || 0
      if (tf === 0) continue

      const df = stats.docFreqMap.get(qterm)?.size || 0
      const idf = computeIDF(df, stats.totalDocs)

      // BM25 numerator: tf * (k1 + 1)
      // BM25 denominator: tf + k1 * (1 - b + b * (|D| / avgdl))
      const numerator = tf * (k1 + 1)
      const denominator = tf + k1 * (1 - b + b * (docLen / avgdl))

      totalScore += weight * idf * (numerator / denominator)
    }
  }

  return totalScore
}

// ── Exported convenience scorer ───────────────────────────

export interface BM25Document {
  id: string | number
  fields: Record<string, string>  // field name → raw text
}

export interface BM25ScoredResult<T extends BM25Document> {
  doc: T
  bm25Score: number
}

/**
 * Score and rank a set of documents against a query string.
 * Returns results sorted by BM25 score descending.
 * Documents with zero score are still returned (at the bottom)
 * so the caller can apply a cutoff if desired.
 */
export function rankWithBM25<T extends BM25Document>(
  query: string,
  documents: T[],
  activeFields: string[] = ['title', 'name', 'overview', 'tagline'],
): BM25ScoredResult<T>[] {
  if (documents.length === 0 || !query.trim()) {
    return documents.map(doc => ({ doc, bm25Score: 0 }))
  }

  const queryTokens = tokenize(query)
  if (queryTokens.length === 0) {
    return documents.map(doc => ({ doc, bm25Score: 0 }))
  }

  // Tokenize all documents per field
  const tokenizedFieldDocs: Array<Record<string, string[]>> = documents.map(doc => {
    const fieldTokens: Record<string, string[]> = {}
    for (const field of activeFields) {
      const text = doc.fields[field] || ''
      if (text) fieldTokens[field] = tokenize(text)
    }
    return fieldTokens
  })

  // Merge all field tokens per doc for IDF corpus statistics
  const mergedTokenDocs = tokenizedFieldDocs.map(fd =>
    Object.values(fd).flat()
  )

  // Build corpus stats (IDF + avgdl per field)
  const stats = buildCorpusStats(mergedTokenDocs, tokenizedFieldDocs)

  // Score each document
  const results: BM25ScoredResult<T>[] = documents.map((doc, i) => ({
    doc,
    bm25Score: scoreBM25(queryTokens, tokenizedFieldDocs[i], stats),
  }))

  // Sort descending by BM25 score
  return results.sort((a, b) => b.bm25Score - a.bm25Score)
}
