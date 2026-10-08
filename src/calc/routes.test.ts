import { describe, expect, it } from 'vitest';
import type { MarketData } from '../lib/types.ts';
import { DEFAULT_SETTINGS, calcRoutes, shortfall } from './routes.ts';

// Rates captured on 2026-10-08 (see fixtures/); expected values are hand-computed.
const md: MarketData = {
  bitopro: {
    fetchedAt: 0,
    sourceUpdatedAt: null,
    ask: 31.988,
    bid: 31.978,
    otcBuy: 32.118964,
    otcSell: 31.849092,
  },
  esun: { fetchedAt: 0, sourceUpdatedAt: null, bankBuy: 31.85, bankSell: 31.95 },
  binance: {
    fetchedAt: 0,
    sourceUpdatedAt: null,
    VND: { buy: 25986, sell: 26162 },
    CNY: { buy: 6.65, sell: 6.67 },
  },
  binanceFees: {
    fetchedAt: 0,
    sourceUpdatedAt: null,
    VND: { buy: 0.001, sell: 0.001 },
    CNY: { buy: 0, sell: 0 },
  },
  gola: {
    twdToVnd: 781,
    vndToTwd: 810,
    usdToVnd: 25960,
    vndToUsd: 26110,
    updatedAt: null,
    enteredAt: 0,
  },
};

const out = (rs: ReturnType<typeof calcRoutes>, id: string): number | null =>
  rs.find((r) => r.id === id)?.output ?? null;

describe('TWD → VND', () => {
  const rs = calcRoutes('TWD>VND', 30_000, md);

  it('USDT route: buy at BitoPro ask, sell at Binance SELL price, 0.1% fee', () => {
    expect(out(rs, 'usdt')).toBeCloseTo(24_511_539.95, 1);
  });

  it('USD route: bank SELL rate to buy USD, then GolaVisa USD→VND', () => {
    expect(out(rs, 'usd')).toBeCloseTo(24_375_586.85, 1);
  });

  it('direct route: GolaVisa TWD→VND', () => {
    expect(out(rs, 'direct')).toBe(23_430_000);
  });

  it('sorts best first', () => {
    expect(rs.map((r) => r.id)).toEqual(['usdt', 'usd', 'direct']);
  });
});

describe('VND → TWD', () => {
  const rs = calcRoutes('VND>TWD', 10_000_000, md);

  it('USDT route: Binance BUY price, 0.1% fee, then BitoPro bid', () => {
    expect(out(rs, 'usdt')).toBeCloseTo(12_293.5511, 3);
  });

  it('USD route: GolaVisa VND→USD (sell), then bank BUY rate', () => {
    expect(out(rs, 'usd')).toBeCloseTo(12_198.3914, 3);
  });

  it('direct route: VND divided by GolaVisa sell rate', () => {
    expect(out(rs, 'direct')).toBeCloseTo(12_345.679, 3);
    expect(rs[0]?.id).toBe('direct');
  });
});

describe('CNY ⇄ VND', () => {
  it('CNY → VND uses BUY for CNY (no fee) and SELL for VND (0.1%)', () => {
    expect(out(calcRoutes('CNY>VND', 7_000, md), 'usdt')).toBeCloseTo(27_511_408.42, 1);
  });

  it('VND → CNY uses BUY for VND (0.1%) and SELL for CNY (no fee)', () => {
    expect(out(calcRoutes('VND>CNY', 10_000_000, md), 'usdt')).toBeCloseTo(2_564.19995, 4);
  });
});

describe('settings', () => {
  it('OTC mode uses the one-click quotes', () => {
    const rs = calcRoutes('TWD>VND', 30_000, md, { ...DEFAULT_SETTINGS, bitoproMode: 'otc' });
    expect(out(rs, 'usdt')).toBeCloseTo(24_411_594.97, 1);
  });

  it('a BitoPro fee applies to the BitoPro leg only', () => {
    const rs = calcRoutes('TWD>VND', 30_000, md, { ...DEFAULT_SETTINGS, bitoproFee: 0.002 });
    expect(out(rs, 'usdt')).toBeCloseTo(24_462_516.87, 1);
    expect(out(rs, 'usd')).toBeCloseTo(24_375_586.85, 1);
  });

  it('falls back to 0.1% VND / 0 CNY fees when the fee data is missing', () => {
    const rest: MarketData = { ...md, binanceFees: undefined };
    expect(out(calcRoutes('TWD>VND', 30_000, rest), 'usdt')).toBeCloseTo(24_511_539.95, 1);
  });
});

describe('missing data', () => {
  it('marks routes unavailable instead of guessing, and lists them last', () => {
    const noGola: MarketData = { ...md, gola: undefined };
    const rs = calcRoutes('TWD>VND', 30_000, noGola);
    expect(rs.map((r) => r.id)).toEqual(['usdt', 'usd', 'direct']);
    expect(out(rs, 'usdt')).not.toBeNull();
    expect(rs[1]).toMatchObject({ output: null, missing: ['GolaVisa 匯率（請手動輸入）'] });
    expect(rs[2]?.output).toBeNull();
  });

  it('is unavailable with no market data at all', () => {
    for (const r of calcRoutes('CNY>VND', 1000, {})) expect(r.output).toBeNull();
  });
});

describe('legs and shortfall', () => {
  it('describes each leg with its source', () => {
    const r = calcRoutes('TWD>VND', 30_000, md).find((x) => x.id === 'usdt');
    expect(r?.legs.map((l) => l.source)).toEqual(['bitopro', 'binance']);
    expect(r?.legs[1]?.text).toContain('26,162');
    expect(r?.legs[1]?.text).toContain('0.1%');
  });

  it('shortfall is the gap to the best route', () => {
    expect(shortfall(98, 100)).toBeCloseTo(0.02);
    expect(shortfall(100, 100)).toBe(0);
  });
});
