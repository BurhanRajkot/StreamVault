import { DEBRID_SERVER_ID, serverOptions, type ServerOption } from '@/lib/config'

/**
 * The app offers two servers, not the website's whole lineup: one embed — Sirius
 * (VidFast), which did best in the 2026-11-24 real-playback test: 11 of 11
 * titles, all 1080p, ~7s to a picture (see STREAM_PROVIDER_LIST in
 * src/lib/config.ts) — and ⚡ Premium. A long list of embeds that mostly lag
 * only made viewers hunt; the website keeps the full list as fallbacks.
 */
export const APP_EMBED_SERVER = 'vidfast_pro'

/** The app's server list: the embed first, ⚡ Premium last. */
export function appServerOptions(kind: 'movie' | 'tv', { unlocked = false }: { unlocked?: boolean } = {}): ServerOption[] {
  return serverOptions(kind, { unlocked }).filter((o) => o.id === APP_EMBED_SERVER || o.id === DEBRID_SERVER_ID)
}

/** What a playback starts on when nothing picked one — the embed (Premium is decided in startServer). */
export function appDefaultServer(): string {
  return APP_EMBED_SERVER
}

/** True for a server the app offers; anything else (an old saved server) falls back to the default. */
export function isAppServer(kind: 'movie' | 'tv', id: string | null | undefined): boolean {
  return !!id && appServerOptions(kind).some((o) => o.id === id)
}
