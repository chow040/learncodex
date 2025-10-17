import fs from 'node:fs';
import path from 'node:path';

import { env } from '../../config/env.js';

export type CacheEventType = 'earnings' | 'filings';

export interface CachePolicyEntry {
  ttlSeconds: number;
  refreshOnEvents?: CacheEventType[];
}

export type CacheDataType =
  | 'statements'
  | 'profile'
  | 'metrics'
  | 'dividends'
  | 'splits'
  | 'news';

const DEFAULT_POLICY: Record<CacheDataType, CachePolicyEntry> = {
  statements: {
    ttlSeconds: 90 * 24 * 60 * 60, // 90 days
    refreshOnEvents: ['earnings', 'filings'],
  },
  profile: {
    ttlSeconds: 7 * 24 * 60 * 60, // 7 days
  },
  metrics: {
    ttlSeconds: 7 * 24 * 60 * 60, // 7 days
  },
  dividends: {
    ttlSeconds: 7 * 24 * 60 * 60, // 7 days
  },
  splits: {
    ttlSeconds: 7 * 24 * 60 * 60, // 7 days
  },
  news: {
    ttlSeconds: 30 * 60, // 30 minutes
  },
};

const isCacheEventType = (value: unknown): value is CacheEventType =>
  value === 'earnings' || value === 'filings';

const isCacheDataType = (value: unknown): value is CacheDataType =>
  typeof value === 'string' && Object.prototype.hasOwnProperty.call(DEFAULT_POLICY, value);

let cachedPolicy: Record<CacheDataType, CachePolicyEntry> | null = null;

const loadPolicy = (): Record<CacheDataType, CachePolicyEntry> => {
  if (cachedPolicy) return cachedPolicy;

  const policy = JSON.parse(
    JSON.stringify(DEFAULT_POLICY),
  ) as Record<CacheDataType, CachePolicyEntry>;

  const policyPath = env.cachePolicyPath;
  if (policyPath) {
    try {
      const resolved = path.resolve(policyPath);
      if (fs.existsSync(resolved)) {
        const raw = fs.readFileSync(resolved, 'utf8');
        if (raw.trim().length > 0) {
          const parsed = JSON.parse(raw) as Record<string, unknown>;
          for (const [key, value] of Object.entries(parsed)) {
            if (!isCacheDataType(key) || typeof value !== 'object' || value === null) continue;
            const ttlSeconds = Number((value as { ttlSeconds?: unknown }).ttlSeconds);
            if (!Number.isFinite(ttlSeconds) || ttlSeconds <= 0) continue;
            const refreshCandidates = (value as { refreshOnEvents?: unknown }).refreshOnEvents;
            const refreshOnEvents = Array.isArray(refreshCandidates)
              ? refreshCandidates.filter(isCacheEventType)
              : undefined;
            policy[key] = {
              ttlSeconds: Math.floor(ttlSeconds),
              ...(refreshOnEvents && refreshOnEvents.length > 0 ? { refreshOnEvents } : {}),
            };
          }
        }
      } else {
        console.warn(`[cachePolicy] No policy file found at ${resolved}; using defaults.`);
      }
    } catch (error) {
      console.warn(
        `[cachePolicy] Failed to load overrides from ${policyPath}: ${(error as Error).message}`,
      );
    }
  }

  cachedPolicy = policy;
  return policy;
};

export const getCachePolicy = (type: CacheDataType): CachePolicyEntry => loadPolicy()[type];
