import './style.css';
import {
  DEFAULT_SETTINGS,
  DIRECTIONS,
  calcRoutes,
  shortfall,
  type RouteResult,
} from './calc/routes.ts';
import { loadSnapshot } from './data.ts';
import { fetchHistory, historySeries, taipeiDate, type HistoryFile } from './lib/history.ts';
import { formatAge, formatTaipeiTime } from './lib/format.ts';
import { freshness } from './lib/freshness.ts';
import type {
  BinanceRates,
  BitoproRates,
  Direction,
  GolaRates,
  MarketData,
  Settings,
  Snapshot,
  SourceId,
} from './lib/types.ts';
import { fetchBinanceQuotes } from './sources/binance.ts';
import { fetchBitopro } from './sources/bitopro.ts';
import { fetchGolaFile } from './sources/golavisa.ts';
import { lineChart } from './ui/chart.ts';
import { el } from './ui/dom.ts';

const REPO_URL = 'https://github.com/dennyhty/currency-exchange';
const REFRESH_MS = 30_000;

interface State {
  direction: Direction;
  amount: number;
  settings: Settings;
  remoteGola: GolaRates | null;
  liveBitopro: BitoproRates | undefined;
  liveBinance: BinanceRates | undefined;
  snapshot: Snapshot | null;
  history: HistoryFile | null;
  /** Days shown in the trend chart; 0 = everything recorded. */
  trendDays: number;
  errors: Partial<Record<'bitopro' | 'binance' | 'snapshot' | 'gola' | 'history', string>>;
  loading: boolean;
  now: number;
}

const state: State = {
  direction: 'TWD>VND',
  amount: DIRECTIONS['TWD>VND'].defaultAmount,
  settings: DEFAULT_SETTINGS,
  remoteGola: null,
  liveBitopro: undefined,
  liveBinance: undefined,
  snapshot: null,
  history: null,
  trendDays: 90,
  errors: {},
  loading: false,
  now: Date.now(),
};

/** BitoPro and Binance come live from the browser; E.SUN comes from the daily snapshot. */
function marketData(): MarketData {
  const s = state.snapshot;
  return {
    bitopro: state.liveBitopro,
    binance: state.liveBinance,
    esun: s?.esun,
    gola: state.remoteGola ?? undefined,
  };
}

/** When the number was true: the source's own time if it gives one, else when we fetched it. */
function stampOf(md: MarketData, id: SourceId): number | null {
  switch (id) {
    case 'bitopro':
      return md.bitopro?.fetchedAt ?? null;
    case 'binance':
      return md.binance?.fetchedAt ?? null;
    case 'esun':
      return md.esun ? (md.esun.sourceUpdatedAt ?? md.esun.fetchedAt) : null;
    case 'gola':
      return md.gola ? (md.gola.updatedAt ?? md.gola.enteredAt) : null;
  }
}

const SOURCE_NAME: Record<SourceId, string> = {
  bitopro: 'BitoPro',
  binance: 'Binance Express',
  esun: '玉山即期',
  gola: 'GolaVisa',
};

const nf = (n: number, digits: number): string =>
  n.toLocaleString('zh-TW', { minimumFractionDigits: digits, maximumFractionDigits: digits });
const money = (n: number, cur: string, digits = cur === 'VND' ? 0 : 2): string =>
  `${nf(n, digits)} ${cur}`;

function badge(md: MarketData, id: SourceId): HTMLElement {
  const stamp = stampOf(md, id);
  if (stamp === null) return el('span', { className: 'badge missing', text: '無資料' });
  const level = freshness(id, state.now - stamp);
  const label = formatAge(stamp, state.now);
  return el('span', {
    className: `badge ${level}`,
    text: label,
    attrs: { title: `資料時間 ${formatTaipeiTime(stamp)}（台北）` },
  });
}

// ---------- results ----------

