// Scheduled job (daily, 09:00 Taipei): append today's rates of every source to history.json on the
// `data` branch (the workflow checks that branch out and commits the file). GolaVisa is taken from the
// published golavisa.json next to it, only while it is fresh. A source that fails is recorded as null.
// usage: node scripts/record-history.ts --file data-branch/history.json [--gola data-branch/golavisa.json]
import { existsSync } from 'node:fs';
import { readFile, writeFile } from 'node:fs/promises';
import { parseArgs } from 'node:util';
import {
  appendEntry,
  golaForHistory,
  parseHistory,
  taipeiDate,
  type HistoryEntry,
  type HistoryFile,
} from '../src/lib/history.ts';
import { fetchBinanceQuotes } from '../src/sources/binance.ts';
import { fetchBitopro } from '../src/sources/bitopro.ts';
import { fetchEsun } from '../src/sources/esun.ts';
import { parseGolaFile } from '../src/sources/golavisa.ts';

const { values } = parseArgs({ options: { file: { type: 'string' }, gola: { type: 'string' } } });
if (!values.file) {
  console.error('usage: record-history.ts --file <history.json> [--gola <golavisa.json>]');
  process.exit(2);
}

async function attempt<T>(name: string, run: () => Promise<T>): Promise<T | null> {
  try {
    return await run();
  } catch (e) {
    console.warn(`::warning::${name} failed: ${e instanceof Error ? e.message : String(e)}`);
    return null;
  }
}

async function readJson(path: string): Promise<unknown> {
  return JSON.parse(await readFile(path, 'utf8'));
}

// An existing file that cannot be read must stop the job: starting over would erase the history.
let file: HistoryFile | null = null;
try {
  file = parseHistory(await readJson(values.file));
} catch (e) {
  if ((e as NodeJS.ErrnoException).code !== 'ENOENT') throw e;
  console.log('no history.json yet: starting it');
}

const at = Date.now();
const [esun, bitopro, binance] = await Promise.all([
  attempt('esun', () => fetchEsun()),
  attempt('bitopro', () => fetchBitopro()),
  attempt('binance', () => fetchBinanceQuotes()),
]);
const golaPath = values.gola;
const gola =
  golaPath && existsSync(golaPath)
    ? await attempt('golavisa.json', async () => parseGolaFile(await readJson(golaPath)))
    : null;

if (!esun && !bitopro && !binance) {
  console.error('every source failed: nothing recorded');
  process.exit(1);
}

const entry: HistoryEntry = {
  date: taipeiDate(at),
  at,
  esun: esun && { bankBuy: esun.bankBuy, bankSell: esun.bankSell },
  bitopro: bitopro && {
    ask: bitopro.ask,
    bid: bitopro.bid,
    otcBuy: bitopro.otcBuy,
    otcSell: bitopro.otcSell,
  },
  binance: binance && { VND: binance.VND, CNY: binance.CNY },
  gola: golaForHistory(gola, at),
};
const next = appendEntry(file, entry);
await writeFile(values.file, `${JSON.stringify(next, null, 1)}\n`);
console.log(
  `recorded ${entry.date}: esun=${!!entry.esun} bitopro=${!!entry.bitopro} ` +
    `binance=${!!entry.binance} gola=${!!entry.gola} (${next.entries.length} days)`,
);
