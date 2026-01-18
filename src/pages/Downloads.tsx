import { useEffect, useState } from 'react'
import { fetchDownloads, downloadFile, DownloadItem } from '@/lib/api'

const Downloads = () => {
  const [items, setItems] = useState<DownloadItem[]>([])

  useEffect(() => {
    fetchDownloads().then(setItems)
  }, [])

  if (!items.length) {
    return (
      <div className="text-center text-muted-foreground">
        No downloads available.
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {items.map((d) => (
        <div
          key={d.id}
          className="flex items-center justify-between rounded-lg border p-4"
        >
          <div>
            <h3 className="font-semibold">{d.title}</h3>
            <p className="text-sm text-muted-foreground">{d.quality}</p>
          </div>
          <button
            onClick={() => downloadFile(d.id)}
            className="rounded-lg bg-primary px-4 py-2 text-primary-foreground"
          >
            Download
          </button>
        </div>
      ))}
    </div>
  )
}

export default Downloads
