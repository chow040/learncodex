import { DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE, MAX_REPORT_PAYLOAD_BYTES } from '../config/limits.js';

export interface PaginationInput {
  page?: number;
  pageSize?: number;
}

export const clampPagination = ({ page, pageSize }: PaginationInput = {}) => {
  const safePage = Math.max(1, Number.isFinite(page as number) ? Number(page) : 1);
  const safePageSize = Math.max(
    1,
    Math.min(Number.isFinite(pageSize as number) ? Number(pageSize) : DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE)
  );
  return { page: safePage, pageSize: safePageSize };
};

export interface ReportSaveInput {
  title?: string;
  ticker?: string;
  status?: string;
  type?: string;
  payload?: unknown;
}

export interface ValidationResult<T> {
  ok: boolean;
  status?: number;
  message?: string;
  data?: T;
}

export interface ValidatedReportSave {
  title: string;
  ticker: string;
  status: string;
  type: string;
  payload: unknown;
}

export const validateReportSave = (body: ReportSaveInput): ValidationResult<ValidatedReportSave> => {
  const { title, ticker, status, type, payload } = body || {};
  if (!title || !ticker || !status || !type || !payload) {
    return { ok: false, status: 400, message: 'title, ticker, status, type, and payload are required' };
  }
  if ([title, ticker, status, type].some((field) => typeof field !== 'string')) {
    return { ok: false, status: 400, message: 'title, ticker, status, and type must be strings' };
  }

  let payloadSize = 0;
  try {
    payloadSize = Buffer.byteLength(JSON.stringify(payload), 'utf8');
  } catch (err: any) {
    return { ok: false, status: 400, message: 'payload must be serializable JSON' };
  }

  if (payloadSize > MAX_REPORT_PAYLOAD_BYTES) {
    return { ok: false, status: 413, message: `payload too large (>${Math.floor(MAX_REPORT_PAYLOAD_BYTES / 1024)}KB)` };
  }

  return {
    ok: true,
    data: {
      title,
      ticker,
      status,
      type,
      payload
    }
  };
};
