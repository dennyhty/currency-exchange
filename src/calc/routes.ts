import type { Direction, Fiat, MarketData, Settings, SourceId } from '../lib/types.ts';

export const DIRECTIONS: Record<Direction, { from: Fiat; to: Fiat; defaultAmount: number }> = {
  'TWD>VND': { from: 'TWD', to: 'VND', defaultAmount: 30_000 },
  'VND>TWD': { from: 'VND', to: 'TWD', defaultAmount: 10_000_000 },
  'CNY>VND': { from: 'CNY', to: 'VND', defaultAmount: 7_000 },
  'VND>CNY': { from: 'VND', to: 'CNY', defaultAmount: 10_000_000 },
};

/** Used when the fee snapshot is unavailable: the 0.1% the user specified for VND, none for CNY. */
export const DEFAULT_BINANCE_FEES = {
  VND: { buy: 0.001, sell: 0.001 },
  CNY: { buy: 0, sell: 0 },
} as const;

export const DEFAULT_SETTINGS: Settings = { bitoproMode: 'orderbook', bitoproFee: 0 };

export interface Leg {
  text: string;
  source: SourceId;
}

export interface RouteResult {
  id: string;
  title: string;
  legs: Leg[];
  /** Amount received in the target currency; null when an input is missing. */
  output: number | null;
  /** Human-readable names of the inputs that are missing. */
  missing: string[];
}

type Num = number | null | undefined;

const fmt = (n: number): string => String(Number(n.toPrecision(8)));
const pct = (f: number): string => `${fmt(f * 100)}%`;

/** Build a route from steps; a step with a missing rate makes the whole route unavailable. */
function route(id: string, title: string, amount: number, steps: Step[]): RouteResult {
  const legs: Leg[] = [];
  const missing: string[] = [];
  let value = amount;
  for (const s of steps) {
    if (s.rate === null || s.rate === undefined) {
      missing.push(s.missing);
      continue;
    }
    value = s.op === 'div' ? value / s.rate : value * s.rate;
    if (s.fee) value *= 1 - s.fee;
    legs.push({ text: s.text(s.rate), source: s.source });
  }
  return { id, title, legs, output: missing.length > 0 ? null : value, missing };
}

interface Step {
  rate: Num;
  op: 'div' | 'mul';
  fee?: number;
  source: SourceId;
  missing: string;
  text: (rate: number) => string;
}

export function calcRoutes(
  direction: Direction,
  amount: number,
  md: MarketData,
  settings: Settings = DEFAULT_SETTINGS,
): RouteResult[] {
  const fees = md.binanceFees ?? DEFAULT_BINANCE_FEES;
  const bito = md.bitopro;
  const otc = settings.bitoproMode === 'otc';
  const bitoBuy = bito ? (otc ? bito.otcBuy : bito.ask) : null; // TWD per USDT you pay
  const bitoSell = bito ? (otc ? bito.otcSell : bito.bid) : null; // TWD per USDT you get
  const bitoName = otc ? 'BitoPro 一鍵買賣' : 'BitoPro 掛單簿';
  const bf = settings.bitoproFee;
  const bin = md.binance;
  const esun = md.esun;
  const gola = md.gola;

  const bitoLeg = (side: 'buy' | 'sell'): Step => ({
    rate: side === 'buy' ? bitoBuy : bitoSell,
    op: side === 'buy' ? 'div' : 'mul',
    fee: bf,
    source: 'bitopro',
    missing: 'BitoPro 報價',
    text: (r) =>
      `${bitoName} ${side === 'buy' ? '買' : '賣'} USDT：${fmt(r)} TWD${bf ? `（手續費 ${pct(bf)}）` : ''}`,
  });
  const binLeg = (fiat: 'VND' | 'CNY', side: 'buy' | 'sell'): Step => ({
    rate: bin?.[fiat][side],
    op: side === 'buy' ? 'div' : 'mul',
    fee: fees[fiat][side],
    source: 'binance',
    missing: `Binance ${fiat} 預估價`,
    text: (r) =>
      `Binance Express ${side === 'buy' ? '買' : '賣'} USDT：${fmt(r)} ${fiat}${
        fees[fiat][side] ? `（手續費 ${pct(fees[fiat][side])}）` : ''
      }`,
  });
  const esunLeg = (side: 'buy' | 'sell'): Step => ({
    rate: esun ? (side === 'buy' ? esun.bankBuy : esun.bankSell) : null,
    // you buy USD from the bank at its sell rate (div), you sell USD at its buy rate (mul)
    op: side === 'sell' ? 'div' : 'mul',
    source: 'esun',
    missing: '玉山即期匯率',
    text: (r) =>
      `玉山即期 銀行${side === 'sell' ? '賣出（你買 USD）' : '買入（你賣 USD）'}：${fmt(r)} TWD`,
  });
  const golaLeg = (
    key: 'twdToVnd' | 'vndToTwd' | 'usdToVnd' | 'vndToUsd',
    label: string,
  ): Step => ({
    rate: gola?.[key],
    op: key.startsWith('vndTo') ? 'div' : 'mul',
    source: 'gola',
    missing: 'GolaVisa 匯率（請手動輸入）',
    text: (r) => `GolaVisa ${label}：${fmt(r)} VND`,
  });

  let results: RouteResult[];
  switch (direction) {
    case 'TWD>VND':
      results = [
        route('usdt', 'TWD → USDT → VND', amount, [bitoLeg('buy'), binLeg('VND', 'sell')]),
        route('usd', 'TWD → USD → VND', amount, [
          esunLeg('sell'),
          golaLeg('usdToVnd', '1 USD 換到'),
        ]),
        route('direct', 'TWD → VND（GolaVisa 直換）', amount, [golaLeg('twdToVnd', '1 TWD 換到')]),
      ];
      break;
    case 'VND>TWD':
      results = [
        route('usdt', 'VND → USDT → TWD', amount, [binLeg('VND', 'buy'), bitoLeg('sell')]),
        route('usd', 'VND → USD → TWD', amount, [
          golaLeg('vndToUsd', '1 USD 要付'),
          esunLeg('buy'),
        ]),
        route('direct', 'VND → TWD（GolaVisa 直換）', amount, [golaLeg('vndToTwd', '1 TWD 要付')]),
      ];
      break;
    case 'CNY>VND':
      results = [
        route('usdt', 'CNY → USDT → VND', amount, [binLeg('CNY', 'buy'), binLeg('VND', 'sell')]),
      ];
      break;
    case 'VND>CNY':
      results = [
        route('usdt', 'VND → USDT → CNY', amount, [binLeg('VND', 'buy'), binLeg('CNY', 'sell')]),
      ];
      break;
  }
  // best first; unavailable routes last, in their original order
  return results
    .map((r, i) => ({ r, i }))
    .sort((a, b) => {
      if (a.r.output === null || b.r.output === null) {
        return a.r.output === b.r.output ? a.i - b.i : a.r.output === null ? 1 : -1;
      }
      return b.r.output - a.r.output || a.i - b.i;
    })
    .map(({ r }) => r);
}

/** How far below the best route this one is, as a fraction (0 for the best). */
export function shortfall(output: number, best: number): number {
  return best > 0 ? (best - output) / best : 0;
}
