import { createLogger, format, transports } from 'winston';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { config } from '../config/env.js';

const { combine, timestamp, errors, json, splat } = format;

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const logDir = path.resolve(__dirname, '..', '..', 'logs');

// Ensure log directory exists
if (!fs.existsSync(logDir)) {
  fs.mkdirSync(logDir, { recursive: true });
}

export const logger = createLogger({
  level: config.logLevel,
  defaultMeta: {
    service: config.serviceName,
    environment: config.nodeEnv
  },
  transports: [
    new transports.Console({ stderrLevels: ['error'] }),
    new transports.File({
      // Write logs to backend/logs
      filename: path.join(logDir, 'app.log'),
      level: 'info',
      maxsize: 5 * 1024 * 1024, // 5 MB
      maxFiles: 3
    })
  ],
  format: combine(
    timestamp(),
    errors({ stack: true }),
    splat(),
    json()
  )
});
