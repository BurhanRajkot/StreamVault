/**
 * Prints the CSP `frame-src` source list derived from STREAM_PROVIDER_LIST.
 *
 * The provider allowlist lives in exactly one place (src/lib/config.ts), but
 * the CSP header is owned by the hosts' own config files, which can't import
 * TypeScript. Run this after adding or removing a provider and paste the output
 * into the `frame-src` directive of both vercel.json and netlify.toml:
 *
 *   bun run scripts/gen-csp.ts
 */
import { CONFIG } from '../src/lib/config'

// Hosts that aren't stream providers but still need to be framable.
// *.auth0.com covers the hidden /authorize?prompt=none iframe the SDK falls
// back to when a rotated/revoked refresh token makes getAccessTokenSilently()
// fail (see the useRefreshTokensFallback comment in src/auth/AuthProvider.tsx)
// — including custom domains like stream-vault.jp.auth0.com.
const EXTRA_FRAME_SRC = ['https://vercel.live', 'https://*.vercel.live', 'https://*.auth0.com']

const frameSrc = ["'self'", CONFIG.CSP_FRAME_SRC, ...EXTRA_FRAME_SRC].join(' ')

console.log(`frame-src ${frameSrc};`)
