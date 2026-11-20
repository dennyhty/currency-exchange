// Scheduled job (daily): fetch what a browser cannot read, E.SUN's USD/TWD board rate and MAX's
// USDT/TWD order book (the BitoPro backup),
// and write rates.json. If a source fails, the previous value is kept and flagged stale.
// usage: node scripts/fetch-snapshot.ts --out public/rates.json [--prev previous-rates.json]
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import { parseArgs } from 'node:util';
import { asSnapshot, mergeSnapshot, type FetchResult } from '../src/lib/snapshot.ts';
import { fetchEsun } from '../src/sources/esun.ts';
import { fetchMax } from '../src/sources/max.ts';

const { values } = parseArgs({ options: { out: { type: 'string' }, prev: { type: 'string' } } });
if (!values.out) {
  console.error('usage: fetch-snapshot.ts --out <file> [--prev <file>]');
  process.exit(2);
}

async function attempt<T>(name: string, run: () => Promise<T>): Promise<FetchResult<T>> {
  try {
    return { ok: true, value: await run() };
  } catch (e) {
    const error = e instanceof Error ? e.message : String(e);
    console.warn(`::warning::${name} failed: ${error}`);
    return { ok: false, error };
  }
}

let prev = null;
if (values.prev) {
  try {
    prev = asSnapshot(JSON.parse(await readFile(values.prev, 'utf8')));
  } catch {
    console.log('no usable previous snapshot; starting fresh');
  }
}

const [esun, max] = await Promise.all([
  attempt('esun', () => fetchEsun()),
  attempt('max', () => fetchMax()),
]);
const snapshot = mergeSnapshot(prev, { esun, max }, Date.now());

await mkdir(dirname(values.out), { recursive: true });
await writeFile(values.out, `${JSON.stringify(snapshot, null, 2)}\n`);
const state = (ok: boolean, kept: unknown): string => (ok ? 'ok' : kept ? 'stale' : 'missing');
console.log(
  `wrote ${values.out}: esun=${state(esun.ok, snapshot.esun)} max=${state(max.ok, snapshot.max)}`,
);
