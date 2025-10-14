import type { ToolLogger } from './types.js';

export const withToolLogging = async <T>(
  name: string,
  input: unknown,
  logger: ToolLogger | undefined,
  fn: () => Promise<T>,
): Promise<T> => {
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
  } catch (error) {
    if (hasLogger) {
      logger.record({
        name,
        input,
        error: (error as Error)?.message ?? String(error),
        startedAt,
        finishedAt: new Date(),
        durationMs: Date.now() - startedAt.getTime(),
      });
    }
    throw error;
  }
};
