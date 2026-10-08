// TEMPORARY (Phase 0): prints what each data source returns when fetched from a
// GitHub-hosted runner, so the real formats, CORS and blocking behaviour are known
// before any adapter is written. Delete once docs/data-sources.md is written.
//
// usage: node probe.mjs <env|bitopro|esun|binance|golavisa|selftest>
import { chromium } from 'playwright-core';

const ORIGIN = 'https://dennyhty.github.io';
const UA =
  'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';
const TIMEOUT_MS = Number(process.env.PROBE_TIMEOUT_MS ?? 20_000);
const SHOW_HEADERS = [
  'content-type',
  'access-control-allow-origin',
  'access-control-allow-methods',
  'access-control-allow-headers',
  'access-control-allow-credentials',
  'access-control-max-age',
  'cache-control',
  'age',
  'date',
  'last-modified',
  'server',
  'via',
  'x-cache',
  'cf-ray',
  'cf-cache-status',
  'x-amz-cf-id',
  'retry-after',
  'location',
];
// Analytics / ads / static assets we never care about when listing a page's requests.
const NOISE =
  /google|gstatic|doubleclick|googletagmanager|facebook|sentry|clarity|hotjar|segment|datadog|newrelic|bnbstatic|cloudflareinsights|\.(?:js|css|png|jpe?g|svg|gif|webp|woff2?|ttf|ico)(?:\?|$)/i;

const out = (s = '') => console.log(s);
const cut = (s, n) => (s.length > n ? `${s.slice(0, n)}\n…[+${s.length - n} more chars]` : s);
const indent = (s, p) =>
  s
    .split('\n')
    .map((l) => p + l)
    .join('\n');
const bar = (t) => out(`\n${'='.repeat(78)}\n${t}\n${'='.repeat(78)}`);

/** Keep only lines matching `re` (plus `ctx` lines around each) of a pretty-printed body. */
function grepLines(s, re, ctx = 3, limit = 150) {
  const lines = s.split('\n');
  const keep = new Set();
  lines.forEach((l, i) => {
    if (!re.test(l)) return;
    for (let k = Math.max(0, i - ctx); k <= Math.min(lines.length - 1, i + ctx); k++) keep.add(k);
  });
  const picked = [...keep]
    .sort((a, b) => a - b)
    .slice(0, limit)
    .map((i) => lines[i]);
  return picked.length ? picked.join('\n') : '(no lines matched)';
}

