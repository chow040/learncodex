import { describe, expect, it } from 'vitest';

import { canonicalJson, fingerprint } from '../fingerprint.js';

describe('fingerprint utilities', () => {
  it('produces stable canonical JSON regardless of key order', () => {
    const a = { b: 2, a: 1, nested: { z: 3, y: 4 } };
    const b = { nested: { y: 4, z: 3 }, a: 1, b: 2 };

    expect(canonicalJson(a)).toEqual(canonicalJson(b));
    expect(fingerprint(a)).toEqual(fingerprint(b));
  });

  it('normalizes floating point precision before hashing', () => {
    const value = { amount: 1.123456789, list: [0.3333333333] };
    const fingerprintA = fingerprint(value);
    const fingerprintB = fingerprint({ amount: 1.1234567894, list: [0.33333333334] });

    expect(fingerprintA).toEqual(fingerprintB);
  });
});
