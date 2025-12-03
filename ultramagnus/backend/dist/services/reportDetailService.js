import { eq } from 'drizzle-orm';
import { db } from '../db/client.js';
import { reports } from '../db/schema.js';
export const getReportById = async (userId, reportId) => {
    const rows = await db
        .select()
        .from(reports)
        .where(eq(reports.id, reportId))
        .limit(1);
    const row = rows[0];
    if (!row) {
        return { status: 404, report: null };
    }
    if (row.ownerId !== userId) {
        return { status: 403, report: null };
    }
    return {
        status: 200,
        report: {
            id: row.id,
            title: row.title,
            status: row.status,
            ownerId: row.ownerId,
            type: row.type,
            createdAt: row.createdAt?.toISOString() || new Date().toISOString(),
            updatedAt: row.updatedAt?.toISOString() || new Date().toISOString(),
            payload: row.payload
        }
    };
};
