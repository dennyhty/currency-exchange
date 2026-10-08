// Scheduled job (daily, 09:00 Taipei): fetch E.SUN's USD/TWD board rate, which a browser cannot read,
// and write rates.json. If E.SUN fails, the previous value is kept and flagged stale.
// usage: node scripts/fetch-snapshot.ts --out public/rates.json [--prev previous-rates.json]
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import { parseArgs } from 'node:util';
import { asSnapshot, mergeSnapshot, type FetchResult } from '../src/lib/snapshot.ts';
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

const esun = await attempt('esun', () => fetchEsun());
const snapshot = mergeSnapshot(prev, { esun }, Date.now());

await mkdir(dirname(values.out), { recursive: true });
await writeFile(values.out, `${JSON.stringify(snapshot, null, 2)}\n`);
console.log(`wrote ${values.out}: esun=${esun.ok ? 'ok' : snapshot.esun ? 'stale' : 'missing'}`);
