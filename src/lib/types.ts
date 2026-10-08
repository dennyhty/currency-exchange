export type Fiat = 'TWD' | 'CNY' | 'VND' | 'USD';
export type Direction = 'TWD>VND' | 'VND>TWD' | 'CNY>VND' | 'VND>CNY';
export type SourceId = 'bitopro' | 'binance' | 'esun' | 'gola';

/** Every fetched value carries when we got it and when the source says it was updated (epoch ms). */
export interface Stamped {
  fetchedAt: number;
  sourceUpdatedAt: number | null;
}

/** USDT/TWD. `ask` is what you pay to buy USDT, `bid` what you get selling it. */
export interface BitoproRates extends Stamped {
  ask: number;
  bid: number;
  /** One-click ("OTC") quotes, null when that endpoint failed. */
  otcBuy: number | null;
  otcSell: number | null;
}

/** USD/TWD spot board rate, TWD per USD. `bankBuy`: bank buys USD from you. `bankSell`: bank sells USD to you. */
export interface EsunRates extends Stamped {
  bankBuy: number;
  bankSell: number;
}

/** Binance Express "Estimated price", fiat per 1 USDT. `buy`: you pay fiat, get USDT. `sell`: you sell USDT. */
export interface FiatQuote {
  buy: number;
  sell: number;
}
export interface BinanceRates extends Stamped {
  VND: FiatQuote;
  CNY: FiatQuote;
}

/** Express taker fee as a fraction (0.001 = 0.1%). Fixed in code (see calc/routes.ts); verified 2026-10-08. */
export interface BinanceFees extends Stamped {
  VND: FiatQuote;
  CNY: FiatQuote;
}

/** GolaVisa (Hung Long) rates, all "1 foreign currency = N VND". Entered by the user. */
export interface GolaRates {
  twdToVnd: number;
  vndToTwd: number;
  usdToVnd: number;
  vndToUsd: number;
  /** Update time shown by the site (epoch ms), null if unknown. */
  updatedAt: number | null;
  /** When the numbers were entered by hand, or fetched by the local publisher (epoch ms). */
  enteredAt: number;
  /** Where they came from. Missing means typed in by hand. */
  origin?: 'manual' | 'remote';
}

export type Marked<T> = T & { stale?: boolean };

/** What the scheduled job publishes as rates.json. */
export interface Snapshot {
  generatedAt: number;
  esun?: Marked<EsunRates>;
}

export interface MarketData {
  bitopro?: BitoproRates;
  esun?: EsunRates;
  binance?: BinanceRates;
  binanceFees?: BinanceFees;
  gola?: GolaRates;
}

export interface Settings {
  bitoproMode: 'orderbook' | 'otc';
  /** Fraction, e.g. 0.002 = 0.2%. Applied to the BitoPro leg only. */
  bitoproFee: number;
}
