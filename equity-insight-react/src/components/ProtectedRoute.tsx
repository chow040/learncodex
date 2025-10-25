import type { ReactNode } from 'react'
import { Navigate, useLocation } from 'react-router-dom'

import { useAuth } from '../contexts/AuthContext'
import { ActiveRunBanner } from './nav/ActiveRunBanner'

interface ProtectedRouteProps {
  children: ReactNode
}

export function ProtectedRoute({ children }: ProtectedRouteProps) {
  const { status } = useAuth()
  const location = useLocation()

  if (status === 'loading') {
    return (
      <div className="flex h-screen items-center justify-center">
        <div className="text-muted-foreground">Loading...</div>
      </div>
    )
  }

  if (status === 'unauthenticated') {
    // Preserve the intended destination for post-login navigation
    return <Navigate to="/" replace state={{ from: location }} />
  }

  return (
    <>
      <ActiveRunBanner />
      {children}
    </>
  )
}
