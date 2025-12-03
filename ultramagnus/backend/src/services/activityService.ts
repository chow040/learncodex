import { db } from '../db/client.js';
import { activities } from '../db/schema.js';
import { desc, eq } from 'drizzle-orm';
import type { ActivityEvent } from '../types/dashboard.js';

export const listActivityByUser = async (userId: string, limit = 50): Promise<ActivityEvent[]> => {
  const maxLimit = Math.max(1, Math.min(limit, 200));
  const rows = await db.select()
    .from(activities)
    .where(eq(activities.userId, userId))
    .orderBy(desc(activities.occurredAt))
    .limit(maxLimit);

  type Row = typeof rows[number];
  return rows.map((row: Row) => ({
    id: row.id,
    userId: row.userId,
    targetId: row.targetId,
    targetType: row.targetType,
    verb: row.verb as ActivityEvent['verb'],
    occurredAt: row.occurredAt?.toISOString() || new Date().toISOString()
  }));
};
