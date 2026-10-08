import { asSnapshot } from './lib/snapshot.ts';
import type { Snapshot } from './lib/types.ts';

/** rates.json is published next to the site by the scheduled job. Missing in dev: that's fine. */
export async function loadSnapshot(): Promise<Snapshot | null> {
  const res = await fetch(`${import.meta.env.BASE_URL}rates.json?t=${Date.now()}`, {
    cache: 'no-store',
    signal: AbortSignal.timeout(10_000),
  });
  if (!res.ok) return null;
  return asSnapshot(await res.json());
}
