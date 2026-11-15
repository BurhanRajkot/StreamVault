import { useSyncExternalStore } from 'react'
import type { QualityPreference } from '@app/downloads/premiumFile'

export interface AppSettings {
  /** Server new playbacks start on; '' means the site's default (Sol). */
  defaultServer: string
  downloadQuality: QualityPreference
  /** Android: hold downloads until the phone is on Wi-Fi. */
  wifiOnly: boolean
  /** Shown once, on first launch. */
  acceptedTerms: boolean
}

const KEY = 'sv-app:settings'
const DEFAULTS: AppSettings = { defaultServer: '', downloadQuality: '1080p', wifiOnly: false, acceptedTerms: false }

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
