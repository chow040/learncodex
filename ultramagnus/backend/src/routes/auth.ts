import { Router } from 'express';
import { db } from '../db/client.js';
import { authUsers, userProfiles, verificationTokens } from '../db/schema.js';
import { desc, eq, lt } from 'drizzle-orm';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { config } from '../config/env.js';
import { cookieOpts, createAccessToken, createRefreshToken, hashToken, verifyToken } from '../utils/tokens.js';
import { OAuth2Client } from 'google-auth-library';
import crypto from 'crypto';
import { logger } from '../utils/logger.js';
import { sendVerificationEmail } from '../services/mailer.js';

export const authRouter = Router();

const emailFingerprint = (value: string) => crypto.createHash('sha256').update(value.toLowerCase()).digest('hex').slice(0, 12);
const isValidEmail = (value: string) => /\S+@\S+\.\S+/.test(value);

const ensureProfile = async (userId: string, email: string, displayName?: string) => {
  const existing = await db.select().from(userProfiles).where(eq(userProfiles.id, userId)).limit(1);
  if (existing.length > 0) return existing[0];

  const name = displayName || (email.split('@')[0] || 'Trader');
  const [created] = await db
    .insert(userProfiles)
    .values({
      id: userId,
      email,
      displayName: name,
      tier: 'Pro'
    })
    .returning();
  return created;
};

authRouter.post('/signup', async (req, res) => {
  const log = req.log || logger;
  const { email, password, displayName } = req.body || {};
  if (!email || !password) {
    return res.status(400).json({ error: 'Email and password are required.' });
  }
  if (!isValidEmail(email)) {
    return res.status(400).json({ error: 'Invalid email format.' });
  }
  if (password.length < 8) {
    return res.status(400).json({ error: 'Password must be at least 8 characters.' });
  }

  const existingUser = await db.select().from(authUsers).where(eq(authUsers.email, email)).limit(1);
  if (existingUser.length > 0) {
    return res.status(400).json({ error: 'Email already registered.' });
  }

  const passwordHash = await bcrypt.hash(password, 10);
  const [user] = await db
    .insert(authUsers)
    .values({ email, passwordHash, verified: 'false' })
    .returning();

  let profile = null;
  try {
    profile = await ensureProfile(user.id, email, displayName);
  } catch (e: any) {
    log.warn({
      message: 'auth.signup.ensure_profile_failed',
      err: e,
      userId: user.id,
      emailHash: emailFingerprint(email)
    });
  }

  const token = crypto.randomUUID();
  const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);
  await db.insert(verificationTokens).values({ userId: user.id, token, expiresAt }).onConflictDoNothing();

  const verificationUrl = `${config.frontendUrl}/verify?token=${token}`;
  try {
    await sendVerificationEmail(email, verificationUrl);
  } catch (err) {
    log.warn({ message: 'auth.signup.verification_email_failed', err, userId: user.id, emailHash: emailFingerprint(email) });
  }

  log.info({ message: 'auth.signup.pending_verification', userId: user.id, emailHash: emailFingerprint(email) });
  return res.status(202).json({ user: { id: user.id, email }, profile, verificationUrl, message: 'Please verify your email.' });
});

