import { useNavigate } from 'react-router-dom'
import { Heart } from 'lucide-react'
import { useFavorites } from '@/context/FavoritesContext'
import { useAppAuth } from '@app/auth/AppAuthProvider'
import { useMyList } from '@app/components/MyListRow'
import { PosterGrid, PosterGridSkeleton } from '@app/components/media'
import { EmptyState, PageHeader } from '@app/components/PageHeader'

export function MyListScreen() {
  const navigate = useNavigate()
  const { isAuthenticated, signIn } = useAppAuth()
  const { favorites } = useFavorites()
  const { data, isLoading } = useMyList()

  const button = (label: string, onClick: () => void) => (
    <button onClick={onClick} className="press rounded-full bg-white px-6 py-2.5 text-[14px] font-bold text-black">
      {label}
    </button>
  )

  return (
    <div className="px-4 pb-tabbar pt-page lg:px-12">
      <PageHeader back title="My List" subtitle={favorites.length > 0 ? `${favorites.length} title${favorites.length === 1 ? '' : 's'} saved to watch` : undefined} />
      {!isAuthenticated ? (
        <EmptyState
          icon={<Heart className="h-10 w-10 text-white" />}
          title="Your list, everywhere"
          text="Sign in to keep a list of what you want to watch — on your phone, your computer and the website."
          action={button('Sign in', () => void signIn({ returnTo: '/my-list' }))}
        />
      ) : favorites.length === 0 ? (
        <EmptyState icon={<Heart className="h-10 w-10 text-white" />} title="Nothing saved yet" text="Tap + My List on any title and it lands here." action={button('Browse', () => navigate('/'))} />
      ) : isLoading && !data ? (
        <PosterGridSkeleton count={favorites.length} />
      ) : (
        <PosterGrid items={data ?? []} />
      )}
    </div>
  )
}
