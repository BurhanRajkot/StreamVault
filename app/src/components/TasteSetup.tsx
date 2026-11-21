import { useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useAuth0 } from '@auth0/auth0-react'
import { Check, Loader2, Sparkles } from 'lucide-react'
import { toast } from 'sonner'
import { fetchMediaSummaries } from '@/lib/api'
import type { Media } from '@/lib/config'
import { cn } from '@/lib/utils'
import { Button } from '@app/components/kit'
import { Sheet } from '@app/components/Sheet'
import { tmdbImg } from '@app/components/media'

const API_BASE = import.meta.env.VITE_API_URL
const MIN_PICKS = 5
/** Same key as the website's onboarding (src/hooks/useOnboarding), so a choice made on one isn't asked again on the other. */
const DONE_KEY = (userId: string) => `cinematch_onboarded_${userId}`

/**
 * What a new account can pick from: the films and shows most people know,
 * across tastes — Hollywood, Indian cinema and series, anime, K-drama — so
 * "For You" starts from this person rather than from what's popular with
 * everyone (every account without history got the same rows).
 */
const PICKS: { tmdbId: number; mediaType: 'movie' | 'tv' }[] = [
  { tmdbId: 1399, mediaType: 'tv' }, // Game of Thrones
  { tmdbId: 20453, mediaType: 'movie' }, // 3 Idiots
  { tmdbId: 155, mediaType: 'movie' }, // The Dark Knight
  { tmdbId: 101352, mediaType: 'tv' }, // Panchayat
  { tmdbId: 1396, mediaType: 'tv' }, // Breaking Bad
  { tmdbId: 579974, mediaType: 'movie' }, // RRR
  { tmdbId: 93405, mediaType: 'tv' }, // Squid Game
  { tmdbId: 27205, mediaType: 'movie' }, // Inception
  { tmdbId: 84105, mediaType: 'tv' }, // Mirzapur
  { tmdbId: 85937, mediaType: 'tv' }, // Demon Slayer
  { tmdbId: 299534, mediaType: 'movie' }, // Avengers: Endgame
  { tmdbId: 111188, mediaType: 'tv' }, // Scam 1992
  { tmdbId: 66732, mediaType: 'tv' }, // Stranger Things
  { tmdbId: 1163258, mediaType: 'movie' }, // 12th Fail
  { tmdbId: 2316, mediaType: 'tv' }, // The Office
  { tmdbId: 872906, mediaType: 'movie' }, // Jawan
  { tmdbId: 157336, mediaType: 'movie' }, // Interstellar
  { tmdbId: 93352, mediaType: 'tv' }, // The Family Man
  { tmdbId: 372058, mediaType: 'movie' }, // Your Name.
  { tmdbId: 1668, mediaType: 'tv' }, // Friends
  { tmdbId: 587412, mediaType: 'movie' }, // K.G.F: Chapter 2
  { tmdbId: 100088, mediaType: 'tv' }, // The Last of Us
  { tmdbId: 496243, mediaType: 'movie' }, // Parasite
  { tmdbId: 79352, mediaType: 'tv' }, // Sacred Games
  { tmdbId: 95479, mediaType: 'tv' }, // Jujutsu Kaisen
  { tmdbId: 1112426, mediaType: 'movie' }, // Stree 2
  { tmdbId: 70523, mediaType: 'tv' }, // Dark
  { tmdbId: 238, mediaType: 'movie' }, // The Godfather
  { tmdbId: 90447, mediaType: 'tv' }, // Hotel Del Luna
  { tmdbId: 1022789, mediaType: 'movie' }, // Inside Out 2
  { tmdbId: 136315, mediaType: 'tv' }, // The Bear
  { tmdbId: 858485, mediaType: 'movie' }, // Kantara
  { tmdbId: 419430, mediaType: 'movie' }, // Get Out
  { tmdbId: 89113, mediaType: 'tv' }, // Kota Factory
  { tmdbId: 108545, mediaType: 'tv' }, // 3 Body Problem
  { tmdbId: 857598, mediaType: 'movie' }, // Pushpa 2
]

interface TasteProfile {
  isNewUser: boolean
  interactionCount: number
  topGenres: unknown[]
}

function readDone(userId: string): boolean {
  try {
    return localStorage.getItem(DONE_KEY(userId)) === 'true'
  } catch {
    return false
  }
}

function writeDone(userId: string): void {
  try {
    localStorage.setItem(DONE_KEY(userId), 'true')
  } catch {
    /* private mode: it's asked again next time, nothing worse */
  }
}

/**
 * A signed-in account with little or no history: offer to pick a few titles,
 * which seed its recommendations (POST /recommendations/onboarding).
 */
