import { el } from './dom.ts';

const SVG_NS = 'http://www.w3.org/2000/svg';

export interface ChartSeries {
  id: string;
  label: string;
}

export interface ChartPoint {
  date: string; // YYYY-MM-DD (Taipei)
  values: Record<string, number | null>;
}

interface Options {
  series: ChartSeries[];
  points: ChartPoint[];
  format: (n: number) => string;
  /** Accessible summary of what is plotted. */
  label: string;
}

function svg<K extends keyof SVGElementTagNameMap>(
  tag: K,
  attrs: Record<string, string | number> = {},
): SVGElementTagNameMap[K] {
  const node = document.createElementNS(SVG_NS, tag);
  for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, String(v));
  return node;
}

const dayMs = (date: string): number => Date.parse(`${date}T00:00:00+08:00`);
const shortDate = (date: string): string => date.slice(5).replace('-', '/');

/** Round step for about `count` gridlines. */
function niceTicks(min: number, max: number, count = 4): number[] {
  const raw = (max - min) / count;
  const mag = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((s) => s >= raw) ?? raw;
  const ticks: number[] = [];
  for (let v = Math.ceil(min / step) * step; v <= max + step * 1e-9; v += step) {
    ticks.push(Number(v.toPrecision(12)));
  }
  return ticks;
}

