import { describe, expect, it } from 'vitest';
import { fetchBinanceQuotes, parseQuote } from './binance.ts';
import { fetchBitopro, parseOrderBook, parseOtc } from './bitopro.ts';
import { fetchEsun, parseDotNetDate, parseEsun } from './esun.ts';
import { fakeFetch, fixture } from './fixtures.ts';
import {
  buildGolaFile,
  fetchGolaFile,
  newerGola,
  parseGolaFile,
  parseGolaJson,
  validateGola,
} from './golavisa.ts';

describe('bitopro', () => {
  it('reads best ask/bid from the order book', () => {
    expect(parseOrderBook(fixture('bitopro/order-book-usdt_twd.json'))).toEqual({
      ask: 31.988,
      bid: 31.978,
    });
  });

  it('reads one-click quotes (buy is what you pay, sell what you get)', () => {
    expect(parseOtc(fixture('bitopro/otc-price-usdt.json'))).toEqual({
      buy: 32.118964,
      sell: 31.849092,
    });
  });

  it('rejects a crossed book and implausible prices', () => {
    expect(() => parseOrderBook({ asks: [{ price: '31' }], bids: [{ price: '32' }] })).toThrow(
      /crossed/,
    );
    expect(() =>
      parseOrderBook({ asks: [{ price: '3198.8' }], bids: [{ price: '3197.8' }] }),
    ).toThrow(/outside/);
    expect(() => parseOrderBook({})).toThrow();
  });

  it('fetchBitopro combines both endpoints and tolerates a failing OTC endpoint', async () => {
    const book = fixture('bitopro/order-book-usdt_twd.json');
    const all = await fetchBitopro(
      fakeFetch([
        ['order-book', book],
        ['price/otc', fixture('bitopro/otc-price-usdt.json')],
      ]),
      1000,
    );
    expect(all).toMatchObject({ ask: 31.988, bid: 31.978, otcBuy: 32.118964, fetchedAt: 1000 });
    const noOtc = await fetchBitopro(fakeFetch([['order-book', book]]), 1000);
    expect(noOtc).toMatchObject({ ask: 31.988, otcBuy: null, otcSell: null });
    await expect(fetchBitopro(fakeFetch([]))).rejects.toThrow();
  });
});

describe('esun', () => {
  it('reads USD/TWD spot buy/sell (not cash, not e-banking promo) and the update time', () => {
    const r = parseEsun(fixture('esun/last-rate-info.trimmed.json'), 5);
    expect(r).toEqual({
      fetchedAt: 5,
      sourceUpdatedAt: 1791448520000,
      bankBuy: 31.85,
      bankSell: 31.95,
    });
  });

  it('parses .NET dates', () => {
    expect(parseDotNetDate('/Date(1791448520000)/')).toBe(1791448520000);
    expect(parseDotNetDate('2026-10-08')).toBeNull();
    expect(parseDotNetDate(undefined)).toBeNull();
  });

  it('fails loudly when USD is missing or inverted', () => {
    expect(() => parseEsun({ Rates: [] }, 0)).toThrow(/not found/);
    expect(() => parseEsun({}, 0)).toThrow();
    expect(() =>
      parseEsun({ Rates: [{ CCY: 'USD/TWD', BBoardRate: 32, SBoardRate: 31 }] }, 0),
    ).toThrow(/above sell/);
  });

  it('fetchEsun posts and parses', async () => {
    const r = await fetchEsun(
      fakeFetch([['LastRateInfo', fixture('esun/last-rate-info.trimmed.json')]]),
      9,
    );
    expect(r.bankSell).toBe(31.95);
  });
});

describe('binance', () => {
  it('reads Express estimated prices', () => {
    expect(parseQuote(fixture('binance/quote-price-vnd-buy.json'), 'VND')).toBe(25986);
    expect(parseQuote(fixture('binance/quote-price-vnd-sell.json'), 'VND')).toBe(26162);
    expect(parseQuote(fixture('binance/quote-price-cny-buy.json'), 'CNY')).toBe(6.65);
    expect(parseQuote(fixture('binance/quote-price-cny-sell.json'), 'CNY')).toBe(6.67);
  });

  it('rejects unsuccessful or implausible responses', () => {
    expect(() => parseQuote({ success: false }, 'VND')).toThrow();
    expect(() => parseQuote({ success: true, data: { price: 26 } }, 'VND')).toThrow(/outside/);
  });

  it('fetches all four quotes, using the right tradeType for each side', async () => {
    const seen: string[] = [];
    const f = (async (input: RequestInfo | URL) => {
      const url = String(input);
      seen.push(url);
      const fiat = url.includes('fiat=VND') ? 'vnd' : 'cny';
      const side = url.includes('tradeType=BUY') ? 'buy' : 'sell';
      return new Response(JSON.stringify(fixture(`binance/quote-price-${fiat}-${side}.json`)));
    }) as typeof fetch;
    const r = await fetchBinanceQuotes(f, 7);
    expect(r).toMatchObject({ VND: { buy: 25986, sell: 26162 }, CNY: { buy: 6.65, sell: 6.67 } });
    expect(seen).toHaveLength(4);
  });
});

