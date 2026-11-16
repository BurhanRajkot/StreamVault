import { useNavigate } from 'react-router-dom'
import { Heart } from 'lucide-react'
import { useFavorites } from '@/context/FavoritesContext'
import { useAppAuth } from '@app/auth/AppAuthProvider'
import { useMyList } from '@app/components/MyListRow'
import { PosterGrid, PosterGridSkeleton } from '@app/components/media'
import { EmptyState, PageHeader } from '@app/components/PageHeader'
import { Button } from '@app/components/kit'

export function MyListScreen() {
  const navigate = useNavigate()
  const { isAuthenticated, signIn } = useAppAuth()
  const { favorites } = useFavorites()
  const { data, isLoading } = useMyList()

  const button = (label: string, onClick: () => void) => (
    <Button variant="tinted" onClick={onClick}>
      {label}
    </Button>
  )

  return (
    <div className="px-4 pb-tabbar pt-page lg:px-12">
      <PageHeader back title="My List" subtitle={favorites.length > 0 ? `${favorites.length} title${favorites.length === 1 ? '' : 's'}` : undefined} />
      {!isAuthenticated ? (
        <EmptyState
          icon={<Heart />}
          title="Your list, everywhere"
          text="Sign in to keep a list of what you want to watch — on your phone, your computer and the website."
          action={button('Sign In', () => void signIn({ returnTo: '/my-list' }))}
        />
      ) : favorites.length === 0 ? (
        <EmptyState icon={<Heart />} title="Nothing saved yet" text="Tap + on any title and it lands here." action={button('Browse', () => navigate('/'))} />
      ) : isLoading && !data ? (
        <PosterGridSkeleton count={favorites.length} />
      ) : (
        <PosterGrid items={data ?? []} />
      )}
    </div>
  )
}