authRouter.post('/login', async (req, res) => {
  const log = req.log || logger;
  const { email, password } = req.body || {};
  if (!email || !password) {
    return res.status(400).json({ error: 'Email and password are required.' });
  }
  if (!isValidEmail(email)) {
    return res.status(400).json({ error: 'Invalid email format.' });
  }

  const existing = await db.select().from(authUsers).where(eq(authUsers.email, email)).limit(1);
  if (existing.length === 0) {
    return res.status(400).json({ error: 'Invalid credentials.' });
  }

  const user = existing[0];
  if (user.verified !== 'true') {
    const now = new Date();

    // Clean up expired tokens for this user
    await db.delete(verificationTokens).where(lt(verificationTokens.expiresAt, now));

    const existingTokens = await db
      .select()
      .from(verificationTokens)
      .where(eq(verificationTokens.userId, user.id))
      .orderBy(desc(verificationTokens.expiresAt));

    let tokenRecord = existingTokens.find((t) => t.expiresAt && new Date(t.expiresAt) > now);
    let emailSent = false;
    let resendAvailableAt = Date.now();

    if (!tokenRecord) {
      const token = crypto.randomUUID();
      const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);
      const inserted = await db
        .insert(verificationTokens)
        .values({ userId: user.id, token, expiresAt })
        .returning();
      tokenRecord = inserted[0] || { token, expiresAt, userId: user.id, id: crypto.randomUUID() };
      emailSent = false; // created but not sent; user can hit explicit resend
    } else {
      log.info({
        message: 'auth.login.verification_pending',
        userId: user.id,
        emailHash: emailFingerprint(email)
      });
    }

    const verificationUrl = `${config.frontendUrl}/verify?token=${tokenRecord.token}`;
    return res.status(403).json({
      error: 'verification_required',
      verificationUrl,
      emailSent,
      resendAvailableAt,
      message: 'Your email is not verified. Check your inbox or click Resend to get a new link.'
    });
  }

  const valid = await bcrypt.compare(password, user.passwordHash);
  if (!valid) {
    return res.status(400).json({ error: 'Invalid credentials.' });
  }

  let profile = null;
  try {
    profile = await ensureProfile(user.id, email);
  } catch (e: any) {
    log.warn({
      message: 'auth.login.ensure_profile_failed',
      err: e,
      userId: user.id,
      emailHash: emailFingerprint(email)
    });
  }

  const accessToken = createAccessToken(user.id, email);
  const refreshToken = createRefreshToken(user.id, email);
  const refreshHash = hashToken(refreshToken);
  await db.update(authUsers).set({ refreshTokenHash: refreshHash }).where(eq(authUsers.id, user.id));

  res.cookie('access_token', accessToken, { ...cookieOpts, maxAge: 60 * 60 * 1000 });
  res.cookie('refresh_token', refreshToken, { ...cookieOpts, httpOnly: true, maxAge: 7 * 24 * 60 * 60 * 1000 });

  log.info({ message: 'auth.login.success', userId: user.id, emailHash: emailFingerprint(email) });
  return res.json({ user: { id: user.id, email }, profile });
});

authRouter.post('/resend-verification', async (req, res) => {
  const log = req.log || logger;
  const { email } = req.body || {};
  if (!email || !isValidEmail(email)) {
    return res.status(400).json({ error: 'Valid email is required.' });
  }

  const users = await db.select().from(authUsers).where(eq(authUsers.email, email)).limit(1);
  if (users.length === 0) {
    return res.status(400).json({ error: 'User not found.' });
  }

  const user = users[0];
  if (user.verified === 'true') {
    return res.status(400).json({ error: 'already_verified' });
  }

  const now = new Date();
  const RESEND_COOLDOWN_MS = 10 * 60 * 1000;

  await db.delete(verificationTokens).where(lt(verificationTokens.expiresAt, now));

  const existingTokens = await db
    .select()
    .from(verificationTokens)
    .where(eq(verificationTokens.userId, user.id))
    .orderBy(desc(verificationTokens.expiresAt));

  let tokenRecord = existingTokens.find((t) => t.expiresAt && new Date(t.expiresAt) > now);
  let emailSent = false;
  let resendAvailableAt = Date.now();

  if (!tokenRecord) {
    const token = crypto.randomUUID();
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);
    const inserted = await db
      .insert(verificationTokens)
      .values({ userId: user.id, token, expiresAt })
      .returning();
    tokenRecord = inserted[0] || { token, expiresAt, userId: user.id, id: crypto.randomUUID() };
    resendAvailableAt = Date.now() + RESEND_COOLDOWN_MS;

    try {
      await sendVerificationEmail(email, `${config.frontendUrl}/verify?token=${tokenRecord.token}`);
      emailSent = true;
    } catch (err) {
      log.warn({ message: 'auth.resend.verification_email_failed', err, userId: user.id, emailHash: emailFingerprint(email) });
    }
  } else {
    const createdAtMs = tokenRecord.expiresAt
      ? new Date(tokenRecord.expiresAt).getTime() - 24 * 60 * 60 * 1000
      : Date.now();
    resendAvailableAt = createdAtMs + RESEND_COOLDOWN_MS;
    const canResend = Date.now() >= resendAvailableAt;

    if (canResend) {
      try {
        await sendVerificationEmail(email, `${config.frontendUrl}/verify?token=${tokenRecord.token}`);
        emailSent = true;
        resendAvailableAt = Date.now() + RESEND_COOLDOWN_MS;
      } catch (err) {
        log.warn({ message: 'auth.resend.verification_email_failed', err, userId: user.id, emailHash: emailFingerprint(email) });
      }
    } else {
      log.info({
        message: 'auth.resend.verification_email_throttled',
        userId: user.id,
        emailHash: emailFingerprint(email),
        resendAvailableAt
      });
    }
  }

  const verificationUrl = `${config.frontendUrl}/verify?token=${tokenRecord.token}`;
  return res.status(202).json({
    verificationUrl,
    emailSent,
    resendAvailableAt,
    message: emailSent
      ? 'Verification email sent. Check your inbox to continue.'
      : 'You already have an active verification link. Try again in a few minutes.'
  });
});

