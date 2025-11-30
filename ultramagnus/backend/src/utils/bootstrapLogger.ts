type BootstrapLevel = 'debug' | 'info' | 'warn' | 'error';

export const bootstrapLog = (level: BootstrapLevel, message: string, meta: Record<string, unknown> = {}) => {
  const payload = {
    timestamp: new Date().toISOString(),
    level,
    service: process.env.SERVICE_NAME || 'backend-bff',
    message,
    ...meta
  };

  const stream = level === 'error' ? process.stderr : process.stdout;
  stream.write(`${JSON.stringify(payload)}\n`);
};
