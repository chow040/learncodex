import { logger } from '../utils/logger.js';
const durationMs = (start) => {
    const [secs, nanos] = process.hrtime(start);
    return Math.round(((secs * 1e9 + nanos) / 1e6) * 100) / 100;
};
export const requestLogger = (req, res, next) => {
    const startTime = process.hrtime();
    const childLogger = logger.child({
        correlationId: req.correlationId,
        path: req.originalUrl,
        userId: req.userId || null
    });
    req.log = childLogger;
    childLogger.info({
        message: 'request.received',
        method: req.method,
        url: req.originalUrl,
        userAgent: req.get('user-agent') || 'unknown'
    });
    res.on('finish', () => {
        const activeLogger = req.log || childLogger;
        const level = res.statusCode >= 500 ? 'error' : res.statusCode >= 400 ? 'warn' : 'info';
        activeLogger.log({
            level,
            message: 'request.completed',
            method: req.method,
            url: req.originalUrl,
            statusCode: res.statusCode,
            durationMs: durationMs(startTime),
            contentLength: res.getHeader('content-length') || null,
            userId: req.userId || null
        });
    });
    next();
};
