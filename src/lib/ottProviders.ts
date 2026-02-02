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
    id: '122',
    name: 'Disney Plus Hotstar',
    displayName: 'Hotstar',
    logo: 'https://image.tmdb.org/t/p/original/Ajqyt5aNxNGjmF9uOfxArGrdf3X.jpg',
    color: 'hover:shadow-[#113CCF]/50 border-[#113CCF]',
    region: 'IN',
  },
  {
    id: '237',
    name: 'SonyLIV',
    displayName: 'SonyLIV',
    logo: 'https://image.tmdb.org/t/p/original/A1nMHDENeNBYJLQipNoanFTXs5N.jpg',
    color: 'hover:shadow-[#F6A500]/50 border-[#F6A500]',
    region: 'IN',
  },
  {
    id: '232',
    name: 'Zee5',
    displayName: 'Zee5',
    logo: 'https://image.tmdb.org/t/p/original/8GIJIWwNzxp7uSRCtzfC1qJEDHu.jpg',
    color: 'hover:shadow-[#7D0C64]/50 border-[#7D0C64]',
    region: 'IN',
  },
  {
    id: '350',
    name: 'Apple TV Plus',
    displayName: 'Apple TV+',
    logo: 'https://image.tmdb.org/t/p/original/2E03IAZsX4ZaUqM7tXlctEPMGWS.jpg',
    color: 'hover:shadow-[#FFFFFF]/30 border-white',
    region: 'IN',
  },
  // NOTE: JioCinema may not be available in TMDB's provider database
  // Commenting out until we can verify the correct ID
  // {
  //   id: '220',
  //   name: 'JioCinema',
  //   displayName: 'JioCinema',
  //   logo: 'https://image.tmdb.org/t/p/original/ti8qBJHQ3CqLLGLxCXd5NTCHkLx.jpg',
  //   color: 'hover:shadow-[#D50284]/50 border-[#D50284]',
  //   region: 'IN',
  // },
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
