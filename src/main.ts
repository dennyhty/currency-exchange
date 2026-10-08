import './style.css';
import { formatTaipeiTime } from './lib/format';

const REPO_URL = 'https://github.com/dennyhty/currency-exchange';

/** Routes the finished panel will compare (see docs/PLAN.md §4). */
const PLANNED_ROUTES: ReadonlyArray<{ direction: string; methods: string }> = [
  { direction: 'TWD → VND', methods: '經 USDT／經 USD／GolaVisa 直換' },
  { direction: 'VND → TWD', methods: '經 USDT／經 USD／GolaVisa 直換' },
  { direction: 'CNY → VND', methods: '經 USDT' },
  { direction: 'VND → CNY', methods: '經 USDT' },
];

function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  options: { className?: string; text?: string } = {},
  children: Node[] = [],
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (options.className) node.className = options.className;
  if (options.text !== undefined) node.textContent = options.text;
  node.append(...children);
  return node;
}

function renderApp(root: HTMLElement): void {
  const header = el('header', {}, [
    el('h1', { text: '換匯比較面板' }),
    el('p', { className: 'lead', text: 'TWD／CNY ⇄ VND：經 USDT、經 USD 或直換，哪個最划算' }),
  ]);

  const status = el('section', { className: 'card' }, [
    el('h2', { text: '建置中' }),
    el('p', {
      text: '網站骨架與自動部署已就緒；匯率資料與計算還沒接上。進度記錄在專案的 CLAUDE.md。',
    }),
  ]);

  const routes = el('section', { className: 'card' }, [
    el('h2', { text: '預計比較的路徑' }),
    el(
      'ul',
      { className: 'routes' },
      PLANNED_ROUTES.map((r) =>
        el('li', {}, [el('strong', { text: r.direction }), el('span', { text: r.methods })]),
      ),
    ),
  ]);

  const link = el('a', { text: 'GitHub' });
  link.href = REPO_URL;
  link.rel = 'noopener';
  const footer = el('footer', {}, [
    el('p', {
      className: 'build',
      text: `版本 ${__BUILD_SHA__} ・ 建置於 ${formatTaipeiTime(__BUILD_TIME__)}（台北時間） ・ `,
    }),
  ]);
  footer.querySelector('p')?.append(link);

  root.replaceChildren(el('main', { className: 'page' }, [header, status, routes, footer]));
}

const app = document.querySelector<HTMLElement>('#app');
if (!app) throw new Error('#app not found');
renderApp(app);
