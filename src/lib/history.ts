import { DEFAULT_SETTINGS, DIRECTIONS, calcRoutes } from '../calc/routes.ts';
import { type FetchFn, RANGES, inRange, num, pick } from '../sources/util.ts';
import { THRESHOLDS } from './freshness.ts';
import type { Direction, FiatQuote, GolaRates, MarketData, Settings } from './types.ts';

/**
 * Daily record of every source's rates, kept on the `data` branch as history.json. Written once a
 * day by the scheduled job (scripts/record-history.ts); the site draws the trend from it.
 * Raw rates are stored (not route results) so the chart follows the user's current settings.
 */
export const HISTORY_URL =
  'https://raw.githubusercontent.com/dennyhty/currency-exchange/data/history.json';

/** Ten years of daily entries. */
export const MAX_ENTRIES = 3650;

export interface HistoryEntry {
  /** Taipei calendar day, YYYY-MM-DD. One entry per day; a re-run replaces it. */
  date: string;
  /** When the job recorded it (epoch ms). */
  at: number;
  esun: { bankBuy: number; bankSell: number } | null;
  bitopro: { ask: number; bid: number; otcBuy: number | null; otcSell: number | null } | null;
  binance: { VND: FiatQuote; CNY: FiatQuote } | null;
  /** Only when the published golavisa.json was fresh enough at `at`. */
  gola: Omit<GolaRates, 'enteredAt' | 'origin'> | null;
}

export interface HistoryFile {
  version: 1;
  entries: HistoryEntry[];
}

const taipeiDay = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Asia/Taipei',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

/** epoch ms → "2026-10-08" (Asia/Taipei). */
export function taipeiDate(ms: number): string {
  return taipeiDay.format(new Date(ms));
}

/** Published GolaVisa numbers count only while the site itself would not call them stale. */
export function golaForHistory(g: GolaRates | null | undefined, at: number): HistoryEntry['gola'] {
  if (!g || at - g.enteredAt >= THRESHOLDS.gola.stale) return null;
  const { twdToVnd, vndToTwd, usdToVnd, vndToUsd, updatedAt } = g;
  return { twdToVnd, vndToTwd, usdToVnd, vndToUsd, updatedAt };
}

/** Add or replace the entry for its day; keep entries sorted by date and capped. */
export function appendEntry(file: HistoryFile | null, entry: HistoryEntry): HistoryFile {
  const entries = (file?.entries ?? []).filter((e) => e.date !== entry.date);
  entries.push(entry);
  entries.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
  return { version: 1, entries: entries.slice(-MAX_ENTRIES) };
}

// ---------- parsing: every number is range-checked; a bad part becomes null, never a wrong rate ----------

function quote(v: unknown, range: readonly [number, number], what: string): FiatQuote {
  const [lo, hi] = range;
  return {
    buy: inRange(num(pick(v, 'buy'), what), lo, hi, what),
    sell: inRange(num(pick(v, 'sell'), what), lo, hi, what),
  };
}

function orNull<T>(read: () => T): T | null {
  try {
    return read();
  } catch {
    return null;
  }
}

function parseEntry(v: unknown): HistoryEntry | null {
  const date = pick(v, 'date');
  const at = pick(v, 'at');
  if (typeof date !== 'string' || !/^\d{4}-\d\d-\d\d$/.test(date)) return null;
  if (typeof at !== 'number' || !Number.isFinite(at)) return null;
  const [tl, th] = RANGES.usdtTwd;
  const optional = (x: unknown, what: string): number | null =>
    x === null || x === undefined ? null : inRange(num(x, what), tl, th, what);
  const esun = orNull(() => {
    const e = pick(v, 'esun');
    if (e === null) return null;
    const [lo, hi] = RANGES.usdTwd;
    return {
      bankBuy: inRange(num(pick(e, 'bankBuy'), 'esun'), lo, hi, 'esun'),
      bankSell: inRange(num(pick(e, 'bankSell'), 'esun'), lo, hi, 'esun'),
    };
  });
  const bitopro = orNull(() => {
    const b = pick(v, 'bitopro');
    if (b === null) return null;
    return {
      ask: inRange(num(pick(b, 'ask'), 'bitopro'), tl, th, 'bitopro'),
      bid: inRange(num(pick(b, 'bid'), 'bitopro'), tl, th, 'bitopro'),
      otcBuy: optional(pick(b, 'otcBuy'), 'bitopro otc'),
      otcSell: optional(pick(b, 'otcSell'), 'bitopro otc'),
    };
  });
  const binance = orNull(() => {
    const b = pick(v, 'binance');
    if (b === null) return null;
    return {
      VND: quote(pick(b, 'VND'), RANGES.usdtVnd, 'binance VND'),
      CNY: quote(pick(b, 'CNY'), RANGES.usdtCny, 'binance CNY'),
    };
  });
  const gola = orNull(() => {
    const g = pick(v, 'gola');
    if (g === null) return null;
    const [vl, vh] = RANGES.twdVnd;
    const [ul, uh] = RANGES.usdVnd;
    const updatedAt = pick(g, 'updatedAt');
    return {
      twdToVnd: inRange(num(pick(g, 'twdToVnd'), 'gola'), vl, vh, 'gola'),
      vndToTwd: inRange(num(pick(g, 'vndToTwd'), 'gola'), vl, vh, 'gola'),
      usdToVnd: inRange(num(pick(g, 'usdToVnd'), 'gola'), ul, uh, 'gola'),
      vndToUsd: inRange(num(pick(g, 'vndToUsd'), 'gola'), ul, uh, 'gola'),
      updatedAt: typeof updatedAt === 'number' && Number.isFinite(updatedAt) ? updatedAt : null,
    };
  });
  return { date, at, esun, bitopro, binance, gola };
}

