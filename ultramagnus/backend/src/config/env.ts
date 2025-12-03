import dotenv from 'dotenv';
import { bootstrapLog } from '../utils/bootstrapLogger.js';

dotenv.config();

const nodeEnv = process.env.NODE_ENV || 'development';
const defaultLogLevel = process.env.LOG_LEVEL || (nodeEnv === 'production' ? 'info' : 'debug');

const required = ['SESSION_SECRET', 'DATABASE_URL'];
const missing = required.filter((key) => !process.env[key]);
if (missing.length) {
  bootstrapLog('warn', 'env.missing_variables', { keys: missing });
}

export const config = {
  port: parseInt(process.env.PORT || '4000', 10),
  sessionSecret: process.env.SESSION_SECRET || 'change-me',
  allowedOrigins: (process.env.ALLOWED_ORIGINS || 'http://localhost:5173,http://localhost:3000,http://localhost:3001')
    .split(',')
    .map(o => o.trim())
    .filter(Boolean),
  databaseUrl: process.env.DATABASE_URL || '',
  googleClientId: process.env.GOOGLE_CLIENT_ID || '',
  googleClientSecret: process.env.GOOGLE_CLIENT_SECRET || '',
  googleRedirectUri: process.env.GOOGLE_REDIRECT_URI || '',
  frontendUrl: process.env.FRONTEND_URL || 'http://localhost:3000',
  resendApiKey: process.env.RESEND_API_KEY || '',
  mailFrom: process.env.MAIL_FROM || 'no-reply@example.com',
  nodeEnv,
  logLevel: defaultLogLevel,
  serviceName: process.env.SERVICE_NAME || 'backend-bff'
};