function renderRoute(r: RouteResult, best: number | null, md: MarketData): HTMLElement {
  const { from, to } = DIRECTIONS[state.direction];
  const isBest = r.output !== null && best !== null && r.output === best;
  const card = el('article', {
    className: `card route${isBest ? ' best' : ''}${r.output === null ? ' na' : ''}`,
  });
  card.append(el('h3', { text: `${isBest ? '🏆 ' : ''}${r.title}` }));

  if (r.output === null) {
    card.append(el('p', { className: 'muted', text: `資料不足：${r.missing.join('、')}` }));
    return card;
  }
  card.append(el('p', { className: 'out', text: `≈ ${money(r.output, to)}` }));
  const perUnit =
    from === 'VND'
      ? `每 100 萬 VND ≈ ${money((r.output / state.amount) * 1_000_000, to, 2)}`
      : `1 ${from} ≈ ${money(r.output / state.amount, to, 2)}`;
  card.append(el('p', { className: 'muted', text: perUnit }));
  if (!isBest && best !== null) {
    card.append(
      el('p', { className: 'diff', text: `比最佳少 ${nf(shortfall(r.output, best) * 100, 2)}%` }),
    );
  }
  const stale = r.legs.some((l) => {
    const t = stampOf(md, l.source);
    return t !== null && freshness(l.source, state.now - t) === 'stale';
  });
  const legs = el('ul', { className: 'legs' });
  for (const l of r.legs) {
    legs.append(el('li', {}, [el('span', { text: l.text }), badge(md, l.source)]));
  }
  card.append(legs);
  if (stale)
    card.append(el('p', { className: 'warn', text: '⚠ 含過期資料，請先更新或確認來源。' }));
  return card;
}

function renderResults(container: HTMLElement): void {
  const md = marketData();
  if (!(state.amount > 0)) {
    container.replaceChildren(el('p', { className: 'muted', text: '請輸入大於 0 的金額。' }));
    return;
  }
  const routes = calcRoutes(state.direction, state.amount, md, state.settings);
  const best = routes.find((r) => r.output !== null)?.output ?? null;
  container.replaceChildren(...routes.map((r) => renderRoute(r, best, md)));
}

function renderStatus(container: HTMLElement): void {
  const md = marketData();
  const rows: Array<[SourceId, string]> = [
    ['bitopro', md.bitopro ? `USDT 你買／你賣：${md.bitopro.ask}／${md.bitopro.bid} TWD` : '—'],
    [
      'binance',
      md.binance
        ? `USDT 你買／你賣：${nf(md.binance.VND.buy, 0)}／${nf(md.binance.VND.sell, 0)} VND、${md.binance.CNY.buy}／${md.binance.CNY.sell} CNY`
        : '—',
    ],
    ['esun', md.esun ? `USD 你買／你賣：${md.esun.bankSell}／${md.esun.bankBuy} TWD` : '—'],
    [
      'gola',
      md.gola
        ? `1 TWD 換到／要付：${md.gola.twdToVnd}／${md.gola.vndToTwd} VND；1 USD 換到／要付：${nf(md.gola.usdToVnd, 0)}／${nf(md.gola.vndToUsd, 0)} VND`
        : '尚無資料（需執行 /update-golavisa）',
    ],
  ];
  const list = el('ul', { className: 'status' });
  for (const [id, summary] of rows) {
    list.append(
      el('li', {}, [
        el('strong', { text: SOURCE_NAME[id] }),
        el('span', { className: 'muted', text: summary }),
        badge(md, id),
      ]),
    );
  }
  const errs = Object.entries(state.errors).map(([k, v]) => `${k}：${v}`);
  container.replaceChildren(
    list,
    ...(errs.length
      ? [el('p', { className: 'warn', text: `抓取失敗（改用快照或無資料）— ${errs.join('；')}` })]
      : []),
  );
}

// ---------- trend ----------

const TREND_RANGES = [
  { label: '30 天', days: 30 },
  { label: '90 天', days: 90 },
  { label: '全部', days: 0 },
];

const TREND_LABEL: Record<string, string> = {
  usdt: '經 USDT',
  usd: '經 USD',
  direct: 'GolaVisa 直換',
};

