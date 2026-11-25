import { useMemo } from 'react'
import qrcode from 'qrcode-generator'
import { cn } from '@/lib/utils'

/** A QR code a phone's camera opens — black on white, with the quiet zone scanners need. */
export function QrCode({ value, className, label }: { value: string; className?: string; label: string }) {
  const { size, path } = useMemo(() => {
    const qr = qrcode(0, 'M')
    qr.addData(value)
    qr.make()
    const count = qr.getModuleCount()
    let d = ''
    for (let row = 0; row < count; row++) {
      for (let col = 0; col < count; col++) {
        if (qr.isDark(row, col)) d += `M${col + 4} ${row + 4}h1v1h-1z`
      }
    }
    return { size: count + 8, path: d }
  }, [value])

  return (
    <svg viewBox={`0 0 ${size} ${size}`} role="img" aria-label={label} className={cn('rounded-[14px] bg-white', className)} shapeRendering="crispEdges">
      <path d={path} fill="#000" />
    </svg>
  )
}
