import { describe, expect, it } from 'vitest';
import {
  MAX_ENTRIES,
  appendEntry,
  entryMarketData,
  golaForHistory,
  historySeries,
  medianBinance,
  parseHistory,
  taipeiDate,
  unitRates,
  type HistoryEntry,
} from './history.ts';

const H = 3_600_000;

const entry = (date: string, over: Partial<HistoryEntry> = {}): HistoryEntry => ({
  date,
  at: Date.parse(`${date}T01:00:00Z`),
  esun: { bankBuy: 31.85, bankSell: 31.95 },
  bitopro: { ask: 32, bid: 31.9, otcBuy: 32.1, otcSell: 31.8 },
  binance: { VND: { buy: 26_100, sell: 26_000 }, CNY: { buy: 6.65, sell: 6.67 } },
  gola: null,
  ...over,
});

const gola = { twdToVnd: 781, vndToTwd: 810, usdToVnd: 25_960, vndToUsd: 26_110, updatedAt: null };

describe('taipeiDate', () => {
  it('uses the Taipei calendar day', () => {
    expect(taipeiDate(Date.parse('2026-10-08T15:59:00Z'))).toBe('2026-10-08');
    expect(taipeiDate(Date.parse('2026-10-08T16:00:00Z'))).toBe('2026-10-09');
  });
});

describe('appendEntry', () => {
  it('starts a file, replaces the same day and keeps dates sorted', () => {
    let f = appendEntry(null, entry('2026-10-09'));
    f = appendEntry(f, entry('2026-10-08'));
    f = appendEntry(f, entry('2026-10-09', { esun: null }));
    expect(f.version).toBe(1);
    expect(f.entries.map((e) => e.date)).toEqual(['2026-10-08', '2026-10-09']);
    expect(f.entries[1]?.esun).toBeNull();
  });

  it('keeps only the newest MAX_ENTRIES days', () => {
    const start = Date.parse('2000-01-01T00:00:00Z');
    const entries = Array.from({ length: MAX_ENTRIES }, (_, i) =>
      entry(new Date(start + i * 24 * H).toISOString().slice(0, 10)),
    );
    const f = appendEntry({ version: 1, entries }, entry('2026-10-08'));
    expect(f.entries).toHaveLength(MAX_ENTRIES);
    expect(f.entries[0]?.date).toBe('2000-01-02');
    expect(f.entries.at(-1)?.date).toBe('2026-10-08');
  });
});

describe('parseHistory', () => {
  it('round-trips a valid file', () => {
    const f = appendEntry(null, entry('2026-10-08', { gola }));
    expect(parseHistory(JSON.parse(JSON.stringify(f)))).toEqual(f);
  });

  it('drops entries without a date and nulls implausible sources instead of keeping them', () => {
    const f = parseHistory({
      version: 1,
      entries: [
        { at: 1 },
        { ...entry('2026-10-08'), bitopro: { ask: 3200, bid: 31.9 }, binance: { VND: {} } },
      ],
    });
    expect(f.entries).toHaveLength(1);
    expect(f.entries[0]?.bitopro).toBeNull();
    expect(f.entries[0]?.binance).toBeNull();
    expect(f.entries[0]?.esun).toEqual({ bankBuy: 31.85, bankSell: 31.95 });
  });

  it('rejects an unknown format', () => {
    expect(() => parseHistory({ entries: [] })).toThrow();
    expect(() => parseHistory([])).toThrow();
  });
});

describe('golaForHistory', () => {
  const at = Date.parse('2026-10-08T01:00:00Z');
  it('keeps published numbers younger than the stale threshold', () => {
    expect(golaForHistory({ ...gola, enteredAt: at - 71 * H }, at)).toEqual(gola);
  });
  it('drops stale or missing numbers', () => {
    expect(golaForHistory({ ...gola, enteredAt: at - 72 * H }, at)).toBeNull();
    expect(golaForHistory(null, at)).toBeNull();
  });
});

describe('unitRates', () => {
  const md = entryMarketData(entry('2026-10-08', { gola }));

  it('TWD→VND: VND received per 1 TWD', () => {
    const r = unitRates('TWD>VND', md);
    // 1 / 32 USDT, sold at 26,000 less 0.1%
    expect(r.get('usdt')?.rate).toBeCloseTo((26_000 / 32) * 0.999, 9);
    // 1 / 31.95 USD at 25,960
    expect(r.get('usd')?.rate).toBeCloseTo(25_960 / 31.95, 9);
    expect(r.get('direct')?.rate).toBe(781);
  });

  it('VND→TWD: VND paid per 1 TWD', () => {
    const r = unitRates('VND>TWD', md);
    // buy USDT at 26,100 (less 0.1%), sell at 31.9 TWD
    expect(r.get('usdt')?.rate).toBeCloseTo(26_100 / (0.999 * 31.9), 6);
    expect(r.get('usd')?.rate).toBeCloseTo(26_110 / 31.85, 6);
    expect(r.get('direct')?.rate).toBeCloseTo(810, 9);
  });

  it('missing inputs give null, not a number', () => {
    const r = unitRates('TWD>VND', entryMarketData(entry('2026-10-08', { bitopro: null })));
    expect(r.get('usdt')?.rate).toBeNull();
    expect(r.get('direct')?.rate).toBeNull();
  });
});

describe('historySeries', () => {
  it('lists only routes with data, in a fixed order, with gaps as null', () => {
    const { series, points } = historySeries(
      [entry('2026-10-07'), entry('2026-10-08', { gola, binance: null })],
      'TWD>VND',
    );
    expect(series.map((s) => s.id)).toEqual(['usdt', 'usd', 'direct']);
    expect(points[0]?.values.usd).toBeNull();
    expect(points[1]?.values.usdt).toBeNull();
    expect(points[1]?.values.direct).toBe(781);
  });

  it('is empty for no entries', () => {
    expect(historySeries([], 'CNY>VND')).toEqual({ series: [], points: [] });
  });
});

describe('medianBinance', () => {
  const s = (vndSell: number, cnyBuy = 6.65) => ({
    VND: { buy: 26_100, sell: vndSell },
    CNY: { buy: cnyBuy, sell: 6.67 },
  });

  it('drops a one-off spike (odd sample count)', () => {
    expect(medianBinance([s(26_200), s(26_789), s(26_190), s(26_210), s(26_198)])).toEqual(
      s(26_200),
    );
  });

  it('averages the middle two for an even count, per quote', () => {
    const m = medianBinance([s(26_000, 6.6), s(26_400, 6.7)]);
    expect(m?.VND.sell).toBe(26_200);
    expect(m?.CNY.buy).toBeCloseTo(6.65);
    expect(m?.VND.buy).toBe(26_100);
  });

  it('is null without samples', () => {
    expect(medianBinance([])).toBeNull();
  });
});
