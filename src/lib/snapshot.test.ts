import { describe, expect, it } from 'vitest';
import { asSnapshot, mergeSnapshot, type FetchResult } from './snapshot.ts';
import type { BinanceFees, BinanceRates, BitoproRates, EsunRates, Snapshot } from './types.ts';

const esun = (n: number): EsunRates => ({
  fetchedAt: n,
  sourceUpdatedAt: n,
  bankBuy: 31.85,
  bankSell: 31.95,
});
const fees: BinanceFees = {
  fetchedAt: 1,
  sourceUpdatedAt: null,
  VND: { buy: 0.001, sell: 0.001 },
  CNY: { buy: 0, sell: 0 },
};
const bito: BitoproRates = {
  fetchedAt: 1,
  sourceUpdatedAt: null,
  ask: 32,
  bid: 31.9,
  otcBuy: null,
  otcSell: null,
};
const bin: BinanceRates = {
  fetchedAt: 1,
  sourceUpdatedAt: null,
  VND: { buy: 25986, sell: 26162 },
  CNY: { buy: 6.65, sell: 6.67 },
};
const ok = <T>(value: T): FetchResult<T> => ({ ok: true, value });
const fail = <T>(): FetchResult<T> => ({ ok: false, error: 'boom' });

describe('mergeSnapshot', () => {
  it('takes fresh values when every source succeeds', () => {
    const s = mergeSnapshot(
      null,
      { esun: ok(esun(2)), binanceFees: ok(fees), bitopro: ok(bito), binance: ok(bin) },
      99,
    );
    expect(s).toEqual({
      generatedAt: 99,
      esun: esun(2),
      binanceFees: fees,
      bitopro: bito,
      binance: bin,
    });
  });

  it('keeps the previous value, flagged stale, when a source fails', () => {
    const prev: Snapshot = { generatedAt: 1, esun: esun(1), binanceFees: fees };
    const s = mergeSnapshot(
      prev,
      { esun: fail(), binanceFees: ok(fees), bitopro: fail(), binance: fail() },
      99,
    );
    expect(s.esun).toEqual({ ...esun(1), stale: true });
    expect(s.binanceFees).toEqual(fees);
  });

  it('omits a failed source that has no previous value', () => {
    const s = mergeSnapshot(
      null,
      { esun: fail(), binanceFees: ok(fees), bitopro: fail(), binance: fail() },
      5,
    );
    expect(s.esun).toBeUndefined();
    expect(s.bitopro).toBeUndefined();
  });

  it('a recovered source drops the stale flag', () => {
    const prev: Snapshot = { generatedAt: 1, esun: { ...esun(1), stale: true } };
    const s = mergeSnapshot(
      prev,
      { esun: ok(esun(3)), binanceFees: fail(), bitopro: fail(), binance: fail() },
      9,
    );
    expect(s.esun).toEqual(esun(3));
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
