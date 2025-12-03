import { db } from '../db/client.js';
import { reports } from '../db/schema.js';
import { and, count, desc, eq } from 'drizzle-orm';
import { clampPagination } from '../utils/validation.js';
import { DEFAULT_PAGE_SIZE } from '../config/limits.js';
export const listReportsByUser = async (userId, filters) => {
    const { page, pageSize } = clampPagination({
        page: filters.reportsPage,
        pageSize: filters.reportsPageSize || DEFAULT_PAGE_SIZE
    });
    const statusFilter = filters.reportsStatus?.trim();
    const typeFilter = filters.reportsType?.trim();
    const conditions = [eq(reports.ownerId, userId)];
    if (statusFilter) {
        conditions.push(eq(reports.status, statusFilter));
    }
    if (typeFilter) {
        conditions.push(eq(reports.type, typeFilter));
    }
    const rows = await db.select()
        .from(reports)
        .where(and(...conditions))
        .orderBy(desc(reports.updatedAt))
        .limit(pageSize)
        .offset((page - 1) * pageSize);
    return rows.map((row) => ({
        id: row.id,
        title: row.title,
        status: row.status,
        ownerId: row.ownerId,
        type: row.type,
        ticker: row.ticker,
        verdict: row?.payload?.verdict,
        rocketScore: row?.payload?.rocketScore,
        currentPrice: row?.payload?.currentPrice,
        priceChange: row?.payload?.priceChange,
        priceTarget: row?.payload?.priceTarget,
        createdAt: row.createdAt?.toISOString() || new Date().toISOString(),
        updatedAt: row.updatedAt?.toISOString() || new Date().toISOString()
    }));
};
export const listReportsPageByUser = async (userId, filters) => {
    const { page, pageSize } = clampPagination({
        page: filters.reportsPage,
        pageSize: filters.reportsPageSize || DEFAULT_PAGE_SIZE
    });
    const statusFilter = filters.reportsStatus?.trim();
    const typeFilter = filters.reportsType?.trim();
    const conditions = [eq(reports.ownerId, userId)];
    if (statusFilter) {
        conditions.push(eq(reports.status, statusFilter));
    }
    if (typeFilter) {
        conditions.push(eq(reports.type, typeFilter));
    }
    const [rows, totalRows] = await Promise.all([
        db.select()
            .from(reports)
            .where(and(...conditions))
            .orderBy(desc(reports.updatedAt))
            .limit(pageSize)
            .offset((page - 1) * pageSize),
        db.select({ value: count() }).from(reports).where(and(...conditions))
    ]);
    const items = rows.map((row) => ({
        id: row.id,
        title: row.title,
        status: row.status,
        ownerId: row.ownerId,
        type: row.type,
        ticker: row.ticker,
        verdict: row?.payload?.verdict,
        rocketScore: row?.payload?.rocketScore,
        currentPrice: row?.payload?.currentPrice,
        priceChange: row?.payload?.priceChange,
        priceTarget: row?.payload?.priceTarget,
        createdAt: row.createdAt?.toISOString() || new Date().toISOString(),
        updatedAt: row.updatedAt?.toISOString() || new Date().toISOString()
    }));
    const total = Number(totalRows?.[0]?.value || 0);
    return { items, page, pageSize, total };
};
export const createReport = async (ownerId, input) => {
    const [row] = await db.insert(reports).values({
        ownerId,
        title: input.title,
        ticker: input.ticker,
        status: input.status,
        type: input.type,
        payload: input.payload
    }).returning({ id: reports.id });
    return row?.id;
};
