import { db } from '../db/client.ts';
import { activities } from '../db/schema.ts';
import { desc, eq } from 'drizzle-orm';
import type { ActivityEvent } from '../types/dashboard.ts';

export const listActivityByUser = async (userId: string, limit = 50): Promise<ActivityEvent[]> => {
  const maxLimit = Math.max(1, Math.min(limit, 200));
  const rows = await db.select()
    .from(activities)
    .where(eq(activities.userId, userId))
    .orderBy(desc(activities.occurredAt))
    .limit(maxLimit);

  return rows.map((row) => ({
    id: row.id,
    userId: row.userId,
    targetId: row.targetId,
    targetType: row.targetType,
    verb: row.verb as ActivityEvent['verb'],
    occurredAt: row.occurredAt?.toISOString() || new Date().toISOString()
  }));
};
