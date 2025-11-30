export const bootstrapLog = (level, message, meta = {}) => {
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
