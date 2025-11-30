import { createLogger, format, transports } from 'winston';
import { config } from '../config/env.ts';
const { combine, timestamp, errors, json, splat } = format;
export const logger = createLogger({
    level: config.logLevel,
    defaultMeta: {
        service: config.serviceName,
        environment: config.nodeEnv
    },
    transports: [
        new transports.Console({ stderrLevels: ['error'] })
    ],
    format: combine(timestamp(), errors({ stack: true }), splat(), json())
});
