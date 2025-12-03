import { Router } from 'express';
import { db } from '../db/client.js';
import { guestUsage, userProfiles } from '../db/schema.js';
import { eq } from 'drizzle-orm';
import crypto from 'crypto';
import { verifyToken } from '../utils/tokens.js';

const WINDOW_MS = Infinity; // lifetime window (no reset)
const LIMIT = 1;
const GUEST_COOKIE = 'guest_id';

export const limitsRouter = Router();

const ensureGuestCookie = (res: any, current?: string) => {
  if (current) return current;
  const id = crypto.randomUUID();
  res.cookie(GUEST_COOKIE, id, {
    httpOnly: true,
    sameSite: 'lax',
    secure: false,
    path: '/',
    maxAge: 365 * 24 * 60 * 60 * 1000
  });
  return id;
};

limitsRouter.post('/limits/search', async (req, res) => {
  try {
    const accessToken = req.cookies?.access_token;
    const guestId = ensureGuestCookie(res, req.cookies?.[GUEST_COOKIE]);

    let enforceGuestLimit = true;
    let id = guestId;

    if (accessToken) {
      try {
        const decoded = verifyToken(accessToken);
        if (decoded.type === 'access') {
          const userId = decoded.sub;
          const profiles = await db.select().from(userProfiles).where(eq(userProfiles.id, userId)).limit(1);
          const tier = profiles[0]?.tier || 'Guest';
          if (tier && tier.toLowerCase() !== 'guest') {
            enforceGuestLimit = false;
          } else {
            id = userId; // enforce using user id when guest tier
          }
        }
      } catch (err) {
        // ignore token errors and treat as guest
      }
    }

    if (!enforceGuestLimit) {
      return res.json({ ok: true, remaining: Infinity });
    }

    const now = new Date();
    const rows = await db.select().from(guestUsage).where(eq(guestUsage.id, id)).limit(1);

    if (rows.length === 0) {
      await db.insert(guestUsage).values({ id, count: 1, windowStart: now, lastSeen: now }).onConflictDoNothing();
      return res.json({ ok: true, remaining: LIMIT - 1 });
    }

    const usage = rows[0];
    let count = (usage.count || 0) + 1;
    const newWindowStart = usage.windowStart || now;

    if (count > LIMIT) {
      await db
        .update(guestUsage)
        .set({ count, lastSeen: now, windowStart: newWindowStart })
        .where(eq(guestUsage.id, id));
      return res.status(429).json({ error: 'guest_limit', remaining: 0 });
    }

    await db
      .update(guestUsage)
      .set({ count, lastSeen: now, windowStart: newWindowStart })
      .where(eq(guestUsage.id, id));

    return res.json({ ok: true, remaining: LIMIT - count });
  } catch (err: any) {
    return res.status(500).json({ error: 'limit_check_failed', detail: err?.message });
  }
});
