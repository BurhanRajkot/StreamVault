import { supabaseAdmin } from '../../lib/supabase'
import { Candidate, UserProfile, MediaType } from '../types'
import { fetchTMDB, mapTMDBItem } from '../utils/tmdb'

export async function collaborativeSource(profile: UserProfile): Promise<Candidate[]> {
  // Skip for empty profiles — no useful signal
  if (Object.keys(profile.genreVector).length === 0) return []

  try {
    // Step 1: Fetch all peer genre profiles (max 500 rows — sufficient for current scale)
    const { data: peers, error } = await supabaseAdmin
      .from('UserGenreProfile')
      .select('userId, genreMap')
      .neq('userId', profile.userId)
      .limit(500)

    if (error || !peers || peers.length === 0) return []

    // Step 2: Compute cosine similarity for each peer
    const userGenreKeys = Object.keys(profile.genreVector).map(Number)
    const userMagnitude = Math.sqrt(
      userGenreKeys.reduce((sum, g) => sum + (profile.genreVector[g] ?? 0) ** 2, 0)
    )
    if (userMagnitude === 0) return []

    const peerSimilarities: Array<{ userId: string; similarity: number }> = peers
      .filter(p => p.genreMap && typeof p.genreMap === 'object')
      .map(peer => {
        const peerMap = peer.genreMap as Record<string, number>

        // Dot product
        let dot = 0
        for (const g of userGenreKeys) {
          dot += (profile.genreVector[g] ?? 0) * (peerMap[String(g)] ?? 0)
        }

        // Peer magnitude
        const peerMagnitude = Math.sqrt(
          Object.values(peerMap).reduce((sum, v) => sum + v ** 2, 0)
        )

        const similarity = peerMagnitude > 0 ? dot / (userMagnitude * peerMagnitude) : 0
        return { userId: peer.userId as string, similarity }
      })
      .filter((p: any) => p.similarity > 0.4) // Only significantly similar peers
      .sort((a: any, b: any) => b.similarity - a.similarity)
      .slice(0, 10) // Top-10 peers

    if (peerSimilarities.length === 0) return []

    // Step 3: Fetch top-watched tmdbIds from peer interactions (last 90 days)
    const peerUserIds = peerSimilarities.map((p: any) => p.userId)
    const ninetyDaysAgo = new Date(Date.now() - 90 * 86_400_000).toISOString()

    const { data: peerInteractions, error: intError } = await supabaseAdmin
      .from('UserInteractions')
      .select('tmdbId, mediaType, weight')
      .in('userId', peerUserIds)
      .gte('weight', 0.8)  // Only strongly positive interactions
      .gte('createdAt', ninetyDaysAgo)
      .order('weight', { ascending: false })
      .limit(100)

    if (intError || !peerInteractions || peerInteractions.length === 0) return []

    // Step 4: Aggregate by tmdbId (count how many peers watched it)
    const tmdbScores = new Map<string, { tmdbId: number; mediaType: MediaType; peerCount: number }>()

    for (const interaction of peerInteractions) {
      const key = `${interaction.mediaType}:${interaction.tmdbId}`
      // Skip content the current user already watched or disliked
      if (profile.watchedIds.has(interaction.tmdbId)) continue
      if (profile.dislikedIds.has(interaction.tmdbId)) continue

      const existing = tmdbScores.get(key)
      if (existing) {
        existing.peerCount++
      } else {
        tmdbScores.set(key, {
          tmdbId: interaction.tmdbId,
          mediaType: interaction.mediaType as MediaType,
          peerCount: 1,
        })
      }
    }

    // Step 5: Fetch TMDB metadata for top collaborative candidates
    const topCandidates = Array.from(tmdbScores.values())
      .sort((a, b) => b.peerCount - a.peerCount)
      .slice(0, 20)

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