describe('golavisa', () => {
  it('maps the API fields: TWD/USD → VND is buy_cash, VND → TWD/USD is sell', () => {
    const g = parseGolaJson(fixture('golavisa/exchange-rates.sample.json'), 42);
    expect(g).toEqual({
      twdToVnd: 781,
      vndToTwd: 810,
      usdToVnd: 25960,
      vndToUsd: 26110,
      updatedAt: Date.parse('2026-10-08T03:06:08.810039+00:00'),
      enteredAt: 42,
    });
  });

  it('accepts the JSON as text and rejects missing fields', () => {
    const text = JSON.stringify(fixture('golavisa/exchange-rates.sample.json'));
    expect(parseGolaJson(text).usdToVnd).toBe(25960);
    expect(() => parseGolaJson({ snapshot: { rates: {} } })).toThrow();
    expect(() => parseGolaJson('not json')).toThrow();
  });

  it('validates typed numbers', () => {
    const ok = {
      twdToVnd: 781,
      vndToTwd: 810,
      usdToVnd: 25960,
      vndToUsd: 26110,
      updatedAt: null,
      enteredAt: 1,
    };
    expect(validateGola(ok)).toBe(ok);
    expect(() => validateGola({ ...ok, usdToVnd: 26 })).toThrow(/outside/);
  });
});

describe('golavisa published file', () => {
  const api = fixture('golavisa/exchange-rates.sample.json');
  const at = new Date('2026-10-08T09:00:00Z');

  it('wraps a validated API response with the fetch time and parses it back as remote', () => {
    const file = buildGolaFile(api, at);
    expect(file.fetchedAt).toBe('2026-10-08T09:00:00.000Z');
    expect(parseGolaFile(file)).toMatchObject({
      origin: 'remote',
      twdToVnd: 781,
      usdToVnd: 25960,
      enteredAt: at.getTime(),
    });
  });

  it('refuses to publish something that is not the API (e.g. a challenge page)', () => {
    expect(() => buildGolaFile({ error: { code: 'challenge' } })).toThrow();
    expect(() =>
      buildGolaFile({ snapshot: { rates: { TWD: { buy_cash: 7, sell: 8 } } } }),
    ).toThrow();
  });

  it('rejects a file without a usable fetch time', () => {
    expect(() => parseGolaFile({ response: api })).toThrow(/fetchedAt/);
  });

  it('fetchGolaFile returns null on 404 and throws on other errors', async () => {
    const status = (code: number): typeof fetch =>
      (async () => new Response('x', { status: code })) as typeof fetch;
    expect(await fetchGolaFile(status(404))).toBeNull();
    await expect(fetchGolaFile(status(500))).rejects.toThrow(/500/);
    const ok = (async () => new Response(JSON.stringify(buildGolaFile(api, at)))) as typeof fetch;
    expect((await fetchGolaFile(ok))?.origin).toBe('remote');
  });

  it('newerGola prefers whichever was entered or fetched most recently', () => {
    const base = {
      twdToVnd: 781,
      vndToTwd: 810,
      usdToVnd: 25960,
      vndToUsd: 26110,
      updatedAt: null,
    };
    const manual = { ...base, enteredAt: 200 };
    const remote = { ...base, enteredAt: 100, origin: 'remote' as const };
    expect(newerGola(manual, remote)).toBe(manual);
    expect(newerGola(manual, { ...remote, enteredAt: 300 })?.origin).toBe('remote');
    expect(newerGola(manual, null)).toBe(manual);
    expect(newerGola(undefined, remote)).toBe(remote);
    expect(newerGola(undefined, null)).toBeUndefined();
  });
});
