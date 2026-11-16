/**
 * Premium plays through the app's own server, not straight from Real-Debrid
 * (src/lib/localStream.ts says why): the Electron shell on Linux
 * (electron/rdStream.cjs), SvNative's RdStreamServer on Android. Registered
 * once at startup; the website never registers, so it plays as before.
 */

import { setLocalStreamProvider, type LocalStreamProvider, type LocalStreamRequest } from '@/lib/localStream'
import { SvNative, desktop, isAndroid, type OpenedStream } from './platform'

interface Shell {
  caps(): Promise<{ canConvert: boolean }>
  open(request: LocalStreamRequest): Promise<OpenedStream>
  close(token: string): Promise<void>
}

function shell(): Shell | null {
  const bridge = desktop
  if (bridge?.rdCaps && bridge.rdOpen && bridge.rdClose) {
    const { rdCaps, rdOpen, rdClose } = bridge
    return { caps: () => rdCaps(), open: (request) => rdOpen(request), close: (token) => rdClose(token) }
  }
  if (isAndroid) {
    return {
      caps: () => SvNative.rdCaps(),
      open: (request) => SvNative.rdOpen(request),
      close: (token) => SvNative.rdClose({ token }),
    }
  }
  return null
}

export function registerPremiumStreams(): void {
  const native = shell()
  if (!native) return
  let canConvert = false
  const provider: LocalStreamProvider = {
    get canConvert() {
      return canConvert
    },
    async open(request) {
      const opened = await native.open(request)
      return {
        fileUrl: opened.fileUrl,
        convertUrl: opened.convertUrl,
        close: () => void native.close(opened.token).catch(() => {}),
      }
    },
  }
  setLocalStreamProvider(provider)
  native
    .caps()
    .then((caps) => {
      canConvert = !!caps.canConvert
    })
    .catch(() => {
      // An older shell: the file still plays, from Real-Debrid
      setLocalStreamProvider(null)
    })
}
