import type { Snapshot } from './types.ts';

export type SnapshotKey = 'esun' | 'binanceFees' | 'bitopro' | 'binance';
export type FetchResult<T> = { ok: true; value: T } | { ok: false; error: string };

/**
 * Build the next rates.json. A source that failed keeps its previous value, flagged `stale`;
 * a source that failed and has no previous value is left out (the UI shows "資料不足").
 */
export function mergeSnapshot(
  prev: Snapshot | null,
  results: { [K in SnapshotKey]: FetchResult<NonNullable<Snapshot[K]>> },
  now: number,
): Snapshot {
  const next: Snapshot = { generatedAt: now };
  const keys: SnapshotKey[] = ['esun', 'binanceFees', 'bitopro', 'binance'];
  for (const key of keys) {
    const r = results[key];
    if (r.ok) {
      Object.assign(next, { [key]: r.value });
    } else if (prev?.[key]) {
      Object.assign(next, { [key]: { ...prev[key], stale: true } });
    }
  }
  return next;
}

/** Defensive read of a rates.json that may be missing, from an older shape, or hand-edited. */
export function asSnapshot(json: unknown): Snapshot | null {
  if (typeof json !== 'object' || json === null) return null;
  const j = json as Partial<Snapshot>;
  return typeof j.generatedAt === 'number' ? (j as Snapshot) : null;
}
