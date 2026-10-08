import { describe, expect, it } from 'vitest';
import { freshness } from './freshness.ts';

describe('freshness', () => {
  it('live sources go stale quickly', () => {
    expect(freshness('bitopro', 30_000)).toBe('fresh');
    expect(freshness('binance', 3 * 60_000)).toBe('warn');
    expect(freshness('bitopro', 11 * 60_000)).toBe('stale');
  });

  it('GolaVisa tolerates about a working day', () => {
    expect(freshness('gola', 20 * 3_600_000)).toBe('fresh');
    expect(freshness('gola', 30 * 3_600_000)).toBe('warn');
    expect(freshness('gola', 4 * 24 * 3_600_000)).toBe('stale');
  });
});
