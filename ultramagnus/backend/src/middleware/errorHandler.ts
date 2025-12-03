import type { NextFunction, Request, Response } from 'express';
import { logger } from '../utils/logger.js';

const isClientError = (status?: number) => !!status && status >= 400 && status < 500;

export const errorHandler = (err: any, req: Request, res: Response, _next: NextFunction) => {
  const status = err.status || err.statusCode || 500;
  const log = req.log || logger;

  log.error({
    message: err.message || 'Unhandled error',
    statusCode: status,
    path: req.originalUrl,
    correlationId: req.correlationId,
    userId: req.userId || null,
    stack: err.stack
  });

  const payload = {
    error: isClientError(status) ? err.message || 'Request failed' : 'Internal Server Error',
    correlationId: req.correlationId
  };

  res.status(status).json(payload);
};
