import './style.css';
import { DIRECTIONS, calcRoutes, shortfall, type RouteResult } from './calc/routes.ts';
import { loadSnapshot } from './data.ts';
import { formatAge, formatTaipeiTime, fromTaipeiInput, toTaipeiInput } from './lib/format.ts';
import { freshness } from './lib/freshness.ts';
import { clearGola, loadGola, loadSettings, saveGola, saveSettings } from './lib/storage.ts';
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
import { fetchGolaFile, newerGola, parseGolaJson, validateGola } from './sources/golavisa.ts';
import { el } from './ui/dom.ts';

const REPO_URL = 'https://github.com/dennyhty/currency-exchange';
const REFRESH_MS = 30_000;

interface State {
  direction: Direction;
  amount: number;
  settings: Settings;
  gola: GolaRates | undefined;
  remoteGola: GolaRates | null;
  liveBitopro: BitoproRates | undefined;
  liveBinance: BinanceRates | undefined;
  snapshot: Snapshot | null;
  errors: Partial<Record<'bitopro' | 'binance' | 'snapshot' | 'gola', string>>;
  loading: boolean;
  now: number;
}

const state: State = {
  direction: 'TWD>VND',
  amount: DIRECTIONS['TWD>VND'].defaultAmount,
  settings: loadSettings(),
  gola: loadGola(),
  remoteGola: null,
  liveBitopro: undefined,
  liveBinance: undefined,
  snapshot: null,
  errors: {},
  loading: false,
  now: Date.now(),
};

/** Live browser data wins; the published snapshot is only a fallback. */
function marketData(): MarketData {
  const s = state.snapshot;
  return {
    bitopro: state.liveBitopro ?? s?.bitopro,
    binance: state.liveBinance ?? s?.binance,
    esun: s?.esun,
    binanceFees: s?.binanceFees,
    gola: newerGola(state.gola, state.remoteGola),
  };
}

/** When the number was true: the source's own time if it gives one, else when we fetched it. */
function stampOf(md: MarketData, id: SourceId): number | null {
  switch (id) {
    case 'bitopro':
      return md.bitopro?.fetchedAt ?? null;
    case 'binance':
      return md.binance?.fetchedAt ?? null;
    case 'binanceFees':
      return md.binanceFees?.fetchedAt ?? null;
    case 'esun':
      return md.esun ? (md.esun.sourceUpdatedAt ?? md.esun.fetchedAt) : null;
    case 'gola':
      return md.gola ? (md.gola.updatedAt ?? md.gola.enteredAt) : null;
  }
}

