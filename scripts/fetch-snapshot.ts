// Scheduled job: fetch the sources a browser cannot read (E.SUN, Binance fees) plus fallback copies
// of the live ones, and write rates.json. A failed source keeps its previous value, flagged stale.
// usage: node scripts/fetch-snapshot.ts --out public/rates.json [--prev previous-rates.json]
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import { parseArgs } from 'node:util';
import { asSnapshot, mergeSnapshot, type FetchResult } from '../src/lib/snapshot.ts';
import { fetchBinanceFees, fetchBinanceQuotes } from '../src/sources/binance.ts';
import { fetchBitopro } from '../src/sources/bitopro.ts';
import { fetchEsun } from '../src/sources/esun.ts';

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

const [esun, binanceFees, bitopro, binance] = await Promise.all([
  attempt('esun', () => fetchEsun()),
  attempt('binanceFees', () => fetchBinanceFees()),
  attempt('bitopro', () => fetchBitopro()),
  attempt('binance', () => fetchBinanceQuotes()),
]);
const snapshot = mergeSnapshot(prev, { esun, binanceFees, bitopro, binance }, Date.now());

await mkdir(dirname(values.out), { recursive: true });
await writeFile(values.out, `${JSON.stringify(snapshot, null, 2)}\n`);
const summary = Object.entries({ esun, binanceFees, bitopro, binance })
  .map(
    ([k, r]) => `${k}=${r.ok ? 'ok' : snapshot[k as keyof typeof snapshot] ? 'stale' : 'missing'}`,
  )
  .join(' ');
console.log(`wrote ${values.out}: ${summary}`);
