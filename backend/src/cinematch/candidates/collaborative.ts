import { supabaseAdmin } from '../../lib/supabase'
import { Candidate, UserProfile, MediaType } from '../types'
import { fetchTMDB, mapTMDBItem } from '../utils/tmdb'
import NodeCache from 'node-cache'

// Global cache for peer profiles to prevent repeated DB scans (5 min TTL)
const peerCache = new NodeCache({ stdTTL: 300, checkperiod: 60 })
const MAX_COLLAB_DETAIL_FETCH = 12

// ============================================================
// CineMatch — Collaborative Source (Phase 3: Multi-Signal Peer Similarity)
//
// Previous: cosine similarity over genre vectors ONLY.
// Now: weighted combination of genre + keyword + cast vectors.
//
//   sim(u, peer) = 0.50 × genre_cos + 0.30 × keyword_cos + 0.20 × cast_cos
//
// This catches peers who share niche interests (same actors, same keywords)
// even when their broad genre taste diverges — e.g. two users who both love
// 1980s Hong Kong action cinema but have divergent genre vectors (action vs drama).
// ============================================================

function cosineSimilarity(
  vecA: Record<string | number, number>,
  vecB: Record<string | number, number>,
): number {
  const keysA = Object.keys(vecA)
  if (keysA.length === 0) return 0

  const magA = Math.sqrt(keysA.reduce((s, k) => s + (vecA[k] ?? 0) ** 2, 0))
  if (magA === 0) return 0

  const keysB = Object.keys(vecB)
  const magB = Math.sqrt(keysB.reduce((s, k) => s + (vecB[k] ?? 0) ** 2, 0))
  if (magB === 0) return 0

  let dot = 0
  for (const k of keysA) {
    dot += (vecA[k] ?? 0) * (vecB[String(k)] ?? 0)
  }
  return dot / (magA * magB)
}

// 3-second timeout guard — collaborative runs heavy Supabase + TMDB calls and must
// never block the pipeline when infrastructure is slow.
const COLLABORATIVE_TIMEOUT_MS = 3000

export async function collaborativeSource(profile: UserProfile): Promise<Candidate[]> {
  // Skip for empty profiles — no useful signal
  if (Object.keys(profile.genreVector).length === 0) return []

  const timeout = new Promise<Candidate[]>(resolve =>
    setTimeout(() => resolve([]), COLLABORATIVE_TIMEOUT_MS)
  )
  return Promise.race([collaborativeSourceImpl(profile), timeout])
}

async function collaborativeSourceImpl(profile: UserProfile): Promise<Candidate[]> {
  try {
    // Step 1: Fetch peer profiles — now includes genreMap, keywordMap, castMap
    // Check global peer cache first
    let peers = peerCache.get<any[]>('global_peers')

    if (!peers) {
      const { data, error } = await supabaseAdmin
        .from('UserGenreProfile')
        .select('userId, genreMap, keywordMap, castMap')
        .limit(500)

      if (error || !data || data.length === 0) return []
      peers = data
      peerCache.set('global_peers', peers)
    }

    // Step 2: Compute multi-signal cosine similarity for each peer
    const peerSimilarities: Array<{ userId: string; similarity: number }> = peers
      .filter(p => p.userId !== profile.userId && p.genreMap && typeof p.genreMap === 'object')
      .map(peer => {
        const genreMap = peer.genreMap as Record<string, number>
        const keywordMap = (peer.keywordMap as Record<string, number> | null) ?? {}
        const castMap = (peer.castMap as Record<string, number> | null) ?? {}

        // Genre similarity (primary signal — always present)
        const genreSim = cosineSimilarity(profile.genreVector, genreMap)

        // Keyword similarity (secondary signal — may be absent for new users)
        const keywordSim = Object.keys(keywordMap).length > 0
          ? cosineSimilarity(profile.keywordVector, keywordMap)
          : 0

        // Cast similarity (tertiary signal — actor affinity)
        const castSim = Object.keys(castMap).length > 0
          ? cosineSimilarity(profile.castVector, castMap)
          : 0

        // Weighted combination: genre dominant, keyword secondary, cast tertiary
        const combinedSim = 0.50 * genreSim + 0.30 * keywordSim + 0.20 * castSim

        return { userId: peer.userId as string, similarity: combinedSim }
      })
      .filter((p: any) => p.similarity > 0.35) // Slightly lower threshold due to richer vector
      .sort((a: any, b: any) => b.similarity - a.similarity)
      .slice(0, 10) // Top-10 peers

    if (peerSimilarities.length === 0) return []

    // Step 3: Fetch top-watched tmdbIds from peer interactions (last 90 days)
    const peerUserIds = peerSimilarities.map((p: any) => p.userId)
    const ninetyDaysAgo = new Date(Date.now() - 90 * 86_400_000).toISOString()

    const { data: peerInteractions, error: intError } = await supabaseAdmin
      .from('UserInteractions')
      .select('userId, tmdbId, mediaType, weight')
      .in('userId', peerUserIds)
      .gte('weight', 0.8)  // Only strongly positive interactions
      .gte('createdAt', ninetyDaysAgo)
      .order('weight', { ascending: false })
      .limit(100)

    if (intError || !peerInteractions || peerInteractions.length === 0) return []

    // Step 4: Aggregate by tmdbId — weight by peer similarity, not just count
    const peerSimMap = new Map(peerSimilarities.map(p => [p.userId, p.similarity]))
    const tmdbScores = new Map<string, { tmdbId: number; mediaType: MediaType; weightedScore: number }>()

    for (const interaction of peerInteractions) {
      const key = `${interaction.mediaType}:${interaction.tmdbId}`

      // Skip content the current user already watched or disliked
      if (profile.watchedIds.has(interaction.tmdbId)) continue
      if (profile.dislikedIds.has(interaction.tmdbId)) continue

      const peerWeight = peerSimMap.get(interaction.userId) ?? 0.5

      const existing = tmdbScores.get(key)
      if (existing) {
        existing.weightedScore += interaction.weight * peerWeight
      } else {
        tmdbScores.set(key, {
          tmdbId: interaction.tmdbId,
          mediaType: interaction.mediaType as MediaType,
          weightedScore: interaction.weight * peerWeight,
        })
      }
    }

    // Step 5: Fetch TMDB metadata for top similarity-weighted candidates
    const topCandidates = Array.from(tmdbScores.values())
      .sort((a, b) => b.weightedScore - a.weightedScore)
      .slice(0, MAX_COLLAB_DETAIL_FETCH)

    const candidateResults = await Promise.allSettled(
      topCandidates.map(async (c) => {
        try {
          const data = await fetchTMDB(`/${c.mediaType}/${c.tmdbId}`)
          const candidate = mapTMDBItem(
            { ...data, genre_ids: (data.genres || []).map((g: any) => g.id) },
            c.mediaType,
            'collaborative'
          )
          return candidate
        } catch {
          return null
        }
      })
    )

    return candidateResults
      .filter((r: any) => r.status === 'fulfilled' && r.value !== null)
      .map((r: any) => (r as PromiseFulfilledResult<Candidate>).value)
  } catch (err) {
    console.error('[CineMatch] Collaborative source error:', err)
    return []
  }
}
