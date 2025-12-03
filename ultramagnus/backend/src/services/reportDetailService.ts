import { eq } from 'drizzle-orm';
import { db } from '../db/client.js';
import { reports } from '../db/schema.js';
import type { ReportDetail } from '../types/dashboard.js';

export interface ReportLookupResult {
  status: 200 | 403 | 404;
  report: ReportDetail | null;
}

export const getReportById = async (userId: string, reportId: string): Promise<ReportLookupResult> => {
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
      status: row.status as ReportDetail['status'],
      ownerId: row.ownerId,
      type: row.type,
      createdAt: row.createdAt?.toISOString() || new Date().toISOString(),
      updatedAt: row.updatedAt?.toISOString() || new Date().toISOString(),
      payload: row.payload
    }
  };
};
