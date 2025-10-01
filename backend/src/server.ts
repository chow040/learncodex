import cors from 'cors';
import express, { type NextFunction, type Request, type Response } from 'express';
import { fileURLToPath } from 'node:url';

import { env } from './config/env.js';
import { assessmentRouter } from './routes/assessmentRoutes.js';
import { financeRouter } from './routes/financeRoutes.js';
import { socialRouter } from './routes/socialRoutes.js';

export const app = express();

app.use(cors());
app.use(express.json());

app.get('/health', (_req, res) => {
  res.json({ status: 'ok', uptime: process.uptime() });
});

app.use('/api/assessment', assessmentRouter);
app.use('/api/finance', financeRouter);
app.use('/api/social', socialRouter);

app.use((error: unknown, _req: Request, res: Response, _next: NextFunction) => {
  console.error(error);

  const message =
    error instanceof Error ? error.message : 'Unexpected server error occurred.';

  res.status(500).json({ error: message });
});

const isMainModule = process.argv[1] === fileURLToPath(import.meta.url);

if (isMainModule) {
  app.listen(env.port, () => {
    console.log(`API server running on http://localhost:${env.port}`);
  });
}
