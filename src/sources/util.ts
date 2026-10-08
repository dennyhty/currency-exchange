export function isRecord(v: unknown): v is Record<string | number, unknown> {
  return typeof v === 'object' && v !== null;
}

/** Safe deep read: pick(json, 'a', 0, 'b'). */
export function pick(v: unknown, ...path: (string | number)[]): unknown {
  let cur = v;
  for (const key of path) {
    if (!isRecord(cur)) return undefined;
    cur = cur[key];
  }
  return cur;
}

export function num(v: unknown, what: string): number {
  const n = typeof v === 'string' && v.trim() !== '' ? Number(v) : v;
  if (typeof n !== 'number' || !Number.isFinite(n)) throw new Error(`${what}: not a number`);
  return n;
}

/** Reject values outside a plausible range so a parse slip never shows up as a rate. */
export function inRange(n: number, min: number, max: number, what: string): number {
  if (n < min || n > max) throw new Error(`${what}: ${n} is outside ${min}–${max}`);
  return n;
}

export const RANGES = {
  usdtTwd: [25, 40],
  usdTwd: [25, 40],
  usdtVnd: [20_000, 35_000],
  usdtCny: [5, 9],
  usdVnd: [20_000, 35_000],
  twdVnd: [500, 1_200],
  fee: [0, 0.05],
} as const;

export type FetchFn = typeof fetch;

export async function getJson(
  fetchImpl: FetchFn,
  url: string,
  init: RequestInit = {},
  timeoutMs = 10_000,
): Promise<unknown> {
  const res = await fetchImpl(url, { ...init, signal: AbortSignal.timeout(timeoutMs) });
  if (!res.ok) throw new Error(`HTTP ${res.status} from ${new URL(url).host}`);
  return res.json();
}
