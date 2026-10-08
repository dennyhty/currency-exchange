import { describe, expect, it } from 'vitest';
import { asSnapshot, mergeSnapshot, type FetchResult } from './snapshot.ts';
import type { EsunRates, Snapshot } from './types.ts';

const esun = (n: number): EsunRates => ({
  fetchedAt: n,
  sourceUpdatedAt: n,
  bankBuy: 31.85,
  bankSell: 31.95,
});
const ok = <T>(value: T): FetchResult<T> => ({ ok: true, value });
const fail = <T>(): FetchResult<T> => ({ ok: false, error: 'boom' });

describe('mergeSnapshot', () => {
  it('takes the fresh value when E.SUN succeeds', () => {
    expect(mergeSnapshot(null, { esun: ok(esun(2)) }, 99)).toEqual({
      generatedAt: 99,
      esun: esun(2),
    });
  });

  it('keeps the previous value, flagged stale, when E.SUN fails', () => {
    const prev: Snapshot = { generatedAt: 1, esun: esun(1) };
    expect(mergeSnapshot(prev, { esun: fail() }, 99).esun).toEqual({ ...esun(1), stale: true });
  });

  it('omits E.SUN when it failed and there is no previous value', () => {
    expect(mergeSnapshot(null, { esun: fail() }, 5).esun).toBeUndefined();
  });

  it('a recovered E.SUN drops the stale flag', () => {
    const prev: Snapshot = { generatedAt: 1, esun: { ...esun(1), stale: true } };
    expect(mergeSnapshot(prev, { esun: ok(esun(3)) }, 9).esun).toEqual(esun(3));
  });
});

describe('asSnapshot', () => {
  it('accepts a snapshot and rejects junk', () => {
    expect(asSnapshot({ generatedAt: 1 })).toEqual({ generatedAt: 1 });
    expect(asSnapshot(null)).toBeNull();
    expect(asSnapshot({ nope: 1 })).toBeNull();
    expect(asSnapshot('x')).toBeNull();
  });
});
