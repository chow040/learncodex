import { createContext, useContext, useState, useEffect } from 'react'
import type { ReactNode } from 'react'

export interface User {
  id: string
  email: string
  name: string
  avatar?: string
  emailVerified: boolean
  role: 'user' | 'admin'
}

export type AuthStatus = 'loading' | 'authenticated' | 'unauthenticated'

export interface AuthError {
  message: string
  code?: string
}

interface AuthContextType {
  user: User | null
  status: AuthStatus
  error: AuthError | null
  login: () => void
  logout: () => Promise<void>
  clearError: () => void
}

const AuthContext = createContext<AuthContextType | undefined>(undefined)

interface AuthProviderProps {
  children: ReactNode
}

export function AuthProvider({ children }: AuthProviderProps) {
  const [user, setUser] = useState<User | null>(null)
  const [status, setStatus] = useState<AuthStatus>('loading')
  const [error, setError] = useState<AuthError | null>(null)

  const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL as string | undefined)?.trim()
  if (!API_BASE_URL) {
    throw new Error('VITE_API_BASE_URL is not configured')
  }

  // Initialize auth state on component mount
  useEffect(() => {
    checkAuthStatus()
  }, [])

  const checkAuthStatus = async () => {
    try {
      const response = await fetch(`${API_BASE_URL}/api/auth/me`, {
        credentials: 'include',
      })
      
      if (response.ok) {
        const userData = await response.json()
        setUser({
          id: userData.id,
          email: userData.email,
          name: userData.name,
          avatar: userData.avatar,
          emailVerified: Boolean(userData.emailVerified),
          role: userData.role === 'admin' ? 'admin' : 'user',
        })
        setStatus('authenticated')
      } else {
        setStatus('unauthenticated')
      }
    } catch (err) {
      console.error('Auth check failed:', err)
      setStatus('unauthenticated')
    }
  }

  const login = () => {
    // Clear any previous errors
    setError(null)
    
    // Redirect to Google OAuth endpoint
    window.location.href = `${API_BASE_URL}/api/auth/google`
  }



  const logout = async () => {
    try {
      setError(null)
      await fetch(`${API_BASE_URL}/api/auth/logout`, {
        method: 'POST',
        credentials: 'include',
      })
      
      setUser(null)
      setStatus('unauthenticated')
    } catch (err) {
      setError({
        message: 'Logout failed. Please try again.',
        code: 'LOGOUT_ERROR'
      })
      console.error('Logout failed:', err)
    }
  }

  const clearError = () => {
    setError(null)
  }

  return (
    <AuthContext.Provider 
      value={{ 
        user, 
        status, 
        error, 
        login, 
        logout, 
        clearError 
      }}
    >
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth(): AuthContextType {
  const context = useContext(AuthContext)
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider')
  }
  return context
}