/** Daily history from the `data` branch, recalculated with the current settings. */
function renderTrend(container: HTMLElement): void {
  const { from, to } = DIRECTIONS[state.direction];
  const fromVnd = from === 'VND';
  const unit = fromVnd ? to : from;
  const entries = state.history?.entries ?? [];
  const since = state.trendDays ? taipeiDate(state.now - state.trendDays * 86_400_000) : '';
  const { series, points } = historySeries(
    entries.filter((e) => e.date > since),
    state.direction,
    state.settings,
  );
  const parts: Node[] = [
    el('p', {
      className: 'muted',
      text: fromVnd
        ? `換 1 ${unit} 要付多少 VND（越低越好）・每天台北 09:00 記錄一筆`
        : `1 ${unit} 換到多少 VND（越高越好）・每天台北 09:00 記錄一筆`,
    }),
  ];
  if (state.errors.history) {
    parts.push(el('p', { className: 'warn', text: `歷史資料讀取失敗：${state.errors.history}` }));
  } else if (series.length === 0) {
    parts.push(
      el('p', {
        className: 'muted',
        text: entries.length
          ? '這段期間沒有可用的資料。'
          : '還沒有歷史資料，第一筆會在下一次排程（台北 09:00）記錄。',
      }),
    );
  } else {
    const digits = unit === 'TWD' ? 2 : 0;
    parts.push(
      lineChart({
        series: series.map((s) => ({ id: s.id, label: TREND_LABEL[s.id] ?? s.title })),
        points,
        format: (n) => nf(n, digits),
        label: `${state.direction} 各路徑每日匯率走勢，${points.length} 天`,
      }),
    );
    if ((from === 'TWD' || to === 'TWD') && series.length === 1) {
      parts.push(
        el('p', {
          className: 'muted',
          text: '經 USD 與直換需要 GolaVisa 的更新檔（在你的電腦執行 /update-golavisa 發佈）。',
        }),
      );
    }
  }
  container.replaceChildren(...parts);
}

// ---------- page ----------

