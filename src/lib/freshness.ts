import type { SourceId } from './types.ts';

export type Freshness = 'fresh' | 'warn' | 'stale';

/** Age thresholds in ms: older than `warn` shows a warning, older than `stale` marks it stale. */
export const THRESHOLDS: Record<SourceId, { warn: number; stale: number }> = {
  bitopro: { warn: 2 * 60_000, stale: 10 * 60_000 },
  binance: { warn: 2 * 60_000, stale: 10 * 60_000 },
  // refreshed once a day (09:00 Taipei): only call it stale after a missed run
  esun: { warn: 6 * 3_600_000, stale: 36 * 3_600_000 },
  // Hung Long updates about once per working day
  gola: { warn: 24 * 3_600_000, stale: 3 * 24 * 3_600_000 },
};

export function freshness(source: SourceId, ageMs: number): Freshness {
  const t = THRESHOLDS[source];
  if (ageMs >= t.stale) return 'stale';
  return ageMs >= t.warn ? 'warn' : 'fresh';
}
