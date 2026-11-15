import { Capacitor, registerPlugin } from '@capacitor/core'

/** A transfer the OS downloader (Android) or the desktop shell is running. */
export interface NativeTransfer {
  id: string
  status: 'pending' | 'running' | 'paused' | 'done' | 'failed'
  bytes: number
  total: number
  /** Why it failed or paused, when the downloader said. */
  reason?: string
}

/** The Android side: app/android/.../SvNativePlugin.java. */
interface SvNativePlugin {
  enqueue(options: { url: string; fileName: string; title: string; description?: string; wifiOnly?: boolean; folder?: 'media' | 'updates' }): Promise<{ id: string; path: string }>
  status(options: { ids: string[] }): Promise<{ items: NativeTransfer[] }>
  remove(options: { id?: string; path?: string }): Promise<void>
  /** A http://127.0.0.1 URL that serves a downloaded file with range requests (seeking). */
  serve(options: { path: string }): Promise<{ url: string }>
  openWith(options: { path: string; mimeType?: string }): Promise<void>
  installApk(options: { path: string }): Promise<{ needsPermission?: boolean }>
  setImmersive(options: { enabled: boolean }): Promise<void>
  freeSpace(): Promise<{ bytes: number }>
}

/** The desktop side: app/electron/preload.cjs. */
export interface DesktopBridge {
  version: string
  download(options: { url: string; fileName: string; title: string }): Promise<{ id: string; path: string }>
  status(ids: string[]): Promise<NativeTransfer[]>
  remove(options: { id?: string; path?: string }): Promise<void>
  serve(path: string): Promise<{ url: string }>
  openWith(path: string): Promise<void>
  showInFolder(path: string): Promise<void>
  openExternal(url: string): Promise<void>
  setFullscreen(enabled: boolean): Promise<void>
  /** Replace the running AppImage with a newer one, then restart. False when not an AppImage. */
  installUpdate(url: string): Promise<{ ok: boolean; reason?: string }>
  canSelfUpdate: boolean
  freeSpace(): Promise<{ bytes: number }>
}

declare global {
  interface Window {
    svDesktop?: DesktopBridge
  }
  const __APP_VERSION__: string
}

export const isAndroid = Capacitor.getPlatform() === 'android'
export const desktop: DesktopBridge | undefined = typeof window !== 'undefined' ? window.svDesktop : undefined
export const isDesktop = !!desktop
export const isNativeApp = isAndroid || isDesktop
export const platformLabel = isAndroid ? 'Android' : isDesktop ? 'Linux' : 'Web'

export const SvNative = registerPlugin<SvNativePlugin>('SvNative')

export const APP_VERSION = __APP_VERSION__

/** The site's address — also the origin both shells serve the app from. */
export const SITE_URL = 'https://stream-vault.site'

/** Open a URL outside the app: the system browser, or the app that handles it (upi://, magnet:). */
export async function openExternal(url: string): Promise<void> {
  if (desktop) return desktop.openExternal(url)
  if (isAndroid) {
    // http(s) in a Custom Tab; anything else (upi:, magnet:) is an intent the WebView hands to Android
    if (/^https?:/i.test(url)) {
      const { Browser } = await import('@capacitor/browser')
      return Browser.open({ url, toolbarColor: '#0a0a0c' })
    }
    window.location.href = url
    return
  }
  window.open(url, '_blank', 'noopener')
}

/** Full screen and sideways for playback; back to normal after. */
export async function setPlaybackMode(enabled: boolean): Promise<void> {
  try {
    if (isAndroid) await SvNative.setImmersive({ enabled })
    else if (desktop) await desktop.setFullscreen(enabled)
  } catch {
    // Not fatal: the player still fills the window
  }
}
