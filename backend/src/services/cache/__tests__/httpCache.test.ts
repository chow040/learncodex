import type { AxiosInstance } from 'axios';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../../db/cacheRepository.js', () => ({
  fetchHttpCache: vi.fn(),
  upsertHttpCache: vi.fn(),
}));

vi.mock('../telemetry.js', () => ({
  recordHttpCacheEvent: vi.fn(),
}));

type MockFn = ReturnType<typeof vi.fn>;

let fetchHttpCacheMock: MockFn;
let upsertHttpCacheMock: MockFn;
let recordHttpCacheEventMock: MockFn;
let fetchWithHttpCache: typeof import('../httpCache.js')['fetchWithHttpCache'];

const sampleCacheEntry = () => ({
  key: 'http:vendor:type:SYM',
  data: { foo: 'bar' },
  dataFingerprint: 'fp1',
  etag: 'etag',
  lastModified: new Date(),
  asOf: null,
  fetchedAt: new Date(Date.now() - 1_000),
  expiresAt: new Date(Date.now() + 60_000),
  schemaVersion: 'v1',
});

beforeEach(async () => {
  vi.clearAllMocks();
  fetchHttpCacheMock = (await import('../../../db/cacheRepository.js')).fetchHttpCache as unknown as MockFn;
  upsertHttpCacheMock = (await import('../../../db/cacheRepository.js')).upsertHttpCache as unknown as MockFn;
  recordHttpCacheEventMock = (await import('../telemetry.js')).recordHttpCacheEvent as unknown as MockFn;
  fetchWithHttpCache = (await import('../httpCache.js')).fetchWithHttpCache;
});

describe('fetchWithHttpCache', () => {
  it('returns cached data when TTL still valid', async () => {
    fetchHttpCacheMock.mockResolvedValue(sampleCacheEntry());
    const axiosStub = { request: vi.fn() } as unknown as AxiosInstance;

    const result = await fetchWithHttpCache({
      axios: axiosStub,
      requestConfig: { url: '/company', method: 'GET' },
      cacheKey: 'http:vendor:type:SYM',
      schemaVersion: 'v1',
      ttlSeconds: 60,
      dataType: 'profile',
    });

    expect(result.meta.source).toBe('cache_ttl');
    expect(axiosStub.request).not.toHaveBeenCalled();
    expect(recordHttpCacheEventMock).toHaveBeenCalledWith(
      'hit',
      expect.objectContaining({ source: 'cache_ttl' }),
    );
  });

  it('refreshes cache on 304 responses', async () => {
    const entry = sampleCacheEntry();
    entry.expiresAt = new Date(Date.now() - 1_000);
    fetchHttpCacheMock.mockResolvedValue(entry);

    const axiosStub = {
      request: vi.fn().mockResolvedValue({
        status: 304,
        headers: {},
        data: null,
      }),
    } as unknown as AxiosInstance;

    const result = await fetchWithHttpCache({
      axios: axiosStub,
      requestConfig: { url: '/company', method: 'GET' },
      cacheKey: 'http:vendor:type:SYM',
      schemaVersion: 'v1',
      ttlSeconds: 60,
      dataType: 'profile',
    });

    expect(result.meta.source).toBe('cache_304');
    expect(upsertHttpCacheMock).toHaveBeenCalledTimes(1);
    expect(recordHttpCacheEventMock).toHaveBeenCalledWith(
      'hit',
      expect.objectContaining({ source: 'cache_304' }),
    );
  });

  it('stores fresh data when cache missing', async () => {
    fetchHttpCacheMock.mockResolvedValue(null);

    const axiosStub = {
      request: vi.fn().mockResolvedValue({
        status: 200,
        headers: {},
        data: { foo: 'bar' },
      }),
    } as unknown as AxiosInstance;

    const result = await fetchWithHttpCache({
      axios: axiosStub,
      requestConfig: { url: '/company', method: 'GET' },
      cacheKey: 'http:vendor:type:SYM',
      schemaVersion: 'v1',
      ttlSeconds: 60,
      dataType: 'profile',
    });

    expect(result.meta.source).toBe('network');
    expect(upsertHttpCacheMock).toHaveBeenCalledWith(
      expect.objectContaining({
        key: 'http:vendor:type:SYM',
        data: { foo: 'bar' },
      }),
    );
    expect(recordHttpCacheEventMock).toHaveBeenCalledWith(
      'miss',
      expect.objectContaining({ source: 'network', meta: expect.objectContaining({ hadCache: false }) }),
    );
    expect(recordHttpCacheEventMock).toHaveBeenCalledWith(
      'store',
      expect.objectContaining({ source: 'network' }),
    );
  });
});
