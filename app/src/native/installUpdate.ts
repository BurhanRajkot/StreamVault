import { useState } from 'react'
import { desktop, isAndroid, openExternal, SvNative } from './platform'
import type { AppRelease } from './updates'

export type InstallState =
  | { phase: 'idle' }
  | { phase: 'downloading'; percent: number | null }
  | { phase: 'installing' }
  | { phase: 'error'; message: string }

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

/**
 * Android: download the APK with the system downloader, then hand it to the
 * package installer (Android asks the user to confirm, and the first time to
 * allow installs from StreamVault). Linux AppImage: swap the file and
 * restart. Anywhere else: the release page.
 */
export function useInstallUpdate(): { state: InstallState; install: (release: AppRelease) => Promise<void> } {
  const [state, setState] = useState<InstallState>({ phase: 'idle' })

  const install = async (release: AppRelease) => {
    if (!release.assetUrl) {
      await openExternal(release.pageUrl)
      return
    }
    try {
      if (isAndroid) {
        setState({ phase: 'downloading', percent: 0 })
        const { id, path } = await SvNative.enqueue({
          url: release.assetUrl,
          fileName: `StreamVault-${release.version}.apk`,
          title: `StreamVault ${release.version}`,
          description: 'App update',
          folder: 'updates',
        })
        for (;;) {
          await sleep(800)
          const [t] = (await SvNative.status({ ids: [id] })).items
          if (!t || t.status === 'failed') throw new Error(t?.reason || 'The update download failed.')
          if (t.status === 'done') break
          setState({ phase: 'downloading', percent: t.total > 0 ? Math.round((t.bytes / t.total) * 100) : null })
        }
        setState({ phase: 'installing' })
        const result = await SvNative.installApk({ path })
        if (result.needsPermission) {
          setState({ phase: 'error', message: 'Allow StreamVault to install apps in the screen that opened, then tap Update again.' })
          return
        }
        setState({ phase: 'idle' })
        return
      }
      if (desktop?.canSelfUpdate) {
        setState({ phase: 'downloading', percent: null })
        const result = await desktop.installUpdate(release.assetUrl)
        if (!result.ok) throw new Error(result.reason || 'The update could not be installed.')
        setState({ phase: 'installing' })
        return
      }
      await openExternal(release.pageUrl)
    } catch (err) {
      setState({ phase: 'error', message: err instanceof Error ? err.message : String(err) })
    }
  }

  return { state, install }
}
