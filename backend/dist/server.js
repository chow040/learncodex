import cors from 'cors';
import cookieParser from 'cookie-parser';
import express from 'express';
import { fileURLToPath } from 'node:url';
import { env } from './config/env.js';
import { assessmentRouter } from './routes/assessmentRoutes.js';
import { financeRouter } from './routes/financeRoutes.js';
import { socialRouter } from './routes/socialRoutes.js';
import { tradingRouter } from './routes/tradingRoutes.js';
import { autotradeRouter } from './routes/autotradeRoutes.js';
import { adminRouter } from './routes/adminRoutes.js';
import { tradingAgentsRouter } from './routes/tradingAgentsRoutes.js';
import authRouter from './routes/auth.js';
export const app = express();
// Allow both alphaflux.app and www.alphaflux.app
const allowedOrigins = [
    process.env.FRONTEND_URL || 'http://localhost:5173',
    'https://alphaflux.app',
    'https://www.alphaflux.app'
];
app.use(cors({
    origin: (origin, callback) => {
        // Allow requests with no origin (like mobile apps, Postman, curl)
        if (!origin)
            return callback(null, true);
        if (allowedOrigins.includes(origin)) {
            callback(null, true);
        }
        else {
            callback(new Error('Not allowed by CORS'));
        }
    },
    credentials: true,
    exposedHeaders: ['set-cookie'],
    allowedHeaders: ['Content-Type', 'Authorization', 'Cookie'],
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
}));
// Add security headers for cross-origin requests
app.use((req, res, next) => {
    res.setHeader('Cross-Origin-Opener-Policy', 'same-origin-allow-popups');
    res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
    next();
});
app.use(express.json());
app.use(cookieParser());
app.get('/health', (_req, res) => {
    res.json({ status: 'ok', uptime: process.uptime() });
});
app.use('/api/auth', authRouter);
app.use('/api/admin', adminRouter);
app.use('/api/assessment', assessmentRouter);
app.use('/api/finance', financeRouter);
app.use('/api/trading', tradingRouter);
app.use('/api/trading-agents', tradingAgentsRouter);
app.use('/api/autotrade', autotradeRouter);
app.use('/api/social', socialRouter);
app.use((error, _req, res, _next) => {
    console.error(error);
    const message = error instanceof Error ? error.message : 'Unexpected server error occurred.';
    res.status(500).json({ error: message });
});
const isMainModule = process.argv[1] === fileURLToPath(import.meta.url);
if (isMainModule) {
    const server = app.listen(env.port, () => {
        console.log(`API server running on http://localhost:${env.port}`);
    });
    // Loosen Node HTTP server timeouts to support long-running TA calls
    // headersTimeout: time allowed for receiving request headers
    // requestTimeout: overall timeout for an incoming request (0 = no timeout)
    // keepAliveTimeout: how long to keep idle connections
    server.headersTimeout = 600_000; // 10 minutes
    server.requestTimeout = 0; // 0 disables the timeout (allow long-running requests)
    server.keepAliveTimeout = 650_000; // slightly above headersTimeout
}
//# sourceMappingURL=server.js.map