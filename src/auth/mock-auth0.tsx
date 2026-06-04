/* eslint-disable react-refresh/only-export-components */
import React, { createContext, useContext, useState, useEffect } from 'react'

interface Auth0ContextType {
  isAuthenticated: boolean
  isLoading: boolean
  user: any
  loginWithRedirect: (options?: any) => Promise<void>
  logout: (options?: any) => void
  getAccessTokenSilently: (options?: any) => Promise<string>
}

const Auth0Context = createContext<Auth0ContextType | undefined>(undefined)

export function Auth0Provider({ children }: { children: React.ReactNode }) {
  const [isAuthenticated, setIsAuthenticated] = useState(false)
  const [isLoading, setIsLoading] = useState(true)
  const [user, setUser] = useState<any>(null)

  useEffect(() => {
    // Read mock state from localStorage
    const mockAuth = localStorage.getItem('e2e_mock_authenticated') === 'true'
    const mockUserStr = localStorage.getItem('e2e_mock_user')
    const mockUser = mockUserStr ? JSON.parse(mockUserStr) : {
      sub: 'auth0|mock-user-123',
      name: 'E2E Tester',
      email: 'tester@streamvault.test',
      picture: 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?auto=format&fit=crop&w=100&h=100&q=80',
    }

    setIsAuthenticated(mockAuth)
    setUser(mockAuth ? mockUser : null)
    setIsLoading(false)
  }, [])

  const loginWithRedirect = async (options?: any) => {
    // If we are already on the login or signup page, mock the login and redirect back
    if (window.location.pathname === '/login' || window.location.pathname === '/signup') {
      localStorage.setItem('e2e_mock_authenticated', 'true')
      setIsAuthenticated(true)
      const mockUser = {
        sub: 'auth0|mock-user-123',
        name: 'E2E Tester',
        email: 'tester@streamvault.test',
        picture: 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?auto=format&fit=crop&w=100&h=100&q=80',
      }
      localStorage.setItem('e2e_mock_user', JSON.stringify(mockUser))
      setUser(mockUser)
      
      const searchParams = new URLSearchParams(window.location.search)
      let returnTo = searchParams.get('returnTo') || '/'

      // Open Redirect vulnerability fix: Validate returnTo is a safe relative path
      if (!returnTo.startsWith('/') || returnTo.startsWith('//') || returnTo.startsWith('\\')) {
        returnTo = '/'
      }

      window.location.href = returnTo
    } else {
      // Redirect to /login page with returnTo path
      const returnTo = window.location.pathname + window.location.search
      window.location.href = `/login?returnTo=${encodeURIComponent(returnTo)}`
    }
  }

  const logout = (options?: any) => {
    localStorage.removeItem('e2e_mock_authenticated')
    localStorage.removeItem('e2e_mock_user')
    // Clear other user settings to prevent leftover state
    localStorage.removeItem('cinematch_onboarded_auth0|mock-user-123')
    setIsAuthenticated(false)
    setUser(null)
    window.location.reload()
  }

  const getAccessTokenSilently = async (options?: any) => {
    return 'mock-access-token'
  }

  return (
    <Auth0Context.Provider
      value={{
        isAuthenticated,
        isLoading,
        user,
        loginWithRedirect,
        logout,
        getAccessTokenSilently,
      }}
    >
      {children}
    </Auth0Context.Provider>
  )
}

// eslint-disable-next-line react-refresh/only-export-components
export function useAuth0() {
  const context = useContext(Auth0Context)
  if (!context) {
    throw new Error('useAuth0 must be used within an Auth0Provider')
  }
  return context
}