/** Accepts the published file; malformed entries are dropped, malformed sources become null. */
export function parseHistory(json: unknown): HistoryFile {
  const raw = pick(json, 'entries');
  if (pick(json, 'version') !== 1 || !Array.isArray(raw)) {
    throw new Error('history.json: unexpected format');
  }
  const entries = raw.map(parseEntry).filter((e): e is HistoryEntry => e !== null);
  return { version: 1, entries };
}

/** null when nothing was recorded yet (404). */
export async function fetchHistory(fetchImpl: FetchFn = fetch): Promise<HistoryFile | null> {
  const res = await fetchImpl(`${HISTORY_URL}?t=${Date.now()}`, {
    cache: 'no-store',
    signal: AbortSignal.timeout(10_000),
  });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`HTTP ${res.status} from raw.githubusercontent.com`);
  return parseHistory(await res.json());
}

// ---------- series for the chart ----------

export function entryMarketData(e: HistoryEntry): MarketData {
  const stamp = { fetchedAt: e.at, sourceUpdatedAt: null };
  return {
    esun: e.esun ? { ...stamp, ...e.esun } : undefined,
    bitopro: e.bitopro ? { ...stamp, ...e.bitopro } : undefined,
    binance: e.binance ? { ...stamp, ...e.binance } : undefined,
    gola: e.gola ? { ...e.gola, enteredAt: e.at, origin: 'remote' } : undefined,
  };
}

/**
 * Rate per one unit of the non-VND currency, so days are comparable whatever the amount:
 * X→VND: VND received per 1 X (higher is better). VND→X: VND paid per 1 X (lower is better).
 */
export function unitRates(
  direction: Direction,
  md: MarketData,
  settings: Settings = DEFAULT_SETTINGS,
): Map<string, { title: string; rate: number | null }> {
  const fromVnd = DIRECTIONS[direction].from === 'VND';
  const amount = fromVnd ? 1_000_000 : 1;
  const out = new Map<string, { title: string; rate: number | null }>();
  for (const r of calcRoutes(direction, amount, md, settings)) {
    const rate = r.output === null || r.output <= 0 ? null : fromVnd ? amount / r.output : r.output;
    out.set(r.id, { title: r.title, rate });
  }
  return out;
}

export interface Series {
  id: string;
  title: string;
}

export interface HistoryPoint {
  date: string;
  values: Record<string, number | null>;
}

const ROUTE_ORDER = ['usdt', 'usd', 'direct'];

/** One point per recorded day; only routes that have at least one value become series. */
export function historySeries(
  entries: HistoryEntry[],
  direction: Direction,
  settings: Settings = DEFAULT_SETTINGS,
): { series: Series[]; points: HistoryPoint[] } {
  const titles = new Map<string, string>();
  const points = entries.map((e) => {
    const values: Record<string, number | null> = {};
    for (const [id, { title, rate }] of unitRates(direction, entryMarketData(e), settings)) {
      values[id] = rate;
      if (rate !== null) titles.set(id, title);
    }
    return { date: e.date, values };
  });
  const series = ROUTE_ORDER.filter((id) => titles.has(id)).map((id) => ({
    id,
    title: titles.get(id) ?? id,
  }));
  return { series, points };
}
