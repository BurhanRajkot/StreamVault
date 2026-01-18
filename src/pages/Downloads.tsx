import { useEffect, useState } from 'react'
import { fetchDownloads, downloadFile, DownloadItem } from '@/lib/api'
import { Download } from 'lucide-react'

const Downloads = () => {
  const [items, setItems] = useState<DownloadItem[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetchDownloads()
      .then(setItems)
      .finally(() => setLoading(false))
  }, [])

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20 text-muted-foreground">
        Loading downloads…
      </div>
    )
  }

  if (!items.length) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-muted-foreground">
        <Download className="mb-3 h-8 w-8 opacity-60" />
        <p>No downloads available.</p>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {items.map((d) => (
        <div
          key={d.id}
          className="flex flex-col gap-3 rounded-xl border border-border/60 bg-card p-4 sm:flex-row sm:items-center sm:justify-between"
        >
          <div>
            <h3 className="text-base font-semibold text-foreground">
              {d.title}
            </h3>
            <p className="text-sm text-muted-foreground">{d.quality}</p>
          </div>

          <button
            onClick={() => downloadFile(d.id)}
            className="
              inline-flex items-center justify-center gap-2
              rounded-lg bg-primary px-5 py-2.5
              text-sm font-semibold text-primary-foreground
              transition-all hover:scale-[1.03] hover:shadow-md
              active:scale-95
            "
          >
            <Download className="h-4 w-4" />
            Download
          </button>
        </div>
      ))}
    </div>
  )
}

export default Downloads
