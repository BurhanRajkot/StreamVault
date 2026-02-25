import { useEffect, useState, useMemo } from 'react'
import { useAuth0 } from '@auth0/auth0-react'
import { fetchDownloads, downloadFile, DownloadItem, getAdminToken } from '@/lib/api'
import { getImageUrl } from '@/lib/api'
import { Search, Download, Crown, ShieldCheck, X } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Link } from 'react-router-dom'
import AdminLoginModal from '@/components/AdminLoginModal'

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:4000'

type EnrichedDownload = DownloadItem & {
  posterPath: string | null
}

// Clean title: remove year, quality, brackets, etc.
function cleanTitle(raw: string) {
  return raw
    .replace(/\(\d{4}\)/g, '')        // remove (2014)
    .replace(/\[.*?\]/g, '')          // remove [1080p]
    .replace(/1080p|720p|2160p/gi, '')
    .replace(/bluray|webrip|hdrip/gi, '')
    .replace(/\s+/g, ' ')
    .trim()
}

async function fetchPoster(title: string): Promise<string | null> {
  try {
    const cleaned = cleanTitle(title)
    // Route through backend proxy to avoid exposing TMDB key in the browser bundle
    const res = await fetch(
      `${API_URL}/tmdb/search/movie?query=${encodeURIComponent(cleaned)}`
    )
    if (!res.ok) return null
    const data = await res.json()
    if (data.results && data.results.length > 0) {
      return data.results[0].poster_path || null
    }
    return null
  } catch (err) {
    console.error('Poster fetch failed for:', title, err)
    return null
  }
}


