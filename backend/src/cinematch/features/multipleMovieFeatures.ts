import { MediaType } from '../types'
import { getMovieFeatures, MovieFeatures } from './movieFeatures'
import { mapConcurrent } from '../../utils/concurrency'

export async function getMultipleMovieFeatures(
  items: { tmdbId: number; mediaType: MediaType }[],
  maxConcurrent: number = 5
): Promise<(MovieFeatures | null)[]> {
  return mapConcurrent(items, maxConcurrent, async (item) => {
    return getMovieFeatures(item.tmdbId, item.mediaType)
  })
}
