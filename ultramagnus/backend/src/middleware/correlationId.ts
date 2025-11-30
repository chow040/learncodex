import type { NextFunction, Request, Response } from 'express';
import { v4 as uuid } from 'uuid';

const CORRELATION_HEADER = 'x-request-id';

export const correlationIdMiddleware = (req: Request, res: Response, next: NextFunction) => {
  const incomingId = req.header(CORRELATION_HEADER);
  const correlationId = incomingId && incomingId.trim().length ? incomingId : uuid();

  req.correlationId = correlationId;
  res.setHeader('X-Request-ID', correlationId);

  next();
};