const Downloads = () => {
  const { isAuthenticated, getAccessTokenSilently } = useAuth0()
  const [items, setItems] = useState<EnrichedDownload[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [isPremium, setIsPremium] = useState(false)
  const [needsUpgrade, setNeedsUpgrade] = useState(false)
  const [showAdminModal, setShowAdminModal] = useState(false)
  const [isAdmin, setIsAdmin] = useState(false)

  useEffect(() => {
    async function load() {
      setLoading(true)

      // Check if admin is authenticated
      const adminToken = getAdminToken()
      if (adminToken) {
        setIsAdmin(true)
        try {
          // Fetch downloads with admin token
          const raw = await fetchDownloads(adminToken)

          const enriched = await Promise.all(
            raw.map(async (item) => {
              const posterPath = await fetchPoster(item.title)
              return {
                ...item,
                posterPath,
              }
            })
          )

          setItems(enriched)
          setIsPremium(true)
          setNeedsUpgrade(false)
        } catch (err: any) {
          console.error('Admin downloads fetch error:', err)
          setItems([])
          setIsAdmin(false)
          setNeedsUpgrade(true)
        } finally {
          setLoading(false)
        }
        return
      }

      // Regular user flow
      if (!isAuthenticated) {
        setLoading(false)
        return
      }

      try {
        const token = await getAccessTokenSilently()
        const raw = await fetchDownloads(token)

        const enriched = await Promise.all(
          raw.map(async (item) => {
            const posterPath = await fetchPoster(item.title)
            return {
              ...item,
              posterPath,
            }
          })
        )

        setItems(enriched)
        setIsPremium(true)
        setNeedsUpgrade(false)
      } catch (err: any) {
        if (err.message?.includes('premium') || err.message?.includes('upgrade')) {
          setNeedsUpgrade(true)
        }
        setItems([])
      } finally {
        setLoading(false)
      }
    }

    load()
  }, [isAuthenticated, getAccessTokenSilently])

  const handleAdminLoginSuccess = async () => {
    setLoading(true)
    const adminToken = getAdminToken()

    if (!adminToken) {
      setLoading(false)
      return
    }

    try {
      const raw = await fetchDownloads(adminToken)

      const enriched = await Promise.all(
        raw.map(async (item) => {
          const posterPath = await fetchPoster(item.title)
          return {
            ...item,
            posterPath,
          }
        })
      )

      setItems(enriched)
      setIsPremium(true)
      setNeedsUpgrade(false)
      setIsAdmin(true)
    } catch (err: any) {
      console.error('Admin downloads fetch error:', err)
      setItems([])
    } finally {
      setLoading(false)
    }
  }

  const filtered = useMemo(() => {
    if (!search.trim()) return items

    return items.filter((i) =>
      i.title.toLowerCase().includes(search.toLowerCase())
    )
  }, [items, search])

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20 text-muted-foreground">
        Loading downloads…
      </div>
    )
  }

  if (!isAuthenticated) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-center">
        <Download className="mb-4 h-12 w-12 text-muted-foreground" />
        <h2 className="mb-2 text-xl font-semibold">Login Required</h2>
        <p className="mb-4 text-muted-foreground">
          Please sign in to access downloads.
        </p>
        <Link
          to="/login"
          className="rounded-md bg-primary px-6 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
        >
          Sign In
        </Link>
      </div>
    )
  }

  if (needsUpgrade) {
    return (
      <>
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <Crown className="mb-4 h-12 w-12 text-yellow-500" />
          <h2 className="mb-2 text-xl font-semibold">Premium Feature</h2>
          <p className="mb-4 max-w-md text-muted-foreground">
            Downloads are only available for premium subscribers. Upgrade now to download unlimited content!
          </p>
          <Link
            to="/pricing"
            className="rounded-md bg-primary px-6 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
          >
            Upgrade to Premium
          </Link>

          {/* Admin Login Button - Bottom Left */}
          <button
            onClick={() => setShowAdminModal(true)}
            className={cn(
              'fixed bottom-24 left-6 flex items-center gap-2 rounded-lg border border-border/50 bg-card/80 px-4 py-2.5 text-sm font-medium text-muted-foreground backdrop-blur-sm',
              'hover:bg-card hover:text-foreground hover:border-primary/50',
              'transition-all duration-200',
              'shadow-lg hover:shadow-xl',
              'z-50'
            )}
          >
            <ShieldCheck className="h-4 w-4" />
            <span>Admin Login</span>
          </button>
        </div>

        {/* Admin Login Modal */}
        <AdminLoginModal
          isOpen={showAdminModal}
          onClose={() => setShowAdminModal(false)}
          onSuccess={handleAdminLoginSuccess}
        />
      </>
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
    <div className="space-y-6">
      {/* Search Bar */}
      {/* Search Bar (Updated match Header) */}
      <div className="relative max-w-md group">
        <Search className="absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground group-focus-within:text-primary transition-all duration-300 group-focus-within:scale-110" />
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search downloads..."
          className="h-10 w-full rounded-lg border border-border/50 bg-secondary/60 backdrop-blur-xl pl-11 pr-4 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary transition-all duration-300 placeholder:text-muted-foreground/60"
        />
        {search && (
          <button
            type="button"
            onClick={() => setSearch('')}
            className="absolute right-4 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground hover:scale-110 transition-all duration-200 active:scale-90"
          >
            <X className="h-4 w-4" />
          </button>
        )}
      </div>

      {/* Grid */}
      <div
        className="
          grid
          grid-cols-2
          gap-3
          sm:grid-cols-3
          sm:gap-4
          md:grid-cols-4
          lg:grid-cols-5
          xl:grid-cols-6
        "
      >
        {filtered.map((item) => {
          const imageUrl = getImageUrl(item.posterPath, 'poster')

          return (
            <div
              key={item.id}
              onClick={() => downloadFile(item.id)}
              className={cn(
                'group relative cursor-pointer overflow-hidden rounded-lg bg-card transition-all duration-300',
                'hover:scale-[1.03] hover:shadow-card hover:ring-1 hover:ring-primary/50',
                'active:scale-[0.97]'
              )}
            >
              {/* Poster */}
              <div className="relative aspect-[2/3] overflow-hidden">
                <img
                  src={imageUrl}
                  alt={item.title}
                  className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-110"
                  onError={(e) => {
                    // 🔒 FINAL SAFETY FALLBACK
                    ;(e.currentTarget as HTMLImageElement).src = '/placeholder.svg'
                  }}
                />

                {/* Download Overlay */}
                <div className="absolute inset-0 flex items-center justify-center bg-black/0 transition group-hover:bg-black/40">
                  <Download className="h-10 w-10 opacity-0 transition group-hover:opacity-100" />
                </div>
              </div>

              {/* Text */}
              <div className="p-3">
                <h3 className="line-clamp-1 text-sm font-semibold text-foreground">
                  {item.title}
                </h3>
                <p className="mt-1 line-clamp-1 text-xs text-muted-foreground">
                  {item.quality}
                </p>
              </div>
            </div>
          )
        })}
      </div>

      {filtered.length === 0 && (
        <p className="text-center text-sm text-muted-foreground">
          No downloads match your search.
        </p>
      )}
    </div>
  )
}

export default Downloads
