type CacheSource = 'network' | 'cache_ttl' | 'cache_304' | 'assessment_cache';

interface BaseCacheEvent {
  symbol?: string;
  dataType?: string;
  key: string;
  source: CacheSource;
  latencyMs?: number;
  savedTokens?: number;
  savedMs?: number;
  meta?: Record<string, unknown>;
}

export type HttpCacheEventType = 'hit' | 'miss' | 'store' | 'error';
export type AssessmentCacheEventType = 'hit' | 'miss' | 'store' | 'error';

interface CacheCounters {
  http: Record<HttpCacheEventType, number>;
  assessment: Record<AssessmentCacheEventType, number>;
}

const counters: CacheCounters = {
  http: { hit: 0, miss: 0, store: 0, error: 0 },
  assessment: { hit: 0, miss: 0, store: 0, error: 0 },
};

const verboseLogging = process.env.CACHE_TELEMETRY_VERBOSE === 'true';

const incrementCounter = (category: keyof CacheCounters, type: string) => {
  const bucket = counters[category] as Record<string, number>;
  bucket[type] = (bucket[type] ?? 0) + 1;
};

const logEvent = (category: 'http' | 'assessment', type: string, event: BaseCacheEvent) => {
  const payload = {
    category,
    type,
    ...event,
    timestamp: new Date().toISOString(),
  };
  console.info('[cacheTelemetry]', JSON.stringify(payload));
};

export const recordHttpCacheEvent = (
  type: HttpCacheEventType,
  event: BaseCacheEvent,
): void => {
  incrementCounter('http', type);
  if (verboseLogging || type === 'error') {
    logEvent('http', type, event);
  }
};

export const recordAssessmentCacheEvent = (
  type: AssessmentCacheEventType,
  event: BaseCacheEvent,
): void => {
  incrementCounter('assessment', type);
  if (verboseLogging || type === 'error') {
    logEvent('assessment', type, event);
  }
};

export const getCacheMetricsSnapshot = (): CacheCounters => ({
  http: { ...counters.http },
  assessment: { ...counters.assessment },
});

export const resetCacheMetrics = (): void => {
  counters.http = { hit: 0, miss: 0, store: 0, error: 0 };
  counters.assessment = { hit: 0, miss: 0, store: 0, error: 0 };
};
