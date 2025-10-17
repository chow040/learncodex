import { eq, lt } from 'drizzle-orm';

import { db } from './client.js';
import { assessmentCache, httpCache } from './schema.js';

export interface HttpCacheRecord<T = unknown> {
  key: string;
  data: T;
  dataFingerprint: string;
  etag: string | null;
  lastModified: Date | null;
  asOf: string | null;
  fetchedAt: Date;
  expiresAt: Date;
  schemaVersion: string;
}

export interface UpsertHttpCacheInput<T = unknown> {
  key: string;
  data: T;
  dataFingerprint: string;
  etag?: string | null;
  lastModified?: Date | null;
  asOf?: string | null;
  fetchedAt: Date;
  expiresAt: Date;
  schemaVersion: string;
}

export const fetchHttpCache = async <T = unknown>(key: string): Promise<HttpCacheRecord<T> | null> => {
  if (!db) return null;
  const rows = await db
    .select()
    .from(httpCache)
    .where(eq(httpCache.key, key))
    .limit(1);
  if (!rows.length) return null;
  const row = rows[0]!;
  return {
    key: row.key,
    data: row.dataJson as T,
    dataFingerprint: row.dataFingerprint,
    etag: row.etag ?? null,
    lastModified: row.lastModified ?? null,
    asOf: row.asOf ?? null,
    fetchedAt: row.fetchedAt,
    expiresAt: row.expiresAt,
    schemaVersion: row.schemaVersion,
  };
};

export const upsertHttpCache = async <T = unknown>(input: UpsertHttpCacheInput<T>): Promise<void> => {
  if (!db) return;
  await db
    .insert(httpCache)
    .values({
      key: input.key,
      dataJson: input.data as unknown,
      dataFingerprint: input.dataFingerprint,
      etag: input.etag ?? null,
      lastModified: input.lastModified ?? null,
      asOf: input.asOf ?? null,
      fetchedAt: input.fetchedAt,
      expiresAt: input.expiresAt,
      schemaVersion: input.schemaVersion,
    })
    .onConflictDoUpdate({
      target: httpCache.key,
      set: {
        dataJson: input.data as unknown,
        dataFingerprint: input.dataFingerprint,
        etag: input.etag ?? null,
        lastModified: input.lastModified ?? null,
        asOf: input.asOf ?? null,
        fetchedAt: input.fetchedAt,
        expiresAt: input.expiresAt,
        schemaVersion: input.schemaVersion,
      },
    });
};

export const deleteHttpCache = async (key: string): Promise<void> => {
  if (!db) return;
  await db.delete(httpCache).where(eq(httpCache.key, key));
};

export const pruneExpiredHttpCache = async (now: Date = new Date()): Promise<number> => {
  if (!db) return 0;
  const result = await db.delete(httpCache).where(lt(httpCache.expiresAt, now)).returning({ deleted: httpCache.key });
  return result.length;
};

export interface AssessmentCacheRecord<T = unknown> {
  key: string;
  inputFingerprint: string;
  result: T;
  expiresAt: Date;
  agentVersion: string;
}

export interface UpsertAssessmentCacheInput<T = unknown> {
  key: string;
  inputFingerprint: string;
  result: T;
  expiresAt: Date;
  agentVersion: string;
}

export const fetchAssessmentCache = async <T = unknown>(key: string): Promise<AssessmentCacheRecord<T> | null> => {
  if (!db) return null;
  const rows = await db
    .select()
    .from(assessmentCache)
    .where(eq(assessmentCache.key, key))
    .limit(1);
  if (!rows.length) return null;
  const row = rows[0]!;
  return {
    key: row.key,
    inputFingerprint: row.inputFingerprint,
    result: row.resultJson as T,
    expiresAt: row.expiresAt,
    agentVersion: row.agentVersion,
  };
};

export const upsertAssessmentCache = async <T = unknown>(input: UpsertAssessmentCacheInput<T>): Promise<void> => {
  if (!db) return;
  await db
    .insert(assessmentCache)
    .values({
      key: input.key,
      inputFingerprint: input.inputFingerprint,
      resultJson: input.result as unknown,
      expiresAt: input.expiresAt,
      agentVersion: input.agentVersion,
    })
    .onConflictDoUpdate({
      target: assessmentCache.key,
      set: {
        inputFingerprint: input.inputFingerprint,
        resultJson: input.result as unknown,
        expiresAt: input.expiresAt,
        agentVersion: input.agentVersion,
      },
    });
};

export const deleteAssessmentCache = async (key: string): Promise<void> => {
  if (!db) return;
  await db.delete(assessmentCache).where(eq(assessmentCache.key, key));
};

export const pruneExpiredAssessmentCache = async (now: Date = new Date()): Promise<number> => {
  if (!db) return 0;
  const result = await db
    .delete(assessmentCache)
    .where(lt(assessmentCache.expiresAt, now))
    .returning({ deleted: assessmentCache.key });
  return result.length;
};
