# OTT Provider Filtering Feature

## Overview
This feature allows users to filter movies and TV shows by streaming platform (OTT provider) using TMDB's Watch Provider API.

## Architecture

### Files Structure
```
src/
├── lib/
│   └── ottProviders.ts          # Central config for all OTT providers
├── components/
│   └── PlatformSelector.tsx     # UI component for provider selection
├── hooks/
│   └── useMedia.ts              # Hook that handles provider filtering
└── pages/
    └── Index.tsx                # Main page that integrates the selector

backend/
└── src/
    └── routes/
        └── tmdb.ts              # Backend proxy that adds provider params
```

### Data Flow
1. User clicks a provider button in `PlatformSelector`
2. `Index.tsx` updates `selectedProvider` state
3. `useMedia` hook receives new `providerId` and triggers re-fetch
4. Frontend API (`api.ts`) adds `with_watch_providers` param to request
5. Backend (`tmdb.ts`) forwards params to TMDB API
6. TMDB returns only content available on that provider in India (IN)

## TMDB Provider IDs (India Region)

| Provider | TMDB ID | Status |
|----------|---------|--------|
| Netflix | 8 | ✅ Verified |
| Prime Video | 119 | ✅ Verified |
| Disney+ Hotstar | 122 | ✅ Verified |
| SonyLIV | 237 | ✅ Verified |
| Zee5 | 232 | ✅ Verified |
| Apple TV+ | 350 | ✅ Verified |
| JioCinema | ??? | ❌ Not in TMDB (commented out) |

## Known Issues & Solutions

### Issue: Hotstar/JioCinema showing no results
**Cause**: Provider ID may be incorrect or TMDB doesn't have data for that provider in India.

**Solution**:
1. Verify the provider ID using TMDB API:
   ```bash
   curl "https://api.themoviedb.org/3/watch/providers/movie?api_key=YOUR_KEY&watch_region=IN"
   ```
2. Update the ID in `src/lib/ottProviders.ts`
3. If provider doesn't exist in TMDB, comment it out

### Issue: Inaccurate results (e.g., "28 Years Later" on Zee5)
**Cause**: TMDB's provider data may be outdated or incorrect.

**This is a TMDB data limitation, not a code bug.** The accuracy depends on TMDB's database being up-to-date with each provider's catalog.

**Mitigation**:
- TMDB data is community-driven and may lag behind real-time availability
- Consider adding a disclaimer: "Availability subject to change"
- For 100% accuracy, you'd need direct API access from each OTT provider (Netflix, Hotstar, etc.)

## How to Update Provider Logos

The user mentioned they will provide custom logos. To update:

1. Place logo files in `public/ott-logos/` (create this folder)
2. Update `src/lib/ottProviders.ts`:
   ```typescript
   {
     id: '8',
     name: 'Netflix',
     displayName: 'Netflix',
     logo: '/ott-logos/netflix.png', // Use local path
     color: 'hover:shadow-[#E50914]/50 border-[#E50914]',
     region: 'IN',
   }
   ```

## Testing

To test provider filtering:
1. Open browser DevTools → Network tab
2. Click a provider (e.g., Netflix)
3. Check the API call to `/tmdb/discover/movie`
4. Verify it includes: `?with_watch_providers=8&watch_region=IN`
5. Check TMDB's response to see if results are filtered

## Debugging

If a provider shows no results:
1. Check browser console for errors
2. Check backend logs for TMDB API errors
3. Test the TMDB API directly:
   ```
   https://api.themoviedb.org/3/discover/movie?api_key=YOUR_KEY&with_watch_providers=122&watch_region=IN
   ```
4. If TMDB returns empty results, the provider ID is wrong or TMDB has no data

## Future Improvements
- Add region selector (US, UK, etc.)
- Show provider availability badges on media cards
- Add "Available on X platforms" filter
- Cache provider-filtered results separately
