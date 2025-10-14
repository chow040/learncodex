import { describe, expect, test, vi } from 'vitest';

import { withToolLogging } from '../toolLogging.js';

describe('withToolLogging', () => {
  test('records successful execution', async () => {
    const record = vi.fn();
    const logger = { record };
    const result = await withToolLogging('test_tool', { foo: 'bar' }, logger, async () => 'ok');

    expect(result).toBe('ok');
    expect(record).toHaveBeenCalledTimes(1);
    const call = record.mock.calls[0][0];
    expect(call.name).toBe('test_tool');
    expect(call.input).toEqual({ foo: 'bar' });
    expect(call.output).toBe('ok');
    expect(call.error).toBeUndefined();
    expect(call.startedAt).toBeInstanceOf(Date);
    expect(call.finishedAt).toBeInstanceOf(Date);
    expect(typeof call.durationMs).toBe('number');
  });

  test('records failure and rethrows', async () => {
    const record = vi.fn();
    const logger = { record };
    const error = new Error('failure');

    await expect(
      withToolLogging('test_tool', { foo: 'bar' }, logger, async () => {
        throw error;
      }),
    ).rejects.toThrow('failure');

    expect(record).toHaveBeenCalledTimes(1);
    const call = record.mock.calls[0][0];
    expect(call.name).toBe('test_tool');
    expect(call.error).toBe('failure');
    expect(call.output).toBeUndefined();
  });

  test('works when logger is undefined', async () => {
    const result = await withToolLogging('test_tool', {}, undefined, async () => 'fallback');
    expect(result).toBe('fallback');
  });
});
