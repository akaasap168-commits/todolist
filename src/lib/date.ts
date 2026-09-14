import { addDays, format, startOfWeek } from 'date-fns';

export const DOW = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'];
export const DOW_JA = ['日', '月', '火', '水', '木', '金', '土'];

export const toKey = (d: Date) => format(d, 'yyyy-MM-dd');

export function fromKey(key: string): Date {
  const [y, m, d] = key.split('-').map(Number);
  return new Date(y, m - 1, d);
}

export const todayKey = () => toKey(new Date());

export function weekStartOf(d: Date, weekStartsOn: 0 | 1): Date {
  return startOfWeek(d, { weekStartsOn });
}

export function weekDates(start: Date): string[] {
  return Array.from({ length: 7 }, (_, i) => toKey(addDays(start, i)));
}

/** ISO week id such as 2026-W38. Sunday-start weeks use the following Monday. */
export function weekId(start: Date, weekStartsOn: 0 | 1): string {
  return format(addDays(start, weekStartsOn === 0 ? 1 : 0), "RRRR-'W'II");
}

export function shiftKey(key: string, days: number): string {
  return toKey(addDays(fromKey(key), days));
}

export function dateAt(key: string, minutes: number): Date {
  const d = fromKey(key);
  return new Date(d.getFullYear(), d.getMonth(), d.getDate(), 0, minutes);
}

export function fmtKeyJa(key: string): string {
  const d = fromKey(key);
  return `${d.getFullYear()}/${d.getMonth() + 1}/${d.getDate()}(${DOW_JA[d.getDay()]})`;
}