function build(root: HTMLElement): void {
  const results = el('div', { className: 'results' });
  const status = el('div');
  const trend = el('div');
  let trendKey = '';
  const rerender = (): void => {
    state.now = Date.now();
    renderResults(results);
    renderStatus(status);
    // the chart only changes with its inputs, not with the 30-second live refresh
    const h = state.history?.entries;
    const key = JSON.stringify([
      state.direction,
      state.settings,
      state.trendDays,
      h?.length,
      h?.[h.length - 1]?.at,
      state.errors.history,
      taipeiDate(state.now),
    ]);
    if (key !== trendKey) {
      trendKey = key;
      renderTrend(trend);
    }
  };

  const rangeBar = el('div', {
    className: 'ranges',
    attrs: { role: 'group', 'aria-label': '期間' },
  });
  const rangeButtons = TREND_RANGES.map(({ label, days }) => {
    const b = el('button', { text: label, className: 'range', attrs: { type: 'button' } });
    b.addEventListener('click', () => {
      state.trendDays = days;
      syncRanges();
      rerender();
    });
    rangeBar.append(b);
    return { b, days };
  });
  const syncRanges = (): void => {
    for (const { b, days } of rangeButtons) {
      b.setAttribute('aria-pressed', String(days === state.trendDays));
    }
  };
  syncRanges();

  const dirButtons = new Map<Direction, HTMLButtonElement>();
  const amount = el('input', {
    attrs: { type: 'text', inputmode: 'decimal', 'aria-label': '金額' },
  });
  const unit = el('span', { className: 'unit' });
  const syncControls = (): void => {
    for (const [d, b] of dirButtons) b.setAttribute('aria-pressed', String(d === state.direction));
    unit.textContent = DIRECTIONS[state.direction].from;
    amount.value = nf(state.amount, 0);
  };
  const dirBar = el('div', {
    className: 'dirs',
    attrs: { role: 'group', 'aria-label': '換匯方向' },
  });
  for (const d of Object.keys(DIRECTIONS) as Direction[]) {
    const b = el('button', {
      text: d.replace('>', ' → '),
      className: 'dir',
      attrs: { type: 'button' },
    });
    b.addEventListener('click', () => {
      state.direction = d;
      state.amount = DIRECTIONS[d].defaultAmount;
      syncControls();
      rerender();
    });
    dirButtons.set(d, b);
    dirBar.append(b);
  }
  amount.addEventListener('input', () => {
    state.amount = Number(amount.value.replace(/[,\s]/g, ''));
    rerender();
  });
  amount.addEventListener('blur', syncControls);

  const refreshBtn = el('button', {
    text: '重新整理',
    className: 'secondary',
    attrs: { type: 'button' },
  });
  let historyLoaded = false; // null (nothing recorded yet) counts as loaded
  const refresh = async (manual = false): Promise<void> => {
    if (state.loading) return;
    state.loading = true;
    refreshBtn.disabled = true;
    refreshBtn.textContent = '更新中…';
    const [b, x, s, rg, h] = await Promise.allSettled([
      fetchBitopro(),
      fetchBinanceQuotes(),
      loadSnapshot(),
      fetchGolaFile(),
      // the history changes once a day: fetch it on load and on the refresh button only
      historyLoaded && !manual ? Promise.resolve(state.history) : fetchHistory(),
    ]);
    const msg = (r: PromiseRejectedResult): string =>
      r.reason instanceof Error ? r.reason.message : String(r.reason);
    state.errors = {};
    if (b.status === 'fulfilled') state.liveBitopro = b.value;
    else state.errors.bitopro = msg(b);
    if (x.status === 'fulfilled') state.liveBinance = x.value;
    else state.errors.binance = msg(x);
    if (s.status === 'fulfilled') state.snapshot = s.value;
    else state.errors.snapshot = msg(s);
    if (rg.status === 'fulfilled') state.remoteGola = rg.value;
    else state.errors.gola = msg(rg);
    if (h.status === 'fulfilled') {
      state.history = h.value;
      historyLoaded = true;
    } else state.errors.history = msg(h);
    state.loading = false;
    refreshBtn.disabled = false;
    refreshBtn.textContent = '重新整理';
    rerender();
  };
  refreshBtn.addEventListener('click', () => void refresh(true));

  const link = el('a', { text: 'GitHub', attrs: { href: REPO_URL, rel: 'noopener' } });
  root.replaceChildren(
    el('main', { className: 'page' }, [
      el('header', {}, [
        el('h1', { text: '換匯比較面板' }),
        el('p', { className: 'lead', text: 'TWD／CNY ⇄ VND：經 USDT、經 USD 或直換，哪個最划算' }),
      ]),
      dirBar,
      el('div', { className: 'amount' }, [amount, unit]),
      results,
      el('section', { className: 'card trend' }, [
        el('div', { className: 'row between' }, [el('h2', { text: '歷史走勢' }), rangeBar]),
        trend,
      ]),
      el('section', { className: 'card' }, [
        el('div', { className: 'row between' }, [el('h2', { text: '資料來源' }), refreshBtn]),
        status,
      ]),
      el('footer', {}, [
        el('p', {
          text: 'Binance 的價格是「預估價」（買價可能低於賣價），實際成交可能較差，請以下單頁面為準。結果不含銀行匯款費、USDT 提領網路費與滑價，僅供參考。',
        }),
        el(
          'p',
          {
            className: 'build',
            text: `版本 ${__BUILD_SHA__} ・ 建置於 ${formatTaipeiTime(__BUILD_TIME__)}（台北時間） ・ `,
          },
          [link],
        ),
      ]),
    ]),
  );
  syncControls();
  rerender();
  void refresh();
  setInterval(() => {
    if (document.visibilityState === 'visible') void refresh();
    else rerender();
  }, REFRESH_MS);
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') void refresh();
  });
}

const app = document.querySelector<HTMLElement>('#app');
if (!app) throw new Error('#app not found');
build(app);
