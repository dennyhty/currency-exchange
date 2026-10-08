import type { BinanceFees, BinanceRates, FiatQuote } from '../lib/types.ts';
import { type FetchFn, RANGES, getJson, inRange, num, pick } from './util.ts';

type Fiat = 'VND' | 'CNY';
type Side = 'BUY' | 'SELL';

const quoteUrl = (fiat: Fiat, side: Side): string =>
  `https://www.binance.com/bapi/c2c/v1/public/c2c/agent/quote-price?fiat=${fiat}&asset=USDT&tradeType=${side}`;
const FEE_URL = 'https://c2c.binance.com/bapi/c2c/v1/friendly/c2c/commission-rate/taker';

/** Express "Estimated price" (fiat per USDT). BUY: you pay fiat for USDT. SELL: you sell USDT. */
export function parseQuote(json: unknown, fiat: Fiat): number {
  if (pick(json, 'success') !== true) throw new Error(`binance ${fiat}: unsuccessful response`);
  const price = num(pick(json, 'data', 'price'), `binance ${fiat} price`);
  const [lo, hi] = fiat === 'VND' ? RANGES.usdtVnd : RANGES.usdtCny;
  return inRange(price, lo, hi, `binance ${fiat} price`);
}

/** Taker commission rate as a fraction, per side. */
export function parseCommission(json: unknown): FiatQuote {
  const rows = pick(json, 'data');
  if (!Array.isArray(rows)) throw new Error('binance fee: no data');
  const rate = (side: Side): number => {
    const row = rows.find((r) => pick(r, 'tradeType') === side);
    const [lo, hi] = RANGES.fee;
    return inRange(
      num(pick(row, 'commissionRate'), `binance ${side} fee`),
      lo,
      hi,
      `binance ${side} fee`,
    );
  };
  return { buy: rate('BUY'), sell: rate('SELL') };
}

export async function fetchBinanceQuotes(
  fetchImpl: FetchFn = fetch,
  now: number = Date.now(),
): Promise<BinanceRates> {
  const get = async (fiat: Fiat, side: Side): Promise<number> =>
    parseQuote(await getJson(fetchImpl, quoteUrl(fiat, side)), fiat);
  const [vb, vs, cb, cs] = await Promise.all([
    get('VND', 'BUY'),
    get('VND', 'SELL'),
    get('CNY', 'BUY'),
    get('CNY', 'SELL'),
  ]);
  return {
    fetchedAt: now,
    sourceUpdatedAt: null,
    VND: { buy: vb, sell: vs },
    CNY: { buy: cb, sell: cs },
  };
}

export async function fetchBinanceFees(
  fetchImpl: FetchFn = fetch,
  now: number = Date.now(),
): Promise<BinanceFees> {
  const get = async (fiat: Fiat): Promise<FiatQuote> =>
    parseCommission(
      await getJson(fetchImpl, FEE_URL, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ channel: 'c2c', area: 'express', asset: 'USDT', fiat }),
      }),
    );
  const [VND, CNY] = await Promise.all([get('VND'), get('CNY')]);
  return { fetchedAt: now, sourceUpdatedAt: null, VND, CNY };
}
