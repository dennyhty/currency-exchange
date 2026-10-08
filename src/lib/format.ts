const taipei = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Asia/Taipei',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
});

const NO_VALUE = '—';

type TimeInput = string | number | Date;

/** "2026-10-08T08:30:00Z" → "2026-10-08 16:30" (Asia/Taipei). Invalid input → "—". */
export function formatTaipeiTime(input: TimeInput): string {
  const d = new Date(input);
  if (Number.isNaN(d.getTime())) return NO_VALUE;
  const part = (type: Intl.DateTimeFormatPartTypes): string =>
    taipei.formatToParts(d).find((p) => p.type === type)?.value ?? '';
  return `${part('year')}-${part('month')}-${part('day')} ${part('hour')}:${part('minute')}`;
}

/** Human-readable age of a data point: 剛剛 / N 分鐘前 / N 小時前 / N 天前. Invalid input → "—". */
export function formatAge(from: TimeInput, now: TimeInput = Date.now()): string {
  const diffMs = new Date(now).getTime() - new Date(from).getTime();
  if (Number.isNaN(diffMs)) return NO_VALUE;
  const minutes = Math.floor(diffMs / 60_000);
  if (minutes < 1) return '剛剛'; // also covers small clock skew (negative diff)
  if (minutes < 60) return `${minutes} 分鐘前`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} 小時前`;
  return `${Math.floor(hours / 24)} 天前`;
}

/** epoch ms → "2026-10-08T16:30" for a datetime-local input, in Taipei time. */
export function toTaipeiInput(ms: number): string {
  return formatTaipeiTime(ms).replace(' ', 'T');
}

/** "2026-10-08T16:30" typed as Taipei time → epoch ms, or null if invalid. */
export function fromTaipeiInput(value: string): number | null {
  if (!/^\d{4}-\d\d-\d\dT\d\d:\d\d$/.test(value)) return null;
  const ms = Date.parse(`${value}:00+08:00`);
  return Number.isNaN(ms) ? null : ms;
}
