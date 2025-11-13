import { Router, Request, Response } from 'express'
import crypto from 'crypto'
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

// Encryption key for PKCE cookie (use env var in production)
const ENCRYPTION_KEY = process.env.PKCE_ENCRYPTION_KEY || crypto.randomBytes(32).toString('hex')

// Encrypt data for secure cookie storage
function encrypt(text: string): string {
  const key = Buffer.from(ENCRYPTION_KEY.slice(0, 64), 'hex')
  const iv = crypto.randomBytes(16)
  const cipher = crypto.createCipheriv('aes-256-cbc', key, iv)
  let encrypted = cipher.update(text, 'utf8', 'hex')
  encrypted += cipher.final('hex')
  return iv.toString('hex') + ':' + encrypted
}

// Decrypt data from secure cookie
function decrypt(text: string): string {
  const key = Buffer.from(ENCRYPTION_KEY.slice(0, 64), 'hex')
  const parts = text.split(':')
  if (parts.length !== 2) {
    throw new Error('Invalid encrypted data format')
  }
  const iv = Buffer.from(parts[0]!, 'hex')
  const encryptedText = parts[1]!
  const decipher = crypto.createDecipheriv('aes-256-cbc', key, iv)
  let decrypted = decipher.update(encryptedText, 'hex', 'utf8')
  decrypted += decipher.final('utf8')
  return decrypted
}

// GET /auth/google - Initiate OAuth flow
router.get('/google', (req: Request, res: Response) => {
  try {
    const state = generateState()
    const { codeVerifier, codeChallenge } = generatePKCE()
    
    // Store code verifier in encrypted cookie (serverless-safe)
    const pkceData = JSON.stringify({
      state,
      codeVerifier,
      timestamp: Date.now(),
    })
    const encryptedPKCE = encrypt(pkceData)
    
    const isProduction = process.env.NODE_ENV === 'production' || req.secure || req.get('x-forwarded-proto') === 'https'
    
    // Cookie domain for custom domain support (subdomains share cookies)
    // Use .alphaflux.app in production to share between alphaflux.app and api.alphaflux.app
    const cookieDomain = isProduction && process.env.COOKIE_DOMAIN ? process.env.COOKIE_DOMAIN : undefined
    
    res.cookie('oauth_pkce', encryptedPKCE, {
      httpOnly: true,
      secure: isProduction,
      sameSite: isProduction ? 'lax' : 'lax',  // Can use 'lax' with same root domain
      domain: cookieDomain,
      maxAge: 5 * 60 * 1000, // 5 minutes
      path: '/api/auth',
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
    
    // Retrieve PKCE data from encrypted cookie
    const encryptedPKCE = req.cookies?.oauth_pkce
    if (!encryptedPKCE) {
      console.error('PKCE cookie missing')
      return res.redirect(`${process.env.FRONTEND_URL}?error=invalid_state`)
    }
    
    let pkceData
    try {
      const decryptedData = decrypt(encryptedPKCE)
      pkceData = JSON.parse(decryptedData)
    } catch (err) {
      console.error('Failed to decrypt PKCE data:', err)
      return res.redirect(`${process.env.FRONTEND_URL}?error=invalid_state`)
    }
    
    // Validate state matches
    if (pkceData.state !== state) {
      console.error('State mismatch:', { expected: pkceData.state, received: state })
      return res.redirect(`${process.env.FRONTEND_URL}?error=invalid_state`)
    }
    
    // Check timestamp (5 minute expiry)
    const fiveMinutesAgo = Date.now() - 5 * 60 * 1000
    if (pkceData.timestamp < fiveMinutesAgo) {
      console.error('PKCE data expired')
      return res.redirect(`${process.env.FRONTEND_URL}?error=expired_state`)
    }
    
    // Clear PKCE cookie
    res.clearCookie('oauth_pkce', { path: '/api/auth' })
    
    // Exchange code for tokens
    const { profile, tokens } = await exchangeCodeForTokens(code, pkceData.codeVerifier)
    
    // Create or update user
    const user = await upsertUser(profile, tokens)
    
    // Create session
    const session = await createSession(user.id, req)
    
    // Set session cookie
    const isProduction = process.env.NODE_ENV === 'production' || req.secure || req.get('x-forwarded-proto') === 'https'
    
    // Cookie domain for custom domain support (subdomains share cookies)
    const cookieDomain = isProduction && process.env.COOKIE_DOMAIN ? process.env.COOKIE_DOMAIN : undefined
    
    res.cookie('sessionId', session!.id, {
      httpOnly: true,
      secure: isProduction,
      sameSite: isProduction ? 'lax' : 'lax',  // Can use 'lax' with same root domain
      domain: cookieDomain,
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