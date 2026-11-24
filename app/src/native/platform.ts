import { Capacitor, registerPlugin } from '@capacitor/core'
import type { LocalStreamRequest } from '@/lib/localStream'
import { getSettings } from '@app/lib/settings'

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
  /** Premium through the app (RdStreamServer.java): whether it can convert audio (it has ffmpeg). */
  rdCaps(): Promise<{ canConvert: boolean }>
  /** Start relaying a Real-Debrid file; its addresses on the phone's own server. */
  rdOpen(options: LocalStreamRequest): Promise<OpenedStream>
  rdClose(options: { token: string }): Promise<void>
}

/** A Real-Debrid file the shell relays (and converts): see src/lib/localStream.ts. */
export interface OpenedStream {
  token: string
  fileUrl: string
  convertUrl: string | null
}

/** The desktop side (Linux, Windows): app/electron/preload.cjs. */
export interface DesktopBridge {
  version: string
  /** Node's process.platform: 'linux' or 'win32'. Missing on shells from before the Windows app (all Linux). */
  platform?: string
  download(options: { url: string; fileName: string; title: string }): Promise<{ id: string; path: string }>
  status(ids: string[]): Promise<NativeTransfer[]>
  remove(options: { id?: string; path?: string }): Promise<void>
  serve(path: string): Promise<{ url: string }>
  openWith(path: string): Promise<void>
  showInFolder(path: string): Promise<void>
  openExternal(url: string): Promise<void>
  /**
   * Sign in through the system browser (Google refuses embedded browsers):
   * opens the Auth0 authorize URL there, and answers the site URL Auth0
   * returned to (?code=…&state=…), or null if it was cancelled or timed out.
   * Missing on shells older than it.
   */
  signIn?(authorizeUrl: string): Promise<string | null>
  cancelSignIn?(): Promise<void>
  setFullscreen(enabled: boolean): Promise<void>
  /** Fetch the newer AppImage / Windows installer (its parts joined in order, checked against sha256), install it, restart. */
  installUpdate(source: { urls: string[]; sha256?: string }): Promise<{ ok: boolean; reason?: string }>
  canSelfUpdate: boolean
  freeSpace(): Promise<{ bytes: number }>
  /** The window has no system frame — the app draws the title bar and its buttons. */
  frameless?: boolean
  /**
   * Minimize, maximize/restore (or leave full screen) or close the window, keep it above others ('pin' toggles,
   * 'unpin' clears), or just ask ('state'); answers its state after. Missing on shells older than the redesign.
   */
  windowControl?(action: WindowAction): Promise<WindowState | null>
  onWindowState?(callback: (state: WindowState) => void): () => void
  /** Keys the shell sees even while an embedded player's frame has focus (Escape). */
  onKey?(callback: (key: string) => void): () => void
  /** Premium through the app (electron/rdStream.cjs). Missing on shells older than it. */
  rdCaps?(): Promise<{ canConvert: boolean }>
  rdOpen?(request: LocalStreamRequest): Promise<OpenedStream>
  rdClose?(token: string): Promise<void>
}

export type WindowAction = 'minimize' | 'maximize' | 'close' | 'pin' | 'unpin' | 'state'

export interface WindowState {
  maximized: boolean
  fullscreen: boolean
  /** Kept above other windows. Missing on shells older than it. */
  pinned?: boolean
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
export const isWindows = desktop?.platform === 'win32'
export const isNativeApp = isAndroid || isDesktop
export const platformLabel = isAndroid ? 'Android' : isWindows ? 'Windows' : isDesktop ? 'Linux' : 'Web'

export const SvNative = registerPlugin<SvNativePlugin>('SvNative')

export const APP_VERSION = __APP_VERSION__

/** The site's address — also the origin both shells serve the app from. */
export const SITE_URL = 'https://stream-vault.site'

/** Open a URL outside the app: the system browser, or the app that handles it (magnet:). */
export async function openExternal(url: string): Promise<void> {
  if (desktop) return desktop.openExternal(url)
  if (isAndroid) {
    // http(s) in a Custom Tab; anything else (magnet:) is an intent the WebView hands to Android
    if (/^https?:/i.test(url)) {
      const { Browser } = await import('@capacitor/browser')
      return Browser.open({ url, toolbarColor: '#0a0a0c' })
    }
    window.location.href = url
    return
  }
  window.open(url, '_blank', 'noopener')
}

/**
 * Android: full screen and sideways for playback, back to normal after.
 * Desktop: the player opens in the window as it is — it can still be moved,
 * resized, snapped beside another window or minimized — unless the viewer
 * asked for full screen (settings); leaving the player leaves full screen
 * and lets go of "keep on top".
 */
export async function setPlaybackMode(enabled: boolean): Promise<void> {
  try {
    if (isAndroid) await SvNative.setImmersive({ enabled })
    else if (desktop) {
      if (!enabled) {
        await desktop.setFullscreen(false)
        await desktop.windowControl?.('unpin')
      } else if (getSettings().playerFullscreen) await desktop.setFullscreen(true)
    }
  } catch {
    // Not fatal: the player still fills the window
  }
}