/** Line chart with legend, crosshair tooltip (pointer and arrow keys) and a table view. */
export function lineChart(opts: Options): HTMLElement {
  const { series, points, format } = opts;
  const colorOf = (i: number): string => `var(--series-${i + 1})`;

  const legend = el('ul', { className: 'legend' });
  if (series.length >= 2) {
    series.forEach((s, i) => {
      const key = el('span', { className: 'key' });
      key.style.background = colorOf(i);
      legend.append(el('li', {}, [key, el('span', { text: s.label })]));
    });
  }

  const plot = el('div', { className: 'plot' });
  const tip = el('div', { className: 'tip', attrs: { role: 'status', 'aria-live': 'polite' } });
  tip.hidden = true;
  plot.append(tip);

  const H = 220;
  const M = { top: 12, right: 16, bottom: 28, left: 56 };
  let current = -1;
  let draw: (() => void) | null = null;

  const render = (): void => {
    const W = Math.max(plot.clientWidth, 280);
    plot.querySelector('svg')?.remove();
    const root = svg('svg', {
      width: W,
      height: H,
      viewBox: `0 0 ${W} ${H}`,
      tabindex: 0,
      role: 'img',
      'aria-label': opts.label,
    });

    const xs = points.map((p) => dayMs(p.date));
    const x0 = xs[0] ?? 0;
    const x1 = xs[xs.length - 1] ?? 1;
    const all = points
      .flatMap((p) => series.map((s) => p.values[s.id]))
      .filter((v): v is number => v !== null && v !== undefined);
    let lo = Math.min(...all);
    let hi = Math.max(...all);
    const pad = (hi - lo) * 0.08 || Math.abs(hi) * 0.005 || 1;
    lo -= pad;
    hi += pad;
    const px = (t: number): number =>
      x1 === x0
        ? (M.left + W - M.right) / 2
        : M.left + ((t - x0) / (x1 - x0)) * (W - M.left - M.right);
    const py = (v: number): number => M.top + ((hi - v) / (hi - lo)) * (H - M.top - M.bottom);

    const xp = xs.map(px);
    const xAt = (i: number): number => xp[i] ?? M.left;

    // grid + y labels
    for (const t of niceTicks(lo, hi)) {
      const y = py(t);
      root.append(svg('line', { x1: M.left, x2: W - M.right, y1: y, y2: y, class: 'grid' }));
      const label = svg('text', { x: M.left - 8, y: y + 4, 'text-anchor': 'end', class: 'axis' });
      label.textContent = format(t);
      root.append(label);
    }
    // x labels: first and last day (one label when there is a single day)
    const xLabels = points.length > 1 ? [0, points.length - 1] : [0];
    for (const i of xLabels) {
      const anchor = points.length === 1 ? 'middle' : i === 0 ? 'start' : 'end';
      const label = svg('text', { x: xAt(i), y: H - 8, 'text-anchor': anchor, class: 'axis' });
      label.textContent = shortDate(points[i]?.date ?? '');
      root.append(label);
    }

    // lines, broken where a day has no value; isolated days get a dot
    series.forEach((s, si) => {
      let d = '';
      points.forEach((p, i) => {
        const v = p.values[s.id];
        if (v === null || v === undefined) return;
        const prev = points[i - 1]?.values[s.id];
        const next = points[i + 1]?.values[s.id];
        const cmd = prev === null || prev === undefined ? 'M' : 'L';
        d += `${cmd}${xAt(i).toFixed(1)},${py(v).toFixed(1)}`;
        if ((prev === null || prev === undefined) && (next === null || next === undefined)) {
          root.append(svg('circle', { cx: xAt(i), cy: py(v), r: 4, fill: colorOf(si) }));
        }
      });
      if (d) root.append(svg('path', { d, class: 'line', stroke: colorOf(si) }));
    });

    // crosshair layer
    const cross = svg('line', {
      y1: M.top,
      y2: H - M.bottom,
      class: 'cross',
      visibility: 'hidden',
    });
    const dots = series.map((_, si) =>
      svg('circle', { r: 4, fill: colorOf(si), class: 'dot', visibility: 'hidden' }),
    );
    root.append(cross, ...dots);

    draw = (): void => {
      if (current < 0 || current >= points.length) {
        cross.setAttribute('visibility', 'hidden');
        dots.forEach((dot) => dot.setAttribute('visibility', 'hidden'));
        tip.hidden = true;
        return;
      }
      const p = points[current];
      if (!p) return;
      const x = xAt(current);
      cross.setAttribute('x1', String(x));
      cross.setAttribute('x2', String(x));
      cross.setAttribute('visibility', 'visible');
      const rows: HTMLElement[] = [el('div', { className: 'tip-date', text: p.date })];
      series.forEach((s, si) => {
        const v = p.values[s.id];
        const dot = dots[si];
        if (v === null || v === undefined) {
          dot?.setAttribute('visibility', 'hidden');
        } else {
          dot?.setAttribute('cx', String(x));
          dot?.setAttribute('cy', String(py(v)));
          dot?.setAttribute('visibility', 'visible');
        }
        const key = el('span', { className: 'key' });
        key.style.background = colorOf(si);
        rows.push(
          el('div', { className: 'tip-row' }, [
            key,
            el('strong', { text: v === null || v === undefined ? '—' : format(v) }),
            el('span', { text: s.label }),
          ]),
        );
      });
      tip.replaceChildren(...rows);
      tip.hidden = false;
      const w = tip.offsetWidth; // flip to the left of the crosshair near the right edge
      tip.style.left = `${x + 12 + w > W ? Math.max(x - 12 - w, 0) : x + 12}px`;
    };

    const nearest = (clientX: number): number => {
      const box = root.getBoundingClientRect();
      const x = clientX - box.left;
      let best = 0;
      xp.forEach((t, i) => {
        if (Math.abs(t - x) < Math.abs(xAt(best) - x)) best = i;
      });
      return best;
    };
    root.addEventListener('pointermove', (e) => {
      current = nearest(e.clientX);
      draw?.();
    });
    root.addEventListener('pointerleave', () => {
      current = -1;
      draw?.();
    });
    root.addEventListener('focus', () => {
      if (current < 0) current = points.length - 1;
      draw?.();
    });
    root.addEventListener('blur', () => {
      current = -1;
      draw?.();
    });
    root.addEventListener('keydown', (e) => {
      if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
      e.preventDefault();
      const step = e.key === 'ArrowLeft' ? -1 : 1;
      current = Math.min(Math.max(current + step, 0), points.length - 1);
      draw?.();
    });

    plot.prepend(root);
    draw();
  };

  // table view: every value without hovering, newest first
  const table = el('table');
  const head = el('tr', {}, [el('th', { text: '日期' })]);
  for (const s of series) head.append(el('th', { text: s.label }));
  table.append(el('thead', {}, [head]));
  const body = el('tbody');
  for (const p of [...points].reverse()) {
    const row = el('tr', {}, [el('td', { text: p.date })]);
    for (const s of series) {
      const v = p.values[s.id];
      row.append(el('td', { text: v === null || v === undefined ? '—' : format(v) }));
    }
    body.append(row);
  }
  table.append(body);

  const wrap = el('div', { className: 'chart' }, [
    legend,
    plot,
    el('details', { className: 'table-view' }, [
      el('summary', { text: '表格檢視' }),
      el('div', { className: 'table-scroll' }, [table]),
    ]),
  ]);

  const observer = new ResizeObserver(() => {
    if (!plot.isConnected) observer.disconnect();
    else render();
  });
  observer.observe(plot);
  return wrap;
}
