import { createContext, useContext } from 'react'
import { useDislikesInternal } from '@/hooks/useDislikes'

const DislikesContext = createContext<
  ReturnType<typeof useDislikesInternal> | undefined
>(undefined)

export function DislikesProvider({ children }: { children: React.ReactNode }) {
  const value = useDislikesInternal()
  return (
    <DislikesContext.Provider value={value}>
      {children}
    </DislikesContext.Provider>
  )
}

// eslint-disable-next-line react-refresh/only-export-components
export function useDislikes() {
  const context = useContext(DislikesContext)
  if (!context) {
    throw new Error('useDislikes must be used inside DislikesProvider')
  }
  return context
}
