import { setNativePlayer, type NativePlayRequest, type NativePlayResult } from '@/lib/nativePlayer'
import { isTv, SvNative } from '@app/native/platform'

/**
 * TV only: Premium plays in Android's own player (TvPlayerActivity), which a
 * TV's chip keeps up with — see src/lib/nativePlayer.ts. Phones and the
 * desktop app keep the page's player. Call after detectTv().
 */
export function registerNativePlayer(): void {
  if (!isTv || !SvNative.playNative) return
  setNativePlayer({
    play: (request: NativePlayRequest): Promise<NativePlayResult> => SvNative.playNative!(request),
  })
}
