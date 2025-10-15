import { desc } from 'drizzle-orm';
import { env } from '../config/env.js';
import { db, closeDb } from './client.js';
import { assessmentLogs } from './schema.js';
if (!env.databaseUrl) {
    throw new Error('DATABASE_URL not set');
}
if (!db) {
    throw new Error('Database client not initialized');
}
try {
    const rows = await db
        .select({ id: assessmentLogs.id, symbol: assessmentLogs.symbol, created_at: assessmentLogs.createdAt })
        .from(assessmentLogs)
        .orderBy(desc(assessmentLogs.createdAt))
        .limit(5);
    console.table(rows);
}
finally {
    await closeDb();
}
//# sourceMappingURL=queryAssessmentLogs.js.map