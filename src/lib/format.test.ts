import { describe, expect, it } from 'vitest';
import { formatAge, formatTaipeiTime, fromTaipeiInput, toTaipeiInput } from './format.ts';

describe('formatTaipeiTime', () => {
  it('converts UTC to Asia/Taipei (UTC+8)', () => {
    expect(formatTaipeiTime('2026-10-08T08:30:00Z')).toBe('2026-10-08 16:30');
  });

  it('rolls the date over and shows 00 (not 24) just after Taipei midnight', () => {
    expect(formatTaipeiTime('2026-10-08T16:05:00Z')).toBe('2026-10-09 00:05');
  });

  it('accepts epoch milliseconds and Date objects', () => {
    const ms = Date.parse('2026-10-08T08:30:00Z');
    expect(formatTaipeiTime(ms)).toBe('2026-10-08 16:30');
    expect(formatTaipeiTime(new Date(ms))).toBe('2026-10-08 16:30');
  });

  it('returns a dash for invalid input', () => {
    expect(formatTaipeiTime('not a date')).toBe('—');
  });
});

describe('formatAge', () => {
  const now = Date.parse('2026-10-08T08:30:00Z');

  it.each([
    ['2026-10-08T08:29:40Z', '剛剛'],
    ['2026-10-08T08:25:00Z', '5 分鐘前'],
    ['2026-10-08T07:31:00Z', '59 分鐘前'],
    ['2026-10-08T07:30:00Z', '1 小時前'],
    ['2026-10-08T05:30:00Z', '3 小時前'],
    ['2026-10-07T08:30:00Z', '1 天前'],
    ['2026-10-06T08:30:00Z', '2 天前'],
  ])('%s → %s', (iso, expected) => {
    expect(formatAge(iso, now)).toBe(expected);
  });

  it('treats a timestamp slightly in the future (clock skew) as 剛剛', () => {
    expect(formatAge('2026-10-08T08:30:30Z', now)).toBe('剛剛');
  });

  it('returns a dash for invalid input', () => {
    expect(formatAge('nope', now)).toBe('—');
  });
});

describe('Taipei datetime-local helpers', () => {
  it('round-trips', () => {
    const ms = Date.parse('2026-10-08T08:30:00Z');
    expect(toTaipeiInput(ms)).toBe('2026-10-08T16:30');
    expect(fromTaipeiInput('2026-10-08T16:30')).toBe(ms);
  });

  it('rejects malformed input', () => {
    expect(fromTaipeiInput('')).toBeNull();
    expect(fromTaipeiInput('2026-13-40T99:99')).toBeNull();
  });
});