authRouter.post('/logout', async (_req, res) => {
  res.clearCookie('access_token', { path: '/' });
  res.clearCookie('refresh_token', { path: '/' });
  return res.json({ message: 'Logged out.' });
});

authRouter.get('/me', async (req, res) => {
  const log = req.log || logger;
  const accessToken = req.cookies?.access_token;
  log.debug({ message: 'auth.me.request', hasAccessToken: !!accessToken });
  try {
    if (!accessToken) {
      return res.status(401).json({ error: 'Unauthorized' });
    }
    let decoded;
    try {
      decoded = verifyToken(accessToken);
    } catch (err) {
      log.warn({ message: 'auth.me.invalid_token', err });
      res.clearCookie('access_token', { path: '/' });
      res.clearCookie('refresh_token', { path: '/' });
      return res.status(401).json({ error: 'Unauthorized' });
    }
    if (decoded.type !== 'access') {
      log.warn({ message: 'auth.me.wrong_token_type', tokenType: decoded.type });
      res.clearCookie('access_token', { path: '/' });
      res.clearCookie('refresh_token', { path: '/' });
      return res.status(401).json({ error: 'Unauthorized' });
    }
    const userId = decoded.sub;
    const users = await db.select().from(authUsers).where(eq(authUsers.id, userId)).limit(1);
    if (users.length === 0) {
      return res.status(401).json({ error: 'User not found.' });
    }

    const user = users[0];
    let profile = null;
    try {
      const rows = await db.select().from(userProfiles).where(eq(userProfiles.id, user.id)).limit(1);
      profile = rows[0] || null;
      
      // If profile doesn't exist, create it
      if (!profile) {
        log.info({
          message: 'auth.me.ensure_profile',
          action: 'create',
          userId: user.id,
          emailHash: emailFingerprint(user.email)
        });
        profile = await ensureProfile(user.id, user.email);
      }
    } catch (err) {
      log.warn({ message: 'auth.me.profile_lookup_failed', err, userId: user.id });
    }

    log.info({ message: 'auth.me.success', userId: user.id });
    return res.json({ user: { id: user.id, email: user.email }, profile });
  } catch (err: any) {
    log.error({ message: 'auth.me.error', err });
    return res.status(500).json({ error: 'Failed to fetch session.', correlationId: req.correlationId });
  }
});

