import { useSyncExternalStore } from 'react'
import type { QualityPreference } from '@app/downloads/premiumFile'

export interface AppSettings {
  /** Server new playbacks start on; '' means the app's embed server (see servers.ts). */
  defaultServer: string
  /**
   * An account with Premium starts every playback on it (lib/startServer).
   * Turned off only by picking another default server while it has Premium.
   */
  premiumDefault: boolean
  downloadQuality: QualityPreference
  /** Android: hold downloads until the phone is on Wi-Fi. */
  wifiOnly: boolean
  /** Desktop: the player takes the whole screen as it opens (otherwise it plays in the window). */
  playerFullscreen: boolean
  /** Shown once, on first launch. */
  acceptedTerms: boolean
}

const KEY = 'sv-app:settings'
const DEFAULTS: AppSettings = { defaultServer: '', premiumDefault: true, downloadQuality: '1080p', wifiOnly: false, playerFullscreen: false, acceptedTerms: false }

function read(): AppSettings {
  try {
    const raw = localStorage.getItem(KEY)
    return raw ? { ...DEFAULTS, ...(JSON.parse(raw) as Partial<AppSettings>) } : DEFAULTS
  } catch {
    return DEFAULTS
  }
}

let current = read()
const listeners = new Set<() => void>()

export function getSettings(): AppSettings {
  return current
}

export function updateSettings(patch: Partial<AppSettings>): void {
  current = { ...current, ...patch }
  try {
    localStorage.setItem(KEY, JSON.stringify(current))
  } catch {
    // Storage full or blocked: the setting still holds for this session
  }
  listeners.forEach((fn) => fn())
}

export function useSettings(): AppSettings {
  return useSyncExternalStore(
    (fn) => {
      listeners.add(fn)
      return () => listeners.delete(fn)
    },
    () => current
  )
}
