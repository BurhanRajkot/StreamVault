import { useNavigate } from 'react-router-dom'
import { ArrowLeft, Heart } from 'lucide-react'
import { useFavorites } from '@/context/FavoritesContext'
import { useAppAuth } from '@app/auth/AppAuthProvider'
import { useMyList } from '@app/components/MyListRow'
import { PosterGrid, PosterGridSkeleton } from '@app/components/media'

export function MyListScreen() {
  const navigate = useNavigate()
  const { isAuthenticated, signIn } = useAppAuth()
  const { favorites } = useFavorites()
  const { data, isLoading } = useMyList()

  return (
    <div className="mx-auto max-w-6xl px-4 pb-tabbar pt-safe lg:px-8 lg:pb-10">
      <header className="flex items-center gap-2 pb-4 pt-3 lg:pt-8">
        <button onClick={() => navigate(-1)} aria-label="Back" className="-ml-2 flex h-9 w-9 items-center justify-center rounded-full lg:hidden">
          <ArrowLeft className="h-5 w-5" />
        </button>
        <h1 className="text-[22px] font-extrabold tracking-tight">My List</h1>
      </header>
      {!isAuthenticated ? (
        <Empty text="Sign in to keep a list of what you want to watch, on every device." action="Sign in" onAction={() => void signIn({ returnTo: '/my-list' })} />
      ) : favorites.length === 0 ? (
        <Empty text="Tap + My List on any title to save it here." action="Browse" onAction={() => navigate('/')} />
      ) : isLoading && !data ? (
        <PosterGridSkeleton count={favorites.length} />
      ) : (
        <PosterGrid items={data ?? []} />
      )}
    </div>
  )
}

function Empty({ text, action, onAction }: { text: string; action: string; onAction: () => void }) {
  return (
    <div className="flex flex-col items-center pt-20 text-center">
      <Heart className="mb-4 h-10 w-10 text-white/40" />
      <p className="max-w-xs text-[13.5px] text-white/60">{text}</p>
      <button onClick={onAction} className="press mt-5 rounded-md bg-white px-5 py-2 text-[13.5px] font-semibold text-black">
        {action}
      </button>
    </div>
  )
}
