import type { AxiosInstance, AxiosRequestConfig, AxiosResponse } from 'axios';

import { fetchHttpCache, upsertHttpCache } from '../../db/cacheRepository.js';
import { fingerprint } from './fingerprint.js';
import { recordHttpCacheEvent } from './telemetry.js';

export interface HttpCacheKeyParts {
  vendor: string;
  dataType: string;
  symbol: string;
  qualifier?: string;
}

export const buildHttpCacheKey = (parts: HttpCacheKeyParts): string => {
  const base = `http:${parts.vendor}:${parts.dataType}:${parts.symbol}`;
  return parts.qualifier ? `${base}:${parts.qualifier}` : base;
};

export interface CachedAxiosRequestOptions<T> {
  axios: AxiosInstance;
  requestConfig: AxiosRequestConfig;
  cacheKey: string;
  schemaVersion: string;
  ttlSeconds: number;
  asOfExtractor?: (data: T) => string | null | undefined;
  fingerprintSalt?: string;
  dataType?: string;
}

export interface CachedFetchMeta {
  source: 'cache_ttl' | 'cache_304' | 'network';
  etag: string | null;
  lastModified: string | null;
  expiresAt: Date;
  fetchedAt: Date;
  schemaVersion: string;
  fingerprint: string;
  asOf: string | null;
}

export interface CachedFetchResult<T> {
  data: T;
  meta: CachedFetchMeta;
}

const parseHeaderDate = (value: unknown): Date | null => {
  if (!value || typeof value !== 'string') return null;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
};

const toHttpDate = (value: Date | null): string | null => {
  if (!value) return null;
  return value.toUTCString();
};

export const fetchWithHttpCache = async <T = unknown>(
  options: CachedAxiosRequestOptions<T>,
): Promise<CachedFetchResult<T>> => {
  const {
    axios,
    requestConfig,
    cacheKey,
    ttlSeconds,
    schemaVersion,
    asOfExtractor,
    fingerprintSalt,
    dataType,
  } = options;
  const now = new Date();
  const cached = await fetchHttpCache<T>(cacheKey);
  if (cached && cached.schemaVersion === schemaVersion && cached.expiresAt > now) {
    const meta: CachedFetchMeta = {
      source: 'cache_ttl',
      etag: cached.etag,
      lastModified: cached.lastModified ? cached.lastModified.toUTCString() : null,
      expiresAt: cached.expiresAt,
      fetchedAt: cached.fetchedAt,
      schemaVersion: cached.schemaVersion,
      fingerprint: cached.dataFingerprint,
      asOf: cached.asOf ?? null,
    };
    recordHttpCacheEvent('hit', {
      key: cacheKey,
      ...(dataType ? { dataType } : {}),
      source: 'cache_ttl',
      meta: { schemaVersion },
    });
    return { data: cached.data, meta };
  }

  const headers: Record<string, string> = {};
  if (cached?.etag) headers['If-None-Match'] = cached.etag;
  const cachedLastModifiedHeader = cached?.lastModified ? toHttpDate(cached.lastModified) : null;
  if (cachedLastModifiedHeader) headers['If-Modified-Since'] = cachedLastModifiedHeader;

  const config: AxiosRequestConfig = {
    ...requestConfig,
    headers: {
      ...(requestConfig.headers ?? {}),
      ...headers,
    },
    validateStatus: (status) => {
      if (requestConfig.validateStatus) {
        return requestConfig.validateStatus(status);
      }
      return (status >= 200 && status < 300) || status === 304;
    },
  };

  recordHttpCacheEvent('miss', {
    key: cacheKey,
    ...(dataType ? { dataType } : {}),
    source: 'network',
    meta: {
      hadCache: Boolean(cached),
      schemaVersion,
    },
  });

  const response: AxiosResponse<T> = await axios.request<T>(config);

  if (response.status === 304 && cached) {
    const expiresAt = new Date(now.getTime() + ttlSeconds * 1000);
    const nextFingerprint = fingerprint(cached.data ?? null, fingerprintSalt ?? schemaVersion);
    await upsertHttpCache<T>({
      key: cacheKey,
      data: cached.data,
      dataFingerprint: nextFingerprint,
      etag: cached.etag,
      lastModified: cached.lastModified,
      asOf: cached.asOf,
      fetchedAt: cached.fetchedAt,
      expiresAt,
      schemaVersion,
    });
    const meta: CachedFetchMeta = {
      source: 'cache_304',
      etag: cached.etag,
      lastModified: cached.lastModified ? cached.lastModified.toUTCString() : null,
      expiresAt,
      fetchedAt: cached.fetchedAt,
      schemaVersion,
      fingerprint: nextFingerprint,
      asOf: cached.asOf ?? null,
    };
    recordHttpCacheEvent('hit', {
      key: cacheKey,
      ...(dataType ? { dataType } : {}),
      source: 'cache_304',
      meta: { schemaVersion },
    });
    return { data: cached.data, meta };
  }

  if (response.status < 200 || response.status >= 300) {
    recordHttpCacheEvent('error', {
      key: cacheKey,
      ...(dataType ? { dataType } : {}),
      source: 'network',
      meta: { status: response.status },
    });
    throw new Error(`Unexpected status ${response.status} for ${cacheKey}`);
  }

  const data = response.data;
  const etag = typeof response.headers?.etag === 'string' ? response.headers.etag : null;
  const lastModified = parseHeaderDate(response.headers?.['last-modified']);
  const asOf = asOfExtractor ? asOfExtractor(data) ?? null : null;
  const dataFingerprint = fingerprint(data ?? null, fingerprintSalt ?? schemaVersion);
  const expiresAt = new Date(now.getTime() + ttlSeconds * 1000);

  await upsertHttpCache({
    key: cacheKey,
    data,
    dataFingerprint,
    etag,
    lastModified,
    asOf,
    fetchedAt: now,
    expiresAt,
    schemaVersion,
  });

  const meta: CachedFetchMeta = {
    source: 'network',
    etag,
    lastModified: lastModified ? lastModified.toUTCString() : null,
    expiresAt,
    fetchedAt: now,
    schemaVersion,
    fingerprint: dataFingerprint,
    asOf,
  };

  recordHttpCacheEvent('store', {
    key: cacheKey,
    ...(dataType ? { dataType } : {}),
    source: 'network',
    meta: { schemaVersion },
  });

  return { data, meta };
};
