import type { EsunRates } from '../lib/types.ts';
import { type FetchFn, RANGES, getJson, inRange, num, pick } from './util.ts';

export const ESUN_URL =
  'https://www.esunbank.com/api/client/ExchangeRate/LastRateInfo?sc_lang=zh-TW';

/** ASP.NET date "/Date(1791448520000)/" → epoch ms, or null. */
export function parseDotNetDate(v: unknown): number | null {
  if (typeof v !== 'string') return null;
  const m = /^\/Date\((-?\d+)\)\/$/.exec(v);
  return m?.[1] ? Number(m[1]) : null;
}

/** USD/TWD **spot** board rates (not cash, not the e-banking promo columns). */
export function parseEsun(json: unknown, fetchedAt: number): EsunRates {
  const rates = pick(json, 'Rates');
  if (!Array.isArray(rates)) throw new Error('esun: no Rates');
  const usd = rates.find((r) => pick(r, 'CCY') === 'USD/TWD');
  if (!usd) throw new Error('esun: USD/TWD not found');
  const [lo, hi] = RANGES.usdTwd;
  const bankBuy = inRange(num(pick(usd, 'BBoardRate'), 'esun bankBuy'), lo, hi, 'esun bankBuy');
  const bankSell = inRange(num(pick(usd, 'SBoardRate'), 'esun bankSell'), lo, hi, 'esun bankSell');
  if (bankBuy > bankSell) throw new Error(`esun: buy ${bankBuy} is above sell ${bankSell}`);
  return {
    fetchedAt,
    sourceUpdatedAt: parseDotNetDate(pick(usd, 'UpdateTime')),
    bankBuy,
    bankSell,
  };
}

/** The page itself POSTs with an empty body. The response has no CORS header: server-side only. */
export async function fetchEsun(
  fetchImpl: FetchFn = fetch,
  now: number = Date.now(),
): Promise<EsunRates> {
  const json = await getJson(fetchImpl, ESUN_URL, {
    method: 'POST',
    headers: { 'content-type': 'application/json', accept: 'application/json' },
    body: '',
  });
  return parseEsun(json, now);
}
