/**
 * OTT Provider Configuration for India (IN)
 *
 * IMPORTANT: These provider IDs are from TMDB's Watch Provider API
 * They must match TMDB's exact IDs for the India region.
 *
 * To verify/update IDs, use TMDB API:
 * https://api.themoviedb.org/3/watch/providers/movie?api_key=YOUR_KEY&watch_region=IN
 */

export interface OTTProvider {
  id: string
  name: string
  displayName: string
  /** Square app-icon logo (TMDB's), self-hosted in public/logos. */
  logo: string
  region: string
}

/**
 * TMDB Watch Provider IDs for India
 * Source: https://www.themoviedb.org/talk/5efb5d8c91f7c00037c0d7fd
 *
 * VERIFIED IDs:
 * - Netflix: 8
 * - Amazon Prime Video: 119
 * - Disney+ Hotstar: 122
 * - Apple TV+: 350
 * - Zee5: 232
 * - SonyLIV: 237
 * - JioCinema: 220 (needs verification - may not be in TMDB)
 */
export const OTT_PROVIDERS: OTTProvider[] = [
  {
    id: '8',
    name: 'Netflix',
    displayName: 'Netflix',
    logo: '/logos/netflix.webp',
    region: 'IN',
  },
  {
    id: '119',
    name: 'Amazon Prime Video',
    displayName: 'Prime Video',
    logo: '/logos/prime.webp',
    region: 'IN',
  },
  {
    id: '1899',
    name: 'HBO Max',
    displayName: 'HBO Max',
    logo: '/logos/hbo.webp',
    region: 'US',
  },
  {
    id: '350',
    name: 'Apple TV Plus',
    displayName: 'Apple TV+',
    logo: '/logos/apple.webp',
    region: 'IN',
  },
]

/**
 * Watch region for provider filtering
 */
export const WATCH_REGION = 'IN'

/**
 * Get provider by ID
 */
export function getProviderById(id: string): OTTProvider | undefined {
  return OTT_PROVIDERS.find(p => p.id === id)
}

/**
 * Get all provider IDs as a comma-separated string
 */
export function getAllProviderIds(): string {
  return OTT_PROVIDERS.map(p => p.id).join(',')
}
