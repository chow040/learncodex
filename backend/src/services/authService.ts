import { OAuth2Client, CodeChallengeMethod } from 'google-auth-library'
import jwt from 'jsonwebtoken'
import crypto from 'crypto'
import { db } from '../db/client.js'
import { users, userIdentities, sessions } from '../db/schema.js'
import { eq, and } from 'drizzle-orm'

const client = new OAuth2Client(
  process.env.GOOGLE_CLIENT_ID,
  process.env.GOOGLE_CLIENT_SECRET,
  process.env.GOOGLE_REDIRECT_URI
)

export interface GoogleProfile {
  sub: string
  email: string
  email_verified: boolean
  name: string
  picture?: string | undefined
  given_name?: string | undefined
  family_name?: string | undefined
}

export interface SessionUser {
  id: string
  email: string
  name: string
  avatar?: string | undefined
  emailVerified: boolean
}

// Generate secure random state for OAuth
export function generateState(): string {
  return crypto.randomBytes(32).toString('hex')
}

// Generate PKCE code verifier and challenge
export function generatePKCE() {
  const codeVerifier = crypto.randomBytes(32).toString('base64url')
  const codeChallenge = crypto
    .createHash('sha256')
    .update(codeVerifier)
    .digest('base64url')
  
  return { codeVerifier, codeChallenge }
}

// Get Google OAuth authorization URL
export function getAuthUrl(state: string, codeChallenge: string): string {
  return client.generateAuthUrl({
    access_type: 'offline',
    scope: ['openid', 'email', 'profile'],
    state,
    code_challenge: codeChallenge,
    code_challenge_method: CodeChallengeMethod.S256,
    include_granted_scopes: true,
    prompt: 'consent',
  })
}

// Exchange authorization code for tokens and verify ID token
export async function exchangeCodeForTokens(code: string, codeVerifier: string) {
  try {
    const { tokens } = await client.getToken({
      code,
      codeVerifier,
    })
    
    if (!tokens.id_token) {
      throw new Error('No ID token received from Google')
    }

    // Verify the ID token
    const ticket = await client.verifyIdToken({
      idToken: tokens.id_token,
      audience: process.env.GOOGLE_CLIENT_ID!,
    })
    
    const payload = ticket.getPayload()
    if (!payload) {
      throw new Error('Invalid ID token payload')
    }

    const profile: GoogleProfile = {
      sub: payload.sub,
      email: payload.email || '',
      email_verified: payload.email_verified || false,
      name: payload.name || '',
      picture: payload.picture,
      given_name: payload.given_name,
      family_name: payload.family_name,
    }

    return {
      profile,
      tokens: {
        access_token: tokens.access_token,
        refresh_token: tokens.refresh_token,
        id_token: tokens.id_token,
        expiry_date: tokens.expiry_date,
      }
    }
  } catch (error) {
    console.error('Token exchange failed:', error)
    throw new Error('Failed to exchange authorization code')
  }
}

// Upsert user and identity records
export async function upsertUser(profile: GoogleProfile, tokens: any) {
  if (!db) {
    throw new Error('Database connection not available')
  }
  
  try {
    return await db.transaction(async (tx) => {
      // First, try to find existing user by email
      let user = await tx
        .select()
        .from(users)
        .where(eq(users.email, profile.email))
        .limit(1)
        .then(rows => rows[0])

      if (!user) {
        // Create new user
        const [newUser] = await tx
          .insert(users)
          .values({
            email: profile.email,
            emailVerified: profile.email_verified,
            fullName: profile.name,
            avatarUrl: profile.picture,
            lastLoginAt: new Date(),
          })
          .returning()
        user = newUser
      } else {
        // Update existing user profile
        const [updatedUser] = await tx
          .update(users)
          .set({
            fullName: profile.name,
            avatarUrl: profile.picture,
            emailVerified: profile.email_verified,
            lastLoginAt: new Date(),
            updatedAt: new Date(),
          })
          .where(eq(users.id, user.id))
          .returning()
        user = updatedUser
      }

      // Upsert user identity
      const existingIdentity = await tx
        .select()
        .from(userIdentities)
        .where(
          and(
            eq(userIdentities.provider, 'google'),
            eq(userIdentities.providerSub, profile.sub)
          )
        )
        .limit(1)
        .then(rows => rows[0])

      if (existingIdentity) {
        // Update existing identity
        await tx
          .update(userIdentities)
          .set({
            accessToken: tokens.access_token,
            refreshToken: tokens.refresh_token,
            idToken: tokens.id_token,
            expiresAt: tokens.expiry_date ? new Date(tokens.expiry_date) : null,
            rawProfile: profile,
            updatedAt: new Date(),
          })
          .where(eq(userIdentities.id, existingIdentity.id))
      } else {
        // Create new identity
        await tx
          .insert(userIdentities)
          .values({
            userId: user!.id,
            provider: 'google',
            providerSub: profile.sub,
            accessToken: tokens.access_token,
            refreshToken: tokens.refresh_token,
            idToken: tokens.id_token,
            expiresAt: tokens.expiry_date ? new Date(tokens.expiry_date) : null,
            rawProfile: profile,
          })
      }

      return user!
    })
  } catch (error) {
    console.error('User upsert failed:', error)
    throw new Error('Failed to create or update user')
  }
}

// Create session for user
export async function createSession(userId: string, req: any) {
  if (!db) {
    throw new Error('Database connection not available')
  }
  
  const sessionId = crypto.randomUUID()
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000) // 7 days

  const [session] = await db
    .insert(sessions)
    .values({
      id: sessionId,
      userId,
      expiresAt,
      ipAddress: req.ip,
      userAgent: req.get('User-Agent'),
    })
    .returning()

  await db
    .update(users)
    .set({
      lastLoginAt: new Date(),
      updatedAt: new Date(),
    })
    .where(eq(users.id, userId))

  return session
}

// Get user by session ID
export async function getUserBySessionId(sessionId: string): Promise<SessionUser | null> {
  if (!db) {
    return null
  }
  
  try {
    const result = await db
      .select({
        id: users.id,
        email: users.email,
        name: users.fullName,
        avatar: users.avatarUrl,
        emailVerified: users.emailVerified,
        sessionExpiresAt: sessions.expiresAt,
      })
      .from(sessions)
      .innerJoin(users, eq(sessions.userId, users.id))
      .where(eq(sessions.id, sessionId))
      .limit(1)

    const row = result[0]
    if (!row || row.sessionExpiresAt < new Date()) {
      return null
    }

    return {
      id: row.id,
      email: row.email,
      name: row.name || '',
      avatar: row.avatar || undefined,
      emailVerified: row.emailVerified,
    }
  } catch (error) {
    console.error('Failed to get user by session:', error)
    return null
  }
}

// Invalidate session
export async function invalidateSession(sessionId: string) {
  if (!db) {
    throw new Error('Database connection not available')
  }
  
  try {
    await db.delete(sessions).where(eq(sessions.id, sessionId))
  } catch (error) {
    console.error('Failed to invalidate session:', error)
    throw new Error('Failed to logout')
  }
}
