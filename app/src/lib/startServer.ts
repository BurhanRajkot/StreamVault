import { DEBRID_SERVER_ID, LEGACY_TORBOX_SERVER_ID } from '@/lib/config'
import { appDefaultServer, isAppServer } from './servers'
import type { AppSettings } from './settings'

/**
 * The server a playback starts on when nobody picked one for it.
 *
 * An account the admin gave Premium starts every playback on ⚡ Premium — a
 * title, Continue Watching, the hero's Play — whatever server it last
 * watched on; switching in the player or on the title still works for that
 * playback. Only picking the other server in My Space (while it has Premium)
 * turns that off. Everyone else gets their saved server when the app still
 * offers it, else the app's one embed server (see servers.ts) — a row saved
 * on a server the app dropped starts there too.
 */
export function startServer(
  kind: 'movie' | 'tv',
  premium: boolean,
  settings: Pick<AppSettings, 'defaultServer' | 'premiumDefault'>,
  saved?: string | null
): string {
  if (premium && settings.premiumDefault) return DEBRID_SERVER_ID
  const preferred = saved || settings.defaultServer
  if (preferred === DEBRID_SERVER_ID || preferred === LEGACY_TORBOX_SERVER_ID) return premium ? DEBRID_SERVER_ID : appDefaultServer()
  return isAppServer(kind, preferred) ? preferred : appDefaultServer()
}
