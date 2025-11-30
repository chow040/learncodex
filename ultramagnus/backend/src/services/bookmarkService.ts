import { and, desc, eq, count, inArray } from 'drizzle-orm';
import { db } from '../db/client.ts';
import { bookmarks, reports } from '../db/schema.ts';
import type { Bookmark, DashboardError } from '../types/dashboard.ts';
import type { DashboardFilters } from '../types/dashboard.ts';
import { clampPagination } from '../utils/validation.ts';
import { DEFAULT_PAGE_SIZE } from '../config/limits.ts';

export const listBookmarksByUser = async (userId: string, filters: DashboardFilters): Promise<Bookmark[]> => {
  const { page, pageSize } = clampPagination({
    page: filters.bookmarksPage,
    pageSize: filters.bookmarksPageSize || DEFAULT_PAGE_SIZE
  });

  const rows = await db.select()
    .from(bookmarks)
    .where(eq(bookmarks.userId, userId))
    .orderBy(desc(bookmarks.updatedAt))
    .limit(pageSize)
    .offset((page - 1) * pageSize);

  return rows.map((row) => ({
    id: row.id,
    targetId: row.targetId,
    targetType: row.targetType,
    userId: row.userId,
    pinned: row.pinned || false,
    createdAt: row.createdAt?.toISOString() || new Date().toISOString(),
    updatedAt: row.updatedAt?.toISOString()
  }));
};

export const listBookmarksByUserWithResolution = async (
  userId: string,
  filters: DashboardFilters
): Promise<{ bookmarks: Bookmark[]; errors: DashboardError[] }> => {
  const { page, pageSize } = clampPagination({
    page: filters.bookmarksPage,
    pageSize: filters.bookmarksPageSize || DEFAULT_PAGE_SIZE
  });

  const rows = await db.select()
    .from(bookmarks)
    .where(eq(bookmarks.userId, userId))
    .orderBy(desc(bookmarks.updatedAt))
    .limit(pageSize)
    .offset((page - 1) * pageSize);

  const targetIds = rows.map((r) => r.targetId).filter(Boolean);
  const errors: DashboardError[] = [];
  let reportSummaries: Record<string, Bookmark['report']> = {};

  if (targetIds.length > 0) {
    const reportRows = await db
      .select()
      .from(reports)
      .where(and(inArray(reports.id, targetIds), eq(reports.ownerId, userId)));

    reportSummaries = reportRows.reduce<Record<string, Bookmark['report']>>((acc, row) => {
      acc[row.id] = {
        id: row.id,
        title: row.title,
        status: row.status as Bookmark['report']['status'],
        ownerId: row.ownerId,
        type: row.type,
        ticker: row.ticker,
        createdAt: row.createdAt?.toISOString() || new Date().toISOString(),
        updatedAt: row.updatedAt?.toISOString() || new Date().toISOString()
      };
      return acc;
    }, {});
  }

  const bookmarksWithResolution = rows.map((row) => {
    const resolved = reportSummaries[row.targetId];
    if (!resolved) {
      errors.push({
        section: 'bookmarks',
        message: `Bookmark target missing or unauthorized: ${row.targetId}`
      });
    }

    return {
      id: row.id,
      targetId: row.targetId,
      targetType: row.targetType,
      userId: row.userId,
      pinned: row.pinned || false,
      createdAt: row.createdAt?.toISOString() || new Date().toISOString(),
      updatedAt: row.updatedAt?.toISOString(),
      report: resolved
    } as Bookmark;
  });

  return { bookmarks: bookmarksWithResolution, errors };
};

export const addBookmark = async (userId: string, targetId: string, targetType = 'report', pinned = false) => {
  if (!targetId) {
    const err: any = new Error('targetId is required');
    err.status = 400;
    throw err;
  }

  if (targetType !== 'report') {
    const err: any = new Error('Unsupported targetType');
    err.status = 400;
    throw err;
  }

  const target = await db.select({ ownerId: reports.ownerId }).from(reports).where(eq(reports.id, targetId)).limit(1);
  if (!target[0]) {
    const err: any = new Error('Target report not found');
    err.status = 404;
    throw err;
  }
  if (target[0].ownerId !== userId) {
    const err: any = new Error('Forbidden');
    err.status = 403;
    throw err;
  }

  const existing = await db
    .select({ id: bookmarks.id })
    .from(bookmarks)
    .where(and(eq(bookmarks.userId, userId), eq(bookmarks.targetId, targetId)))
    .limit(1);
  if (existing[0]?.id) {
    return existing[0].id;
  }

  const [row] = await db
    .insert(bookmarks)
    .values({
      userId,
      targetId,
      targetType,
      pinned
    })
    .returning({ id: bookmarks.id });
  return row?.id;
};

export const removeBookmark = async (userId: string, bookmarkId: string) => {
  const deleted = await db
    .delete(bookmarks)
    .where(and(eq(bookmarks.userId, userId), eq(bookmarks.id, bookmarkId)))
    .returning({ id: bookmarks.id });

  if (!deleted[0]) {
    const err: any = new Error('Bookmark not found');
    err.status = 404;
    throw err;
  }
};

export const listBookmarksPageByUser = async (
  userId: string,
  filters: DashboardFilters
): Promise<{ items: Bookmark[]; page: number; pageSize: number; total: number; errors: DashboardError[] }> => {
  const { page, pageSize } = clampPagination({
    page: filters.bookmarksPage,
    pageSize: filters.bookmarksPageSize || DEFAULT_PAGE_SIZE
  });

  const { bookmarks: items, errors } = await listBookmarksByUserWithResolution(userId, { ...filters, bookmarksPage: page, bookmarksPageSize: pageSize });

  const totalRows = await db.select({ value: count() }).from(bookmarks).where(eq(bookmarks.userId, userId));
  const total = Number(totalRows?.[0]?.value || 0);

  return { items, page, pageSize, total, errors };
};
