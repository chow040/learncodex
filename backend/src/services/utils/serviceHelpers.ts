import axios, { isAxiosError } from 'axios';

export class ServiceError extends Error {
  public readonly service: string;
  public readonly operation: string;
  public readonly cause: unknown;

  constructor(service: string, operation: string, message: string, cause?: unknown) {
    super(`[${service}] ${operation} failed: ${message}`);
    this.name = 'ServiceError';
    this.service = service;
    this.operation = operation;
    this.cause = cause;
  }
}

const extractMessage = (error: unknown): string => {
  if (isAxiosError(error)) {
    const status = error.response?.status;
    const statusText = error.response?.statusText;
    const data = error.response?.data;
    const details = typeof data === 'string'
      ? data
      : data && typeof data === 'object'
        ? JSON.stringify(data)
        : undefined;
    const parts = [
      status ? `status ${status}` : null,
      statusText ?? null,
      details ?? null,
    ].filter(Boolean);
    return parts.length ? parts.join(' - ') : error.message;
  }
  if (error instanceof Error) {
    return error.message;
  }
  return typeof error === 'string' ? error : 'Unknown error';
};

export const withServiceError = async <T>(
  service: string,
  operation: string,
  fn: () => Promise<T>,
): Promise<T> => {
  try {
    return await fn();
  } catch (error) {
    throw new ServiceError(service, operation, extractMessage(error), error);
  }
};

/**
 * Convenience helper to ensure a return value is always an array.
 */
export const toArray = <T>(value: unknown): T[] => {
  if (Array.isArray(value)) return value as T[];
  return [];
};

/**
 * Re-export isAxiosError for consumers that need finer-grained handling.
 */
export const isServiceAxiosError = isAxiosError;

export const axiosInstance = axios;
