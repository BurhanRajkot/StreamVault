import { useEffect, useRef, useState } from 'react'
import { Smartphone } from 'lucide-react'
import { Button } from '@app/components/kit'
import { QrCode } from './QrCode'

const OPEN_EVENT = 'sv-tv-open-on-phone'

/** A TV has no browser: show the link as a QR code to open on a phone instead. */
export function openOnPhone(url: string): void {
  window.dispatchEvent(new CustomEvent<string>(OPEN_EVENT, { detail: url }))
}

/** The dialog openOnPhone() shows. Back (Escape) or Done closes it. */
export function TvOpenOnPhoneLayer() {
  const [url, setUrl] = useState<string | null>(null)
  const dialog = useRef<HTMLDivElement>(null)
  const returnFocus = useRef<HTMLElement | null>(null)

  useEffect(() => {
    const onOpen = (e: Event) => {
      returnFocus.current = document.activeElement as HTMLElement | null
      setUrl((e as CustomEvent<string>).detail)
    }
    window.addEventListener(OPEN_EVENT, onOpen)
    return () => window.removeEventListener(OPEN_EVENT, onOpen)
  }, [])

  useEffect(() => {
    if (!url) return
    dialog.current?.querySelector<HTMLButtonElement>('button')?.focus()
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [url])

  function close() {
    setUrl(null)
    returnFocus.current?.focus?.()
  }

  if (!url) return null
  return (
    <div className="fixed inset-0 z-[400] flex items-center justify-center bg-black/70">
      <div ref={dialog} role="dialog" aria-modal="true" aria-labelledby="tv-open-title" className="material-float flex max-w-[760px] items-center gap-10 rounded-[28px] p-10">
        <QrCode value={url} label="QR code for the link" className="h-[220px] w-[220px] shrink-0" />
        <div className="min-w-0">
          <p className="mb-2 flex items-center gap-2 text-[15px] font-semibold text-tint">
            <Smartphone className="h-[18px] w-[18px]" /> Open on your phone
          </p>
          <h2 id="tv-open-title" className="mb-3 text-[26px] font-bold leading-tight text-white">
            Scan with your phone’s camera
          </h2>
          <p className="mb-7 break-all text-[15px] text-label-2">{url}</p>
          <Button onClick={close}>
            Done
          </Button>
        </div>
      </div>
    </div>
  )
}