async function probe(label, url, o = {}) {
  const { method = 'GET', headers = {}, body, max = 2500, origin = true, pick, grep } = o;
  out(`\n── ${label}\n   ${method} ${url}`);
  const t0 = Date.now();
  try {
    const res = await fetch(url, {
      method,
      headers: {
        'user-agent': UA,
        accept: 'application/json, text/plain, */*',
        ...(origin ? { origin: ORIGIN } : {}),
        ...headers,
      },
      body,
      redirect: 'manual',
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    const text = await res.text();
    out(`   → HTTP ${res.status} in ${Date.now() - t0} ms, ${text.length} bytes`);
    for (const h of SHOW_HEADERS) {
      const v = res.headers.get(h);
      if (v) out(`   ${h}: ${v}`);
    }
    if (max > 0 && text) {
      let shown = text;
      try {
        const j = JSON.parse(text);
        shown = JSON.stringify(pick ? pick(j) : j, null, 1);
      } catch {
        /* not JSON: show the raw text */
      }
      if (grep) shown = grepLines(shown, grep);
      out(indent(cut(shown, max), '   | '));
    }
    return text;
  } catch (e) {
    out(`   → ERROR after ${Date.now() - t0} ms: ${e.cause?.code ?? e.name} ${e.message}`);
    return '';
  }
}

function htmlSummary(html, max = 3000) {
  if (!html) return;
  const title = html.match(/<title[^>]*>([^<]*)/i)?.[1]?.trim();
  const scripts = [...html.matchAll(/<script[^>]+src=["']([^"']+)/gi)]
    .map((m) => m[1])
    .slice(0, 12);
  const jsonScripts = [
    ...html.matchAll(
      /<script[^>]*(?:type=["']application\/(?:ld\+)?json["']|id=["']__NEXT_DATA__["'])[^>]*>([\s\S]*?)<\/script>/gi,
    ),
  ];
  const text = html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  out(`   html title: ${title ?? '(none)'}`);
  out(`   script src (first ${scripts.length}): ${scripts.join(' , ')}`);
  out(
    `   inline JSON script tags: ${jsonScripts.length}${
      jsonScripts[0] ? `; first: ${cut(jsonScripts[0][1].trim(), 800)}` : ''
    }`,
  );
  out(`   visible text (${text.length} chars): ${cut(text, max)}`);
}

async function launchBrowser() {
  const args = ['--no-sandbox', '--disable-dev-shm-usage'];
  const attempts = [];
  if (process.env.CHROME_PATH) attempts.push({ executablePath: process.env.CHROME_PATH });
  attempts.push({ channel: 'chrome' }, { executablePath: '/usr/bin/google-chrome' }, {});
  let lastErr;
  for (const a of attempts) {
    try {
      return await chromium.launch({ headless: true, args, ...a });
    } catch (e) {
      lastErr = e;
    }
  }
  throw lastErr;
}

/** Load a page in headless Chrome and report every xhr/fetch it makes plus the rendered text. */
async function capture(label, url, o = {}) {
  const { textMax = 2500, jsonMax = 1500, settleMs = 6000, grep = [], act, must, only = false } = o;
  out(`\n── [browser] ${label}\n   ${url}`);
  let browser;
  try {
    browser = await launchBrowser();
    out(`   browser: ${browser.version()}`);
    const ctx = await browser.newContext({
      userAgent: UA,
      locale: 'zh-TW',
      timezoneId: 'Asia/Taipei',
      viewport: { width: 1280, height: 1000 },
    });
    const page = await ctx.newPage();
    const seen = [];
    page.on('response', async (res) => {
      const req = res.request();
      const type = req.resourceType();
      if (type !== 'xhr' && type !== 'fetch' && type !== 'document') return;
      let body = '';
      try {
        body = await res.text();
      } catch {
        /* redirect or body unavailable */
      }
      seen.push({
        type,
        method: req.method(),
        url: res.url(),
        status: res.status(),
        ct: res.headers()['content-type'] ?? '',
        body,
        post: req.postData() ?? '',
      });
    });
    const resp = await page
      .goto(url, { waitUntil: 'domcontentloaded', timeout: 45_000 })
      .catch((e) => {
        out(`   goto error: ${e.message.split('\n')[0]}`);
        return null;
      });
    out(`   main document: HTTP ${resp?.status() ?? 'n/a'}`);
    await page
      .waitForLoadState('networkidle', { timeout: 20_000 })
      .catch(() => out('   (networkidle not reached within 20 s)'));
    await page.waitForTimeout(settleMs);
    if (act) await act(page);

    const rel = seen.filter((r) => r.type === 'document' || !NOISE.test(r.url));
    // Requests the caller cares about: always print request + full response body.
    for (const r of must ? rel.filter((x) => must.test(x.url)) : []) {
      out(`   ★ ${r.method} ${r.status} ${cut(r.url, 200)}`);
      if (r.post) out(`     request body: ${cut(r.post, 300)}`);
      out(indent(cut(r.body, 3000), '     | '));
    }
    if (only) return;
    out(`   requests (documents + xhr/fetch, noise filtered): ${rel.length} of ${seen.length}`);
    for (const r of rel.slice(0, 40)) {
      out(
        `   - ${r.method} ${r.status} ${r.type} ${r.ct.split(';')[0]} ${r.body.length}B ${cut(r.url, 200)}${
          r.post ? `  POST=${cut(r.post, 160)}` : ''
        }`,
      );
    }
    const jsonish = rel.filter(
      (r) => r.type !== 'document' && (/json/i.test(r.ct) || /^\s*[[{]/.test(r.body)),
    );
    for (const r of jsonish.slice(0, 12)) {
      out(`   · JSON body of ${r.method} ${cut(r.url, 200)}`);
      out(indent(cut(r.body, jsonMax), '     | '));
    }
    const text = await page.evaluate(() => document.body?.innerText ?? '').catch(() => '');
    out(`   page text (${text.length} chars):`);
    out(indent(cut(text, textMax), '     | '));
    for (const g of grep) {
      const i = text.search(new RegExp(g, 'i'));
      if (i < 0) continue;
      out(`   around "${g}":`);
      out(indent(text.slice(Math.max(0, i - 200), i + 500), '     | '));
    }
  } catch (e) {
    out(`   ERROR: ${e.message.split('\n')[0]}`);
  } finally {
    await browser?.close();
  }
}

/** Type an amount into the first visible input so SPAs that quote on input fire their request. */
async function typeAmount(page) {
  const inputs = page.locator('input:visible');
  const n = await inputs.count();
  out(`   visible inputs: ${n}`);
  if (n === 0) return;
  await inputs.first().click({ timeout: 5000 }).catch(() => {});
  await inputs.first().fill('100').catch(() => {});
  await page.waitForTimeout(5000);
}

const B = 'https://api.bitopro.com/v3';
const ESUN = 'https://www.esunbank.com/zh-tw/personal/deposit/rate/forex/foreign-exchange-rates';
const GOLA = 'https://www.golavisa.co/exchange-rate';
const bnQuote = (host, fiat, side) =>
  `https://${host}/bapi/c2c/v1/public/c2c/agent/quote-price?fiat=${fiat}&asset=USDT&tradeType=${side}`;

async function env() {
  bar('runner egress');
  await probe('egress geo / network (ipinfo.io)', 'https://ipinfo.io/json', {
    origin: false,
    max: 600,
    pick: (j) => ({ country: j.country, region: j.region, org: j.org }),
  });
}

async function bitopro() {
  bar('BitoPro');
  await probe('ticker usdt_twd', `${B}/tickers/usdt_twd`);
  await probe('order-book usdt_twd limit=5', `${B}/order-book/usdt_twd?limit=5`);
  await probe('CORS preflight on order-book', `${B}/order-book/usdt_twd`, {
    method: 'OPTIONS',
    headers: {
      'access-control-request-method': 'GET',
      'access-control-request-headers': 'content-type',
    },
    max: 300,
  });
  await probe('OTC price usdt (candidate path)', `${B}/price/otc/usdt`);
  await probe('OTC price USDT (candidate path)', `${B}/price/otc/USDT`);
  await probe('trading-pairs: usdt_twd entry', `${B}/provisioning/trading-pairs`, {
    max: 1500,
    pick: (j) => (Array.isArray(j.data) ? j.data.filter((p) => /usdt_twd/i.test(p.pair)) : j),
  });
  await probe('limitations-and-fees (lines mentioning usdt/twd)', `${B}/provisioning/limitations-and-fees`, {
    max: 7000,
    grep: /usdt|twd/i,
  });
}

async function esun() {
  bar('E.SUN Bank');
  const html = await probe('rates page, plain GET', ESUN, {
    origin: false,
    headers: { accept: 'text/html,application/xhtml+xml' },
    max: 0,
  });
  htmlSummary(html, 1500);
  await probe(
    'candidate JSON API: ExchangeRate/LastRateInfo',
    'https://www.esunbank.com/api/client/ExchangeRate/LastRateInfo',
    { max: 3500 },
  );
  await capture('rates page in headless Chrome', ESUN, {
    textMax: 3500,
    grep: ['USD', '牌價', '更新', '即期'],
  });
}

async function binance() {
  bar('Binance C2C');
  for (const [fiat, side] of [
    ['VND', 'BUY'],
    ['VND', 'SELL'],
    ['CNY', 'BUY'],
    ['CNY', 'SELL'],
  ]) {
    await probe(
      `agent/quote-price www.binance.com fiat=${fiat} tradeType=${side}`,
      bnQuote('www.binance.com', fiat, side),
      { max: 900 },
    );
  }
  await probe(
    'agent/quote-price c2c.binance.com fiat=VND tradeType=BUY',
    bnQuote('c2c.binance.com', 'VND', 'BUY'),
    { max: 900 },
  );
  for (const side of ['BUY', 'SELL']) {
    await probe(
      `P2P adv/search VND ${side} (top 3 prices)`,
      'https://p2p.binance.com/bapi/c2c/v2/friendly/c2c/adv/search',
      {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          fiat: 'VND',
          page: 1,
          rows: 3,
          tradeType: side,
          asset: 'USDT',
          countries: [],
          proMerchantAds: false,
          shieldMerchantAds: false,
          filterType: 'tradable',
          periods: [],
          additionalKycVerifyFilter: 0,
          publisherType: null,
          payTypes: [],
          classifies: ['mass', 'profession'],
        }),
        max: 900,
        pick: (j) => ({
          code: j.code,
          total: j.total,
          prices: Array.isArray(j.data) ? j.data.map((d) => d.adv?.price) : j.data,
        }),
      },
    );
  }
  for (const p of ['sell/USDT/VND', 'buy/USDT/VND', 'buy/USDT/CNY', 'sell/USDT/CNY']) {
    await capture(`Express page ${p}`, `https://c2c.binance.com/en/express/${p}`, {
      textMax: 2000,
      grep: ['Estimated', 'Fee rate'],
      act: typeAmount,
    });
  }
}

async function golavisa() {
  bar('GolaVisa');
  const html = await probe('exchange-rate page, plain GET', GOLA, {
    origin: false,
    headers: { accept: 'text/html,application/xhtml+xml' },
    max: 0,
  });
  htmlSummary(html, 4000);
  await capture('exchange-rate page in headless Chrome', GOLA, {
    textMax: 4000,
    grep: ['USD', 'TWD', '更新', 'Cập nhật'],
  });
}

/** Local-only check of this script itself (SELFTEST_BASE points at a throwaway test server). */
async function selftest() {
  const base = process.env.SELFTEST_BASE;
  bar(`selftest against ${base}`);
  await probe('local json', `${base}/json`);
  await probe('local preflight', `${base}/json`, {
    method: 'OPTIONS',
    headers: { 'access-control-request-method': 'GET' },
    max: 200,
  });
  htmlSummary(await probe('local page', `${base}/page`, { origin: false, max: 0 }));
  await capture('local page in browser', `${base}/page`, {
    grep: ['rate'],
    act: typeAmount,
    settleMs: 1000,
  });
}

/** Round 2: follow-ups on what round 1 found. */
async function round2() {
  bar('round 2: follow-ups');

  // --- E.SUN: the JSON API the page itself calls (POST, empty body) ---
  const esunApi = 'https://www.esunbank.com/api/client/ExchangeRate/LastRateInfo?sc_lang=zh-TW';
  const decode = (s) => {
    const ms = Number(String(s).match(/-?\d+/)?.[0]);
    return Number.isFinite(ms) ? new Date(ms).toISOString() : s;
  };
  const pickEsun = (j) => {
    const rates = Array.isArray(j.Rates) ? j.Rates : [];
    const withTime = (r) => (r ? { ...r, UpdateTimeISO: decode(r.UpdateTime) } : null);
    return {
      DiscontFlag: j.DiscontFlag,
      topLevelKeys: Object.keys(j),
      count: rates.length,
      currencies: rates.map((r) => r.CCY),
      USD: withTime(rates.find((r) => r.CCY === 'USD/TWD')),
      CNY: withTime(rates.find((r) => r.CCY === 'CNY/TWD')),
    };
  };
  await probe('E.SUN LastRateInfo, POST with browser Origin (CORS view)', esunApi, {
    method: 'POST',
    headers: { 'content-type': 'application/json', referer: ESUN },
    body: '',
    max: 3500,
    pick: pickEsun,
  });
  await probe('E.SUN CORS preflight', esunApi, {
    method: 'OPTIONS',
    headers: {
      'access-control-request-method': 'POST',
      'access-control-request-headers': 'content-type',
    },
    max: 300,
  });
  await probe('E.SUN LastRateInfo, POST server-side style (no Origin)', esunApi, {
    method: 'POST',
    origin: false,
    headers: { 'content-type': 'application/json' },
    body: '',
    max: 300,
    pick: (j) => ({ count: j.Rates?.length, usd: j.Rates?.find((r) => r.CCY === 'USD/TWD') }),
  });

  // --- Binance: fee-rate and quoted-price APIs, first with plain fetch ---
  const bn = 'https://c2c.binance.com/bapi/c2c';
  for (const fiat of ['VND', 'CNY']) {
    await probe(`Binance commission-rate/taker ${fiat} (plain fetch)`, `${bn}/v1/friendly/c2c/commission-rate/taker`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ channel: 'c2c', area: 'express', asset: 'USDT', fiat }),
      max: 1200,
    });
  }
  for (const side of ['BUY', 'SELL']) {
    await probe(`Binance quoted-price VND ${side} (plain fetch)`, `${bn}/v2/public/c2c/adv/quoted-price`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ assets: ['USDT'], fiatCurrency: 'VND', tradeType: side, fromUserRole: 'USER' }),
      max: 1200,
    });
  }
  // ...and the same two calls exactly as the Express pages make them (full bodies).
  const mustRe = /quoted-price|commission-rate/;
  await capture('Express sell/USDT/VND: quoted-price + commission-rate bodies', 'https://c2c.binance.com/en/express/sell/USDT/VND', { must: mustRe, only: true });
  await capture('Express buy/USDT/CNY: quoted-price + commission-rate bodies', 'https://c2c.binance.com/en/express/buy/USDT/CNY', { must: mustRe, only: true });

  // --- BitoPro: full fee schedule structure (taker fees, deposit/withdraw fees) ---
  const explore = (j) => {
    const res = {};
    for (const [k, v] of Object.entries(j)) {
      if (!Array.isArray(v)) {
        res[k] = v;
        continue;
      }
      const hits = v.filter((x) => /usdt|twd/i.test(JSON.stringify(x)));
      res[k] = {
        count: v.length,
        sampleKeys: v[0] && typeof v[0] === 'object' ? Object.keys(v[0]) : typeof v[0],
        matches: (k === 'orderFeesAndLimitations'
          ? hits.filter((x) => /^usdt\/twd$/i.test(x.pair))
          : hits
        ).slice(0, 8),
      };
    }
    return res;
  };
  await probe('BitoPro limitations-and-fees: structure + usdt/twd entries', `${B}/provisioning/limitations-and-fees`, {
    max: 12000,
    pick: explore,
  });
}

const groups = { env, bitopro, esun, binance, golavisa, selftest, round2 };
const group = process.argv[2];
if (!groups[group]) {
  console.error(`usage: probe.mjs <${Object.keys(groups).join('|')}>`);
  process.exit(2);
}
await groups[group]();
out('\n[probe done]');
