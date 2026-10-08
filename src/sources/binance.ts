import type { BinanceRates } from '../lib/types.ts';
import { type FetchFn, RANGES, getJson, inRange, num, pick } from './util.ts';

type Fiat = 'VND' | 'CNY';
type Side = 'BUY' | 'SELL';

const quoteUrl = (fiat: Fiat, side: Side): string =>
  `https://www.binance.com/bapi/c2c/v1/public/c2c/agent/quote-price?fiat=${fiat}&asset=USDT&tradeType=${side}`;

/** Express "Estimated price" (fiat per USDT). BUY: you pay fiat for USDT. SELL: you sell USDT. */
export function parseQuote(json: unknown, fiat: Fiat): number {
  if (pick(json, 'success') !== true) throw new Error(`binance ${fiat}: unsuccessful response`);
  const price = num(pick(json, 'data', 'price'), `binance ${fiat} price`);
  const [lo, hi] = fiat === 'VND' ? RANGES.usdtVnd : RANGES.usdtCny;
  return inRange(price, lo, hi, `binance ${fiat} price`);
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
