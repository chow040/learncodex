import jwt from 'jsonwebtoken';
import { config } from '../config/env.js';
import crypto from 'crypto';

const ACCESS_TTL = '1h';
const REFRESH_TTL = '7d';

export const createAccessToken = (userId: string, email: string) => {
  return jwt.sign({ sub: userId, email, type: 'access' }, config.sessionSecret, { expiresIn: ACCESS_TTL });
};

export const createRefreshToken = (userId: string, email: string) => {
  return jwt.sign({ sub: userId, email, type: 'refresh' }, config.sessionSecret, { expiresIn: REFRESH_TTL });
};

export const verifyToken = (token: string) => {
  return jwt.verify(token, config.sessionSecret) as { sub: string; email: string; type?: string };
};

export const hashToken = (token: string) => {
  return crypto.createHash('sha256').update(token).digest('hex');
};

export const cookieOpts = {
  httpOnly: true,
  sameSite: 'lax' as const,
  secure: false,
  path: '/'
};