export function TasteSetup() {
  const { isAuthenticated, user, getAccessTokenSilently } = useAuth0()
  const userId = user?.sub
  const [dismissed, setDismissed] = useState(false)
  // Read each render: the account is only known once Auth0 has loaded
  const hidden = dismissed || (userId ? readDone(userId) : false)
  const [open, setOpen] = useState(false)

  const { data: profile } = useQuery({
    queryKey: ['taste-profile', userId],
    enabled: isAuthenticated && !!userId && !hidden,
    staleTime: 30 * 60_000,
    retry: false,
    queryFn: async (): Promise<TasteProfile> => {
      const token = await getAccessTokenSilently()
      const res = await fetch(`${API_BASE}/recommendations/profile`, { headers: { Authorization: `Bearer ${token}` } })
      if (!res.ok) throw new Error(`profile ${res.status}`)
      return res.json()
    },
  })

  // A thin history — a couple of looks, one genre — gives everyone the same
  // rows; a real one doesn't need asking.
  const thin = !!profile && (profile.isNewUser || profile.interactionCount < 8 || profile.topGenres.length < 2)
  if (!isAuthenticated || !userId || hidden || !thin) return null

  const finish = () => {
    writeDone(userId)
    setDismissed(true)
    setOpen(false)
  }

  return (
    <>
      <section className="px-4 pb-2 pt-1 lg:px-8">
        <div className="glass-card flex items-center gap-3 rounded-[18px] p-4">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-tint/20 text-tint" aria-hidden="true">
            <Sparkles className="h-5 w-5" />
          </span>
          <div className="min-w-0 flex-1">
            <p className="t-headline text-white">Make “For You” yours</p>
            <p className="t-footnote text-label-2">Pick {MIN_PICKS} titles you love and your recommendations start from your taste.</p>
          </div>
          <div className="flex shrink-0 flex-col items-end gap-1 sm:flex-row sm:items-center sm:gap-2">
            <Button size="sm" onClick={() => setOpen(true)}>
              Pick titles
            </Button>
            <button type="button" onClick={finish} className="t-caption px-2 py-1 text-label-2 hover:text-white">
              Not now
            </button>
          </div>
        </div>
      </section>
      <TastePicker open={open} onOpenChange={setOpen} onDone={finish} getToken={getAccessTokenSilently} />
    </>
  )
}

function TastePicker({
  open,
  onOpenChange,
  onDone,
  getToken,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  onDone: () => void
  getToken: () => Promise<string>
}) {
  const queryClient = useQueryClient()
  const [picked, setPicked] = useState<string[]>([])
  const [saving, setSaving] = useState(false)
  const { data: titles, isLoading } = useQuery({
    queryKey: ['taste-picks'],
    enabled: open,
    staleTime: Infinity,
    queryFn: () => fetchMediaSummaries(PICKS),
  })

  const keyOf = (m: Media) => `${m.media_type}:${m.id}`
  const toggle = (key: string) => setPicked((p) => (p.includes(key) ? p.filter((k) => k !== key) : [...p, key]))

  const save = async () => {
    if (picked.length < MIN_PICKS || saving) return
    setSaving(true)
    try {
      const token = await getToken()
      const selections = picked.map((key) => {
        const [mediaType, id] = key.split(':')
        return { tmdbId: Number(id), mediaType }
      })
      const res = await fetch(`${API_BASE}/recommendations/onboarding`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ selections }),
      })
      if (!res.ok) throw new Error(`onboarding ${res.status}`)
      toast.success('Done — For You now starts from your picks')
      await queryClient.invalidateQueries({ queryKey: ['recommendations'] })
      onDone()
    } catch {
      toast.error('Couldn’t save your picks — try again in a moment')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange} title="Pick what you love" description={`Choose at least ${MIN_PICKS}. The more you pick, the better it gets.`}>
      <div>
        {isLoading || !titles ? (
          <div className="flex justify-center py-16 text-label-2">
            <Loader2 className="h-6 w-6 animate-spin" />
          </div>
        ) : (
          <ul className="grid grid-cols-3 gap-2.5 sm:grid-cols-4">
            {titles
              .filter((m) => m.poster_path)
              .map((m) => {
                const key = keyOf(m)
                const on = picked.includes(key)
                const name = m.title || m.name || ''
                return (
                  <li key={key}>
                    <button
                      type="button"
                      aria-pressed={on}
                      aria-label={name}
                      onClick={() => toggle(key)}
                      className={cn('press relative block w-full overflow-hidden rounded-[10px] ring-2 transition', on ? 'ring-tint' : 'ring-transparent')}
                    >
                      <img src={tmdbImg(m.poster_path, 'w342')} alt="" loading="lazy" className={cn('aspect-[2/3] w-full object-cover transition', on && 'opacity-60')} />
                      {on && (
                        <span className="absolute right-1.5 top-1.5 flex h-6 w-6 items-center justify-center rounded-full bg-tint text-white">
                          <Check className="h-4 w-4" strokeWidth={3} />
                        </span>
                      )}
                    </button>
                  </li>
                )
              })}
          </ul>
        )}
      </div>
      {/* Stays in reach while the posters scroll under it */}
      <div className="sticky -bottom-6 -mx-4 mt-3 bg-black/85 px-4 pb-6 pt-3">
        <Button className="w-full" disabled={picked.length < MIN_PICKS || saving} onClick={save}>
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : picked.length < MIN_PICKS ? `Pick ${MIN_PICKS - picked.length} more` : `Done · ${picked.length} picked`}
        </Button>
      </div>
    </Sheet>
  )
}
