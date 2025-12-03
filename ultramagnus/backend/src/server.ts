import { createApp } from './app.js';
import { config } from './config/env.js';
import { logger } from './utils/logger.js';

const app = createApp();
const server = app.listen(config.port, () => {
  logger.info({ message: 'server.listening', port: config.port });
});

const handleFatalError = (err: unknown, context: string) => {
  logger.error({ message: context, err });
};

process.on('unhandledRejection', (reason) => {
  handleFatalError(reason, 'process.unhandled_rejection');
});

process.on('uncaughtException', (err) => {
  handleFatalError(err, 'process.uncaught_exception');
  server.close(() => {
    process.exit(1);
  });
});
