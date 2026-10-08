import type { BitoproRates } from '../lib/types.ts';
import { type FetchFn, RANGES, getJson, inRange, num, pick } from './util.ts';

const BASE = 'https://api.bitopro.com/v3';

/** Best ask/bid of the USDT/TWD order book. */
export function parseOrderBook(json: unknown): { ask: number; bid: number } {
  const [lo, hi] = RANGES.usdtTwd;
  const ask = inRange(num(pick(json, 'asks', 0, 'price'), 'bitopro ask'), lo, hi, 'bitopro ask');
  const bid = inRange(num(pick(json, 'bids', 0, 'price'), 'bitopro bid'), lo, hi, 'bitopro bid');
  if (bid > ask) throw new Error(`bitopro: crossed book (bid ${bid} > ask ${ask})`);
  return { ask, bid };
}

/** "One-click" quotes: `buy` is what you pay per USDT, `sell` what you receive. */
export function parseOtc(json: unknown): { buy: number; sell: number } {
  const [lo, hi] = RANGES.usdtTwd;
  const buy = pick(json, 'buySwapQuotation', 'twd', 'exchangeRate');
  const sell = pick(json, 'sellSwapQuotation', 'twd', 'exchangeRate');
  return {
    buy: inRange(num(buy, 'bitopro otc buy'), lo, hi, 'bitopro otc buy'),
    sell: inRange(num(sell, 'bitopro otc sell'), lo, hi, 'bitopro otc sell'),
  };
}

export async function fetchBitopro(
  fetchImpl: FetchFn = fetch,
  now: number = Date.now(),
): Promise<BitoproRates> {
  const [book, otc] = await Promise.allSettled([
    getJson(fetchImpl, `${BASE}/order-book/usdt_twd?limit=1`),
    getJson(fetchImpl, `${BASE}/price/otc/usdt`),
  ]);
  if (book.status === 'rejected') throw book.reason;
  const { ask, bid } = parseOrderBook(book.value);
  let otcQuote: { buy: number; sell: number } | null = null;
  if (otc.status === 'fulfilled') {
    try {
      otcQuote = parseOtc(otc.value);
    } catch {
      otcQuote = null; // OTC is optional; the order book alone is enough
    }
  }
  return {
    fetchedAt: now,
    sourceUpdatedAt: null,
    ask,
    bid,
    otcBuy: otcQuote?.buy ?? null,
    otcSell: otcQuote?.sell ?? null,
  };
}
