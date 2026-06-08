import { calculateRelevance } from './searchAlgorithm'
import { Media } from './config'

// Web Worker for asynchronous search scoring
self.onmessage = (e: MessageEvent) => {
  // Validate message payload before use (CodeQL #6 — postMessage input safety)
  if (!e.data || typeof e.data !== 'object') return
  const { query, fuzzyResults, newMedia } = e.data as {
    query: string
    fuzzyResults: { item: Media; score: number }[]
    newMedia: Media[]
  }

  let scoredResults: { item: Media; relevance: number }[] = []

  if (fuzzyResults && fuzzyResults.length > 0) {
    scoredResults = fuzzyResults.map((r) => ({
      item: r.item,
      relevance: calculateRelevance(r.item as Media, query, r.score)
    }))
  } else if (newMedia && newMedia.length > 0) {
    scoredResults = newMedia.map((m) => ({
      item: m,
      relevance: calculateRelevance(m as Media, query, 1)
    }))
  }

  // Sort Descending by Mathematical Relevance Score (Jaro-Winkler, Levenshtein, popularity, bayesian)
  scoredResults.sort((a, b) => b.relevance - a.relevance)

  // Slice the top 8 math-ranked matches on the background thread
  const finalResults = scoredResults.map(sr => sr.item).slice(0, 8)

  // Send the array back to the main React thread
  self.postMessage(finalResults)
}
