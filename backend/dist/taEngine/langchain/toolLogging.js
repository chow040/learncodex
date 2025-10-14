export const withToolLogging = async (name, input, logger, fn) => {
    const hasLogger = typeof logger?.record === 'function';
    const startedAt = new Date();
    try {
        const output = await fn();
        if (hasLogger) {
            logger.record({
                name,
                input,
                output,
                startedAt,
                finishedAt: new Date(),
                durationMs: Date.now() - startedAt.getTime(),
            });
        }
        return output;
    }
    catch (error) {
        if (hasLogger) {
            logger.record({
                name,
                input,
                error: error?.message ?? String(error),
                startedAt,
                finishedAt: new Date(),
                durationMs: Date.now() - startedAt.getTime(),
            });
        }
        throw error;
    }
};
//# sourceMappingURL=toolLogging.js.map