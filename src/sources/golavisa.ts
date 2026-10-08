import type { GolaRates } from '../lib/types.ts';
import { type FetchFn, RANGES, inRange, num, pick } from './util.ts';

/**
 * Parse the JSON of https://www.golavisa.co/api/exchange-rates (the user copies it from their own
 * browser; the site blocks automated access). Hung Long rates: you give foreign currency → `buy_cash`,
 * you get foreign currency with VND → `sell`.
 */
export function parseGolaJson(input: unknown, now: number = Date.now()): GolaRates {
  const json: unknown = typeof input === 'string' ? JSON.parse(input) : input;
  const rate = (cur: 'TWD' | 'USD', key: 'buy_cash' | 'sell'): number =>
    num(pick(json, 'snapshot', 'rates', cur, key), `golavisa ${cur} ${key}`);
  const updated = pick(json, 'snapshot', 'hung_long_updated_at');
  const ms = typeof updated === 'string' ? Date.parse(updated) : NaN;
  return validateGola({
    twdToVnd: rate('TWD', 'buy_cash'),
    vndToTwd: rate('TWD', 'sell'),
    usdToVnd: rate('USD', 'buy_cash'),
    vndToUsd: rate('USD', 'sell'),
    updatedAt: Number.isFinite(ms) ? ms : null,
    enteredAt: now,
  });
}

/** Range-check hand-typed or parsed numbers before they are stored. */
export function validateGola(g: GolaRates): GolaRates {
  const [tl, th] = RANGES.twdVnd;
  const [ul, uh] = RANGES.usdVnd;
  inRange(g.twdToVnd, tl, th, 'TWD→VND');
  inRange(g.vndToTwd, tl, th, 'VND→TWD');
  inRange(g.usdToVnd, ul, uh, 'USD→VND');
  inRange(g.vndToUsd, ul, uh, 'VND→USD');
  return g;
}

/**
 * The published copy: a file on the `data` branch written by scripts/publish-golavisa.ts from the
 * user's own computer (their real browser can open the API; GitHub runners cannot).
 */
export const GOLA_FILE_URL =
  'https://raw.githubusercontent.com/dennyhty/currency-exchange/data/golavisa.json';

export interface GolaFile {
  /** ISO time the publisher read the API. */
  fetchedAt: string;
  /** The API response, stored verbatim so parsing stays in one place. */
  response: unknown;
}

/** Validate an API response and wrap it for publishing. Throws if it does not look right. */
export function buildGolaFile(response: unknown, now: Date = new Date()): GolaFile {
  parseGolaJson(response, now.getTime()); // range-checks every number we use
  return { fetchedAt: now.toISOString(), response };
}

export function parseGolaFile(json: unknown): GolaRates {
  const fetchedAt = Date.parse(String(pick(json, 'fetchedAt')));
  if (!Number.isFinite(fetchedAt)) throw new Error('golavisa file: bad fetchedAt');
  return { ...parseGolaJson(pick(json, 'response'), fetchedAt), origin: 'remote' };
}

/** null when nothing was published yet (404), so the manual entry keeps working. */
export async function fetchGolaFile(fetchImpl: FetchFn = fetch): Promise<GolaRates | null> {
  const res = await fetchImpl(`${GOLA_FILE_URL}?t=${Date.now()}`, {
    cache: 'no-store',
    signal: AbortSignal.timeout(10_000),
  });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`HTTP ${res.status} from raw.githubusercontent.com`);
  return parseGolaFile(await res.json());
}

/** Use whichever was entered or fetched most recently. */
export function newerGola(manual?: GolaRates, remote?: GolaRates | null): GolaRates | undefined {
  if (!remote) return manual;
  if (!manual) return remote;
  return manual.enteredAt > remote.enteredAt ? manual : remote;
}
