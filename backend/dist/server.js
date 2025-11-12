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
import authRouter from './routes/auth.js';
export const app = express();
app.use(cors({
    origin: process.env.FRONTEND_URL || 'http://localhost:5173',
    credentials: true,
}));
app.use(express.json());
app.use(cookieParser());
app.get('/health', (_req, res) => {
    res.json({ status: 'ok', uptime: process.uptime() });
});
app.use('/api/auth', authRouter);
app.use('/api/assessment', assessmentRouter);
app.use('/api/finance', financeRouter);
app.use('/api/trading', tradingRouter);
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