import type { Request, Response, NextFunction } from 'express';
import { verifyToken } from '../utils/tokens.js';

export interface AuthRequest extends Request {
  userId?: string;
  email?: string;
}

export const requireAuth = (req: AuthRequest, res: Response, next: NextFunction) => {
  const accessToken = req.cookies?.access_token;
  if (!accessToken) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  try {
    const decoded = verifyToken(accessToken);
    if (decoded.type !== 'access') throw new Error('Invalid token type');
    req.userId = decoded.sub;
    req.email = decoded.email;
    if (req.log && req.userId) {
      req.log = req.log.child({ userId: req.userId });
    }
    return next();
  } catch (err) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
};
