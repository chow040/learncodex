import type { Logger } from 'winston';

declare global {
  namespace Express {
    interface Request {
      correlationId?: string;
      log?: Logger;
      userId?: string;
      email?: string;
    }
  }
}

export {};
