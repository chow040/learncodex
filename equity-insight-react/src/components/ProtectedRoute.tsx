import type { ReactNode } from 'react'
import { Link, Navigate, useLocation } from 'react-router-dom'

import { useAuth } from '../contexts/AuthContext'
import { ActiveRunBanner } from './nav/ActiveRunBanner'
import { Button } from './ui/button'

interface ProtectedRouteProps {
  children: ReactNode
  requireAdmin?: boolean
}

export function ProtectedRoute({ children, requireAdmin = false }: ProtectedRouteProps) {
  const { status, user } = useAuth()
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

  if (requireAdmin && user?.role !== 'admin') {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-background px-6 text-center">
        <div>
          <p className="text-2xl font-semibold text-foreground">Admin access required</p>
          <p className="mt-2 max-w-sm text-sm text-muted-foreground">
            You need admin permissions to view this page. Contact an administrator if you believe this is an error.
          </p>
        </div>
        <Button asChild variant="outline">
          <Link to="/">Return home</Link>
        </Button>
      </div>
    )
  }

  return (
    <>
      <ActiveRunBanner />
      {children}
    </>
  )
}