authRouter.post('/refresh', async (req, res) => {
  const log = req.log || logger;
  const refreshToken = req.cookies?.refresh_token;
  if (!refreshToken) {
    return res.status(401).json({ error: 'Missing refresh token' });
  }

  try {
    const decoded = verifyToken(refreshToken);
    if (decoded.type !== 'refresh') throw new Error('Invalid token type');

    const refreshHash = hashToken(refreshToken);
    const users = await db.select().from(authUsers).where(eq(authUsers.id, decoded.sub)).limit(1);
    if (users.length === 0 || users[0].refreshTokenHash !== refreshHash) {
      return res.status(401).json({ error: 'Invalid refresh token' });
    }

    const newAccess = createAccessToken(decoded.sub, decoded.email);
    const newRefresh = createRefreshToken(decoded.sub, decoded.email);
    const newRefreshHash = hashToken(newRefresh);
    await db.update(authUsers).set({ refreshTokenHash: newRefreshHash }).where(eq(authUsers.id, decoded.sub));

    res.cookie('access_token', newAccess, { ...cookieOpts, maxAge: 60 * 60 * 1000 });
    res.cookie('refresh_token', newRefresh, { ...cookieOpts, httpOnly: true, maxAge: 7 * 24 * 60 * 60 * 1000 });
    log.info({ message: 'auth.refresh.success', userId: decoded.sub });
    return res.json({ ok: true });
  } catch (err) {
    log.warn({ message: 'auth.refresh.failed', err });
    return res.status(401).json({ error: 'Could not refresh session', correlationId: req.correlationId });
  }
});

const hasGoogleConfig = config.googleClientId && config.googleClientSecret && config.googleRedirectUri;
const googleClient = hasGoogleConfig
  ? new OAuth2Client(config.googleClientId, config.googleClientSecret, config.googleRedirectUri)
  : null;

// Exchange temporary OAuth token for session cookies
authRouter.post('/google/exchange', async (req, res) => {
  const log = req.log || logger;
  const { oauth_token } = req.body;
  if (!oauth_token) {
    return res.status(400).json({ error: 'Missing oauth_token' });
  }

  try {
    const decoded = jwt.verify(oauth_token, config.sessionSecret) as any;
    if (!decoded.userId || !decoded.email) {
      return res.status(401).json({ error: 'Invalid oauth token' });
    }

    const userId = decoded.userId;
    const email = decoded.email;

    // Create session tokens
    const accessToken = createAccessToken(userId, email);
    const refreshToken = createRefreshToken(userId, email);
    const refreshHash = hashToken(refreshToken);
    
    // Update refresh token in database
    await db.update(authUsers).set({ refreshTokenHash: refreshHash }).where(eq(authUsers.id, userId));

    // Set cookies
    res.cookie('access_token', accessToken, { ...cookieOpts, maxAge: 60 * 60 * 1000 });
    res.cookie('refresh_token', refreshToken, { ...cookieOpts, httpOnly: true, maxAge: 7 * 24 * 60 * 60 * 1000 });

    // Fetch user and profile
    const users = await db.select().from(authUsers).where(eq(authUsers.id, userId)).limit(1);
    const user = users[0];
    const profiles = await db.select().from(userProfiles).where(eq(userProfiles.id, userId)).limit(1);
    const profile = profiles[0] || null;

    log.info({ message: 'auth.google.exchange.success', userId: user.id, emailHash: emailFingerprint(email) });
    return res.json({ user: { id: user.id, email: user.email }, profile });
  } catch (err) {
    log.error({ message: 'auth.google.exchange.error', err });
    return res.status(401).json({ error: 'Invalid or expired oauth token', correlationId: req.correlationId });
  }
});

authRouter.get('/verify', async (req, res) => {
  const token = (req.query.token as string) || '';
  if (!token) {
    return res.status(400).json({ error: 'missing_token' });
  }

  const records = await db.select().from(verificationTokens).where(eq(verificationTokens.token, token)).limit(1);
  if (records.length === 0) {
    return res.status(400).json({ error: 'invalid_token' });
  }

  const record = records[0];
  if (record.expiresAt && new Date(record.expiresAt) < new Date()) {
    return res.status(400).json({ error: 'token_expired' });
  }

  await db
    .update(authUsers)
    .set({ verified: 'true' })
    .where(eq(authUsers.id, record.userId));

  await db.delete(verificationTokens).where(eq(verificationTokens.token, token));

  // Auto-login after verification
  const userRows = await db.select().from(authUsers).where(eq(authUsers.id, record.userId)).limit(1);
  const user = userRows[0];
  if (!user) {
    return res.status(400).json({ error: 'user_not_found' });
  }

  const accessToken = createAccessToken(user.id, user.email);
  const refreshToken = createRefreshToken(user.id, user.email);
  const refreshHash = hashToken(refreshToken);
  await db.update(authUsers).set({ refreshTokenHash: refreshHash }).where(eq(authUsers.id, user.id));

  res.cookie('access_token', accessToken, { ...cookieOpts, maxAge: 15 * 60 * 1000 });
  res.cookie('refresh_token', refreshToken, { ...cookieOpts, httpOnly: true, maxAge: 7 * 24 * 60 * 60 * 1000 });

  return res.json({ user: { id: user.id, email: user.email }, verified: true });
});


