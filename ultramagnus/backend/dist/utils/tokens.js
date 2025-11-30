import jwt from 'jsonwebtoken';
import { config } from '../config/env.ts';
import crypto from 'crypto';
const ACCESS_TTL = '15m';
const REFRESH_TTL = '7d';
export const createAccessToken = (userId, email) => {
    return jwt.sign({ sub: userId, email, type: 'access' }, config.sessionSecret, { expiresIn: ACCESS_TTL });
};
export const createRefreshToken = (userId, email) => {
    return jwt.sign({ sub: userId, email, type: 'refresh' }, config.sessionSecret, { expiresIn: REFRESH_TTL });
};
export const verifyToken = (token) => {
    return jwt.verify(token, config.sessionSecret);
};
export const hashToken = (token) => {
    return crypto.createHash('sha256').update(token).digest('hex');
};
export const cookieOpts = {
    httpOnly: true,
    sameSite: 'lax',
    secure: false,
    path: '/'
};
