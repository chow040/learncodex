import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const resetPolicyModule = async () => {
  vi.resetModules();
  return import('../policy.js');
};

describe('cache policy loader', () => {
  const originalEnv = process.env.CACHE_POLICY_PATH;
  let tempDir: string | null = null;

  beforeEach(() => {
    tempDir = null;
    delete process.env.CACHE_POLICY_PATH;
  });

  afterEach(() => {
    process.env.CACHE_POLICY_PATH = originalEnv;
    if (tempDir && fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it('returns default policy when no override configured', async () => {
    const { getCachePolicy } = await resetPolicyModule();
    expect(getCachePolicy('profile').ttlSeconds).toBe(7 * 24 * 60 * 60);
    expect(getCachePolicy('statements').refreshOnEvents).toEqual(['earnings', 'filings']);
  });

  it('applies overrides from JSON file', async () => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cache-policy-'));
    const policyPath = path.join(tempDir, 'policy.json');
    fs.writeFileSync(
      policyPath,
      JSON.stringify({
        profile: { ttlSeconds: 1234, refreshOnEvents: ['earnings'] },
        metrics: { ttlSeconds: 4321 },
      }),
      'utf8',
    );
    process.env.CACHE_POLICY_PATH = policyPath;

    const { getCachePolicy } = await resetPolicyModule();

    expect(getCachePolicy('profile')).toEqual({
      ttlSeconds: 1234,
      refreshOnEvents: ['earnings'],
    });
    expect(getCachePolicy('metrics').ttlSeconds).toBe(4321);
  });
});
