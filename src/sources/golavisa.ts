import type { GolaRates } from '../lib/types.ts';
import { RANGES, inRange, num, pick } from './util.ts';

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
