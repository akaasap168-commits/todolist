export const SLOT = 15;
export const DAY_MIN = 24 * 60;

export interface Interval {
  start: number;
  end: number;
}

export const snapFloor = (m: number) => Math.floor(m / SLOT) * SLOT;
export const snapCeil = (m: number) => Math.ceil(m / SLOT) * SLOT;
export const snapRound = (m: number) => Math.round(m / SLOT) * SLOT;
export const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

export function fmtTime(m: number): string {
  const h = Math.floor(m / 60);
  const mm = m % 60;
  return `${h}:${String(mm).padStart(2, '0')}`;
}

export function fmtDuration(m: number): string {
  const h = Math.floor(m / 60);
  const mm = m % 60;
  if (h === 0) return `${mm}分`;
  return mm === 0 ? `${h}時間` : `${h}時間${mm}分`;
}

export function nowMinutes(d: Date = new Date()): number {
  return d.getHours() * 60 + d.getMinutes();
}

/** Sort and merge overlapping intervals. */
export function mergeIntervals(list: Interval[]): Interval[] {
  const sorted = list
    .filter((i) => i.end > i.start)
    .map((i) => ({ start: i.start, end: i.end }))
    .sort((a, b) => a.start - b.start);
  const out: Interval[] = [];
  for (const i of sorted) {
    const last = out[out.length - 1];
    if (last && i.start <= last.end) last.end = Math.max(last.end, i.end);
    else out.push(i);
  }
  return out;
}

export function totalMinutes(list: Interval[]): number {
  return mergeIntervals(list).reduce((s, i) => s + i.end - i.start, 0);
}

export function overlapMinutes(a: Interval[], b: Interval[]): number {
  const ma = mergeIntervals(a);
  const mb = mergeIntervals(b);
  let i = 0;
  let j = 0;
  let sum = 0;
  while (i < ma.length && j < mb.length) {
    const s = Math.max(ma[i].start, mb[j].start);
    const e = Math.min(ma[i].end, mb[j].end);
    if (e > s) sum += e - s;
    if (ma[i].end < mb[j].end) i++;
    else j++;
  }
  return sum;
}

/** Share of planned (vision) time that overlaps recorded (real) time. null if nothing planned. */
export function adherence(vision: Interval[], real: Interval[]): number | null {
  const total = totalMinutes(vision);
  if (total === 0) return null;
  return overlapMinutes(vision, real) / total;
}

export type Laid<T> = T & { col: number; cols: number };

/** Assign side-by-side columns to overlapping items. */
export function layoutColumns<T extends Interval>(items: T[]): Laid<T>[] {
  const sorted = [...items].sort((a, b) => a.start - b.start || b.end - a.end);
  const result: Laid<T>[] = [];
  let cluster: Laid<T>[] = [];
  let colEnds: number[] = [];
  let clusterEnd = -Infinity;
  const flush = () => {
    for (const it of cluster) it.cols = colEnds.length;
    result.push(...cluster);
    cluster = [];
    colEnds = [];
  };
  for (const it of sorted) {
    if (cluster.length && it.start >= clusterEnd) flush();
    let col = colEnds.findIndex((e) => e <= it.start);
    if (col === -1) {
      col = colEnds.length;
      colEnds.push(it.end);
    } else colEnds[col] = it.end;
    cluster.push({ ...it, col, cols: 1 });
    clusterEnd = cluster.length === 1 ? it.end : Math.max(clusterEnd, it.end);
  }
  flush();
  return result;
}
