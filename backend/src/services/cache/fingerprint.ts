import { createHash } from 'crypto';

type JsonLike =
  | string
  | number
  | boolean
  | null
  | JsonLike[]
  | { [key: string]: JsonLike };

const normalizeValue = (value: unknown): JsonLike => {
  if (value === null || value === undefined) return null;
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) return null;
    return Math.round(value * 1e8) / 1e8;
  }
  if (typeof value === 'string') return value;
  if (typeof value === 'boolean') return value;
  if (value instanceof Date) return value.toISOString();
  if (Array.isArray(value)) return value.map((item) => normalizeValue(item));
  if (typeof value === 'object') {
    const entries = Object.keys(value as Record<string, unknown>)
      .sort()
      .map((key) => [key, normalizeValue((value as Record<string, unknown>)[key])] as const);
    return entries.reduce<Record<string, JsonLike>>((acc, [key, normalized]) => {
      acc[key] = normalized;
      return acc;
    }, {});
  }
  if (typeof value === 'bigint') return value.toString();
  return null;
};

export const canonicalJson = (value: unknown): string =>
  JSON.stringify(normalizeValue(value));

export const fingerprint = (value: unknown, salt = 'schema_v1'): string => {
  const normalized = canonicalJson(value);
  return createHash('sha256').update(`${salt}|${normalized}`).digest('hex').slice(0, 32);
};
