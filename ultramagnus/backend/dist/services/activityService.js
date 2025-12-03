import { db } from '../db/client.js';
import { activities } from '../db/schema.js';
import { desc, eq } from 'drizzle-orm';
export const listActivityByUser = async (userId, limit = 50) => {
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
        verb: row.verb,
        occurredAt: row.occurredAt?.toISOString() || new Date().toISOString()
    }));
};
