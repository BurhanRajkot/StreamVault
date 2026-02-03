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
  logo: string
  color: string // Tailwind color for glow effect
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
    logo: 'https://image.tmdb.org/t/p/original/t2yyOv40HZeVlLjYsCsPHnWLk4W.jpg',
    color: 'hover:shadow-[#E50914]/50 border-[#E50914]',
    region: 'IN',
  },
  {
    id: '119',
    name: 'Amazon Prime Video',
    displayName: 'Prime Video',
    logo: 'https://image.tmdb.org/t/p/original/emthp39XA2YScoU8vk5kAFagelS.jpg',
    color: 'hover:shadow-[#00A8E1]/50 border-[#00A8E1]',
    region: 'IN',
  },
  {
    id: '1899|384',
    name: 'HBO Max',
    displayName: 'HBO Max',
    logo: 'https://image.tmdb.org/t/p/original/7c9kCSbdxZ4OaO85JkZq5N3k4f.jpg',
    color: 'hover:shadow-[#5B05F7]/50 border-[#5B05F7]',
    region: 'US',
  },
  {
    id: '350',
    name: 'Apple TV Plus',
    displayName: 'Apple TV+',
    logo: 'https://image.tmdb.org/t/p/original/2E03IAZsX4ZaUqM7tXlctEPMGWS.jpg',
    color: 'hover:shadow-[#FFFFFF]/30 border-white',
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