authRouter.get('/google/start', (req, res) => {
  if (!googleClient) {
    return res.status(503).json({ error: 'Google OAuth not configured.' });
  }
  const url = googleClient.generateAuthUrl({
    access_type: 'offline',
    scope: ['openid', 'email', 'profile'],
    prompt: 'consent'
  });
  return res.redirect(url);
});

authRouter.get('/google/callback', async (req, res) => {
  const log = req.log || logger;
  log.debug({ message: 'auth.google.callback.request', hasCode: !!req.query.code });
  if (!googleClient) {
    log.error({ message: 'auth.google.callback.no_client' });
    return res.status(503).send('Google OAuth not configured.');
  }

  const code = req.query.code as string;
  if (!code) {
    log.warn({ message: 'auth.google.callback.missing_code' });
    return res.redirect(`${config.frontendUrl}?error=missing_code`);
  }

  try {
    log.info({ message: 'auth.google.callback.exchange_start' });
    const { tokens } = await googleClient.getToken(code);
    const ticket = await googleClient.verifyIdToken({
      idToken: tokens.id_token || '',
      audience: config.googleClientId
    });
    const payload = ticket.getPayload();
    if (!payload || !payload.email) {
      return res.redirect(`${config.frontendUrl}?error=no_email`);
    }

    const email = payload.email;
    const displayName = payload.name || email.split('@')[0];
    const emailHash = emailFingerprint(email);

    let userRow = await db.select().from(authUsers).where(eq(authUsers.email, email)).limit(1);
    let user = userRow[0];
    if (!user) {
      log.info({ message: 'auth.google.callback.create_user', emailHash });
      const dummyHash = await bcrypt.hash(crypto.randomBytes(16).toString('hex'), 10);
      const [created] = await db
        .insert(authUsers)
        .values({ email, passwordHash: dummyHash })
        .returning();
      user = created;
      await ensureProfile(user.id, email, displayName);
    } else {
      log.info({ message: 'auth.google.callback.user_found', userId: user.id, emailHash });
      // Ensure profile exists for existing users (handles account linking)
      const existingProfile = await db.select().from(userProfiles).where(eq(userProfiles.id, user.id)).limit(1);
      if (existingProfile.length === 0) {
        log.info({ message: 'auth.google.callback.ensure_profile', userId: user.id });
        await ensureProfile(user.id, email, displayName);
      }
    }

    const accessToken = createAccessToken(user.id, email);
    const refreshToken = createRefreshToken(user.id, email);
    const refreshHash = hashToken(refreshToken);
    await db.update(authUsers).set({ refreshTokenHash: refreshHash }).where(eq(authUsers.id, user.id));

    // Instead of setting cookies and redirecting, redirect with a temporary token
    // that the frontend can exchange for session cookies
    const tempToken = jwt.sign(
      { userId: user.id, email: user.email },
      config.sessionSecret,
      { expiresIn: '5m' }
    );
    
    log.info({ message: 'auth.google.callback.success', userId: user.id });
    return res.redirect(`${config.frontendUrl}?oauth_token=${tempToken}`);
  } catch (err) {
    log.error({ message: 'auth.google.callback.error', err });
    return res.redirect(`${config.frontendUrl}?error=google_auth_failed`);
  }
});
