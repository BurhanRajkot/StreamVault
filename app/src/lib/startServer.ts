import { DEBRID_SERVER_ID, LEGACY_TORBOX_SERVER_ID, defaultServer, serverOptions } from '@/lib/config'
import type { AppSettings } from './settings'

/**
 * The server a playback starts on when nobody picked one for it.
 *
 * An account the admin gave Premium starts every playback on ⚡ Premium — a
 * title, Continue Watching, the hero's Play — whatever server it last
 * watched on; switching in the player or on the title still works for that
 * playback. Only picking another default in My Space (while it has Premium)
 * turns that off. Everyone else gets their saved / default server, else Sol.
 */
export function startServer(
  kind: 'movie' | 'tv',
  premium: boolean,
  settings: Pick<AppSettings, 'defaultServer' | 'premiumDefault'>,
  saved?: string | null
): string {
  if (premium && settings.premiumDefault) return DEBRID_SERVER_ID
  const preferred = saved || settings.defaultServer
  if (preferred === DEBRID_SERVER_ID || preferred === LEGACY_TORBOX_SERVER_ID) return premium ? DEBRID_SERVER_ID : defaultServer(kind)
  return preferred && serverOptions(kind).some((o) => o.id === preferred) ? preferred : defaultServer(kind)
}
