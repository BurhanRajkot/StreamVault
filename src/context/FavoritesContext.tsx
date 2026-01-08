import { createContext, useContext } from 'react'
import { useFavoritesInternal } from '@/hooks/useFavorites'

const FavoritesContext = createContext<
  ReturnType<typeof useFavoritesInternal> | undefined
>(undefined)

export function FavoritesProvider({ children }: { children: React.ReactNode }) {
  const value = useFavoritesInternal()
  return (
    <FavoritesContext.Provider value={value}>
      {children}
    </FavoritesContext.Provider>
  )
}

export function useFavorites() {
  const context = useContext(FavoritesContext)
  if (!context) {
    throw new Error('useFavorites must be used inside FavoritesProvider')
  }
  return context
}
