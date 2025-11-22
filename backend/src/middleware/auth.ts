import { Request, Response, NextFunction } from 'express'
import { getUserBySessionId } from '../services/authService.js'

export interface AuthenticatedRequest extends Request {
  user?: {
    id: string
    email: string
    name: string
    avatar?: string | undefined
    emailVerified: boolean
    role: 'user' | 'admin'
  }
}

// Middleware to check authentication
export async function requireAuth(req: AuthenticatedRequest, res: Response, next: NextFunction) {
  try {
    const sessionId = req.cookies?.sessionId
    
    if (!sessionId) {
      return res.status(401).json({ error: 'Not authenticated' })
    }

    const user = await getUserBySessionId(sessionId)
    if (!user) {
      // Clear invalid session cookie
      res.clearCookie('sessionId')
      return res.status(401).json({ error: 'Invalid session' })
    }

    req.user = user
    next()
  } catch (error) {
    console.error('Auth middleware error:', error)
    res.status(500).json({ error: 'Authentication error' })
  }
}

// Optional auth - adds user to request if authenticated, but doesn't require it
export async function optionalAuth(req: AuthenticatedRequest, res: Response, next: NextFunction) {
  try {
    const sessionId = req.cookies?.sessionId
    
    if (sessionId) {
      const user = await getUserBySessionId(sessionId)
      if (user) {
        req.user = user
      }
    }
    
    next()
  } catch (error) {
    console.error('Optional auth middleware error:', error)
    // Continue without authentication on error
    next()
  }
}

export function requireAdmin(req: AuthenticatedRequest, res: Response, next: NextFunction) {
  if (!req.user) {
    return res.status(401).json({ error: 'Not authenticated' })
  }
  if (req.user.role !== 'admin') {
    return res.status(403).json({ error: 'Admin access required' })
  }
  return next()
}
