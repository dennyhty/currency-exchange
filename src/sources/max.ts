import type { MaxRates } from '../lib/types.ts';
import { type FetchFn, RANGES, getJson, inRange, num, pick } from './util.ts';

/**
 * MAX (MaiCoin) USDT/TWD order book: the backup for BitoPro. Only the scheduled job can read it:
 * the API sends no CORS header, and its WAF blocks Vietnam (tested 2026-11-21), so a browser in
 * Vietnam gets `waf block`. GitHub runners (US) get 200.
 */
export const MAX_DEPTH_URL = 'https://max-api.maicoin.com/api/v3/depth?market=usdttwd&limit=1';

/** Best ask/bid; `timestamp` is in seconds. */
export function parseMaxDepth(json: unknown): { ask: number; bid: number; at: number | null } {
  const [lo, hi] = RANGES.usdtTwd;
  const ask = inRange(num(pick(json, 'asks', 0, 0), 'max ask'), lo, hi, 'max ask');
  const bid = inRange(num(pick(json, 'bids', 0, 0), 'max bid'), lo, hi, 'max bid');
  if (bid > ask) throw new Error(`max: crossed book (bid ${bid} > ask ${ask})`);
  const ts = pick(json, 'timestamp');
  return { ask, bid, at: typeof ts === 'number' && Number.isFinite(ts) ? ts * 1000 : null };
}

export async function fetchMax(
  fetchImpl: FetchFn = fetch,
  now: number = Date.now(),
): Promise<MaxRates> {
  const { ask, bid, at } = parseMaxDepth(await getJson(fetchImpl, MAX_DEPTH_URL));
  return { fetchedAt: now, sourceUpdatedAt: at, ask, bid };
}
