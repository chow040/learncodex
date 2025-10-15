import { Router, Request, Response } from 'express'
import {
  generateState,
  generatePKCE,
  getAuthUrl,
  exchangeCodeForTokens,
  upsertUser,
  createSession,
  invalidateSession,
} from '../services/authService.js'
import { requireAuth, type AuthenticatedRequest } from '../middleware/auth.js'

const router = Router()

// Store PKCE verifiers temporarily (in production, use Redis or similar)
const pkceStore = new Map<string, { codeVerifier: string; timestamp: number }>()

// Cleanup expired PKCE entries every 5 minutes
setInterval(() => {
  const fiveMinutesAgo = Date.now() - 5 * 60 * 1000
  for (const [key, value] of pkceStore.entries()) {
    if (value.timestamp < fiveMinutesAgo) {
      pkceStore.delete(key)
    }
  }
}, 5 * 60 * 1000)

// GET /auth/google - Initiate OAuth flow
router.get('/google', (req: Request, res: Response) => {
  try {
    const state = generateState()
    const { codeVerifier, codeChallenge } = generatePKCE()
    
    // Store code verifier with state for later verification
    pkceStore.set(state, {
      codeVerifier,
      timestamp: Date.now(),
    })
    
    const authUrl = getAuthUrl(state, codeChallenge)
    
    // Redirect to Google OAuth
    res.redirect(authUrl)
  } catch (error) {
    console.error('OAuth initiation error:', error)
    res.status(500).json({ error: 'Failed to initiate authentication' })
  }
})

// GET /auth/google/callback - Handle OAuth callback
router.get('/google/callback', async (req: Request, res: Response) => {
  try {
    const { code, state, error } = req.query
    
    if (error) {
      console.error('OAuth error:', error)
      return res.redirect(`${process.env.FRONTEND_URL}?error=oauth_denied`)
    }
    
    if (!code || !state || typeof code !== 'string' || typeof state !== 'string') {
      return res.redirect(`${process.env.FRONTEND_URL}?error=invalid_callback`)
    }
    
    // Retrieve and validate PKCE verifier
    const storedPKCE = pkceStore.get(state)
    if (!storedPKCE) {
      return res.redirect(`${process.env.FRONTEND_URL}?error=invalid_state`)
    }
    
    // Remove used PKCE entry
    pkceStore.delete(state)
    
    // Exchange code for tokens
    const { profile, tokens } = await exchangeCodeForTokens(code, storedPKCE.codeVerifier)
    
    // Create or update user
    const user = await upsertUser(profile, tokens)
    
    // Create session
    const session = await createSession(user.id, req)
    
    // Set session cookie
    res.cookie('sessionId', session!.id, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
    })
    
    // Redirect to frontend
    res.redirect(process.env.FRONTEND_URL || 'http://localhost:5173')
  } catch (error) {
    console.error('OAuth callback error:', error)
    res.redirect(`${process.env.FRONTEND_URL}?error=auth_failed`)
  }
})

// POST /auth/logout - Logout user
router.post('/logout', async (req: Request, res: Response) => {
  try {
    const sessionId = req.cookies?.sessionId
    
    if (sessionId) {
      await invalidateSession(sessionId)
      res.clearCookie('sessionId')
    }
    
    res.json({ success: true })
  } catch (error) {
    console.error('Logout error:', error)
    res.status(500).json({ error: 'Logout failed' })
  }
})

// GET /me - Get current user profile
router.get('/me', requireAuth, (req: AuthenticatedRequest, res: Response) => {
  res.json(req.user)
})

export default router