const SOURCE_NAME: Record<SourceId, string> = {
  bitopro: 'BitoPro',
  binance: 'Binance Express',
  binanceFees: 'Binance 費率',
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
  const marker =
    id === 'bitopro' || id === 'binance'
      ? (id === 'bitopro' ? state.liveBitopro : state.liveBinance)
        ? ''
        : '・快照'
      : '';
  return el('span', {
    className: `badge ${level}`,
    text: `${label}${marker}`,
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
    ['bitopro', md.bitopro ? `買 ${md.bitopro.ask}／賣 ${md.bitopro.bid} TWD` : '—'],
    [
      'binance',
      md.binance
        ? `VND 買 ${nf(md.binance.VND.buy, 0)}／賣 ${nf(md.binance.VND.sell, 0)}；CNY 買 ${md.binance.CNY.buy}／賣 ${md.binance.CNY.sell}`
        : '—',
    ],
    ['esun', md.esun ? `銀行買入 ${md.esun.bankBuy}／賣出 ${md.esun.bankSell} TWD` : '—'],
    [
      'gola',
      md.gola
        ? `${md.gola.origin === 'remote' ? '自動' : '手動'}・TWD ${md.gola.twdToVnd}／${md.gola.vndToTwd}；USD ${nf(md.gola.usdToVnd, 0)}／${nf(md.gola.vndToUsd, 0)} VND`
        : '請在下方手動輸入',
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

// ---------- GolaVisa manual input ----------

function golaForm(onChange: () => void): HTMLElement {
  const field = (label: string, value: number | undefined): [HTMLElement, HTMLInputElement] => {
    const input = el('input', {
      attrs: {
        type: 'number',
        inputmode: 'decimal',
        step: 'any',
        min: '0',
        placeholder: '1 外幣 = ? VND',
      },
    });
    if (value !== undefined) input.value = String(value);
    return [el('label', {}, [el('span', { text: label }), input]), input];
  };
  const g = state.gola;
  const [l1, twdIn] = field('TWD → VND（1 TWD 換到）', g?.twdToVnd);
  const [l2, twdOut] = field('VND → TWD（1 TWD 要付）', g?.vndToTwd);
  const [l3, usdIn] = field('USD → VND（1 USD 換到）', g?.usdToVnd);
  const [l4, usdOut] = field('VND → USD（1 USD 要付）', g?.vndToUsd);
  const time = el('input', { attrs: { type: 'datetime-local' } });
  if (g?.updatedAt) time.value = toTaipeiInput(g.updatedAt);
  const message = el('p', { className: 'muted' });
  const paste = el('textarea', {
    attrs: {
      rows: '3',
      placeholder: '把 https://www.golavisa.co/api/exchange-rates 的內容整個貼在這裡',
    },
  });

  const fill = (v: GolaRates): void => {
    twdIn.value = String(v.twdToVnd);
    twdOut.value = String(v.vndToTwd);
    usdIn.value = String(v.usdToVnd);
    usdOut.value = String(v.vndToUsd);
    time.value = v.updatedAt ? toTaipeiInput(v.updatedAt) : '';
  };
  const save = el('button', { text: '儲存', attrs: { type: 'button' } });
  save.addEventListener('click', () => {
    try {
      const v = validateGola({
        twdToVnd: Number(twdIn.value),
        vndToTwd: Number(twdOut.value),
        usdToVnd: Number(usdIn.value),
        vndToUsd: Number(usdOut.value),
        updatedAt: fromTaipeiInput(time.value),
        enteredAt: Date.now(),
      });
      saveGola(v);
      state.gola = v;
      message.textContent = v.updatedAt
        ? '已儲存。'
        : '已儲存。（沒填更新時間，會用現在的時間當作輸入時間）';
      onChange();
    } catch (e) {
      message.textContent = `沒有儲存：${e instanceof Error ? e.message : String(e)}`;
    }
  });
  const clear = el('button', { text: '清除', className: 'secondary', attrs: { type: 'button' } });
  clear.addEventListener('click', () => {
    clearGola();
    state.gola = undefined;
    for (const i of [twdIn, twdOut, usdIn, usdOut, time]) i.value = '';
    message.textContent = '已清除。';
    onChange();
  });
  const parse = el('button', {
    text: '解析並填入',
    className: 'secondary',
    attrs: { type: 'button' },
  });
  parse.addEventListener('click', () => {
    try {
      fill(parseGolaJson(paste.value));
      message.textContent = '已填入，請確認後按「儲存」。';
    } catch (e) {
      message.textContent = `無法解析：${e instanceof Error ? e.message : String(e)}`;
    }
  });

  return el('details', { className: 'card' }, [
    el('summary', { text: 'GolaVisa 匯率（手動輸入）' }),
    el('p', {
      className: 'muted',
      text: 'GolaVisa 網站不允許自動抓取。請在自己的瀏覽器打開網站取得數字，資料只存在這台裝置的瀏覽器。數字單位都是「1 外幣 = N VND」。',
    }),
    el('div', { className: 'grid' }, [l1, l2, l3, l4]),
    el('label', {}, [el('span', { text: '網站標示的更新時間（台北時間）' }), time]),
    el('div', { className: 'row' }, [save, clear]),
    el('details', {}, [
      el('summary', { text: '用貼上 JSON 自動填欄位' }),
      paste,
      el('div', { className: 'row' }, [parse]),
    ]),
    message,
  ]);
}

// ---------- settings ----------

function settingsForm(onChange: () => void): HTMLElement {
  const mode = el('select', {}, [
    el('option', { text: '掛單簿（最佳賣價／買價）', attrs: { value: 'orderbook' } }),
    el('option', { text: '一鍵買賣（OTC 報價）', attrs: { value: 'otc' } }),
  ]);
  mode.value = state.settings.bitoproMode;
  const fee = el('input', {
    attrs: { type: 'number', inputmode: 'decimal', step: '0.01', min: '0', max: '5' },
  });
  fee.value = String(state.settings.bitoproFee * 100);
  const apply = (): void => {
    const f = Number(fee.value) / 100;
    state.settings = {
      bitoproMode: mode.value === 'otc' ? 'otc' : 'orderbook',
      bitoproFee: Number.isFinite(f) && f >= 0 && f <= 0.05 ? f : 0,
    };
    saveSettings(state.settings);
    onChange();
  };
  mode.addEventListener('change', apply);
  fee.addEventListener('input', apply);
  return el('details', { className: 'card' }, [
    el('summary', { text: '設定' }),
    el('label', {}, [el('span', { text: 'BitoPro 使用的價格' }), mode]),
    el('label', {}, [el('span', { text: 'BitoPro 手續費（%，預設 0）' }), fee]),
    el('p', {
      className: 'muted',
      text: 'BitoPro 掛單吃單預設等級：maker 0.1%／taker 0.2%（用 BITO 抵扣 0.08%／0.16%）。Binance 手續費由排程抓取（VND 0.1%、CNY 0）。',
    }),
  ]);
}

// ---------- page ----------

function build(root: HTMLElement): void {
  const results = el('div', { className: 'results' });
  const status = el('div');
  const rerender = (): void => {
    state.now = Date.now();
    renderResults(results);
    renderStatus(status);
  };

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
  const refresh = async (): Promise<void> => {
    if (state.loading) return;
    state.loading = true;
    refreshBtn.disabled = true;
    refreshBtn.textContent = '更新中…';
    const [b, x, s, rg] = await Promise.allSettled([
      fetchBitopro(),
      fetchBinanceQuotes(),
      loadSnapshot(),
      fetchGolaFile(),
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
    state.loading = false;
    refreshBtn.disabled = false;
    refreshBtn.textContent = '重新整理';
    rerender();
  };
  refreshBtn.addEventListener('click', () => void refresh());

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
      el('section', { className: 'card' }, [
        el('div', { className: 'row between' }, [el('h2', { text: '資料來源' }), refreshBtn]),
        status,
      ]),
      golaForm(rerender),
      settingsForm(rerender),
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
