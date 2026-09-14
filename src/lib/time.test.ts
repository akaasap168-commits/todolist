import { describe, expect, it } from 'vitest';
import {
  adherence,
  fmtTime,
  layoutColumns,
  mergeIntervals,
  overlapMinutes,
  snapCeil,
  snapFloor,
  snapRound,
} from './time';
import { weekId, weekDates, weekStartOf } from './date';

describe('snap', () => {
  it('snaps to 15 minutes', () => {
    expect(snapFloor(29)).toBe(15);
    expect(snapCeil(16)).toBe(30);
    expect(snapRound(22)).toBe(15);
    expect(snapRound(23)).toBe(30);
  });
});

describe('fmtTime', () => {
  it('formats minutes', () => {
    expect(fmtTime(5 * 60)).toBe('5:00');
    expect(fmtTime(13 * 60 + 45)).toBe('13:45');
  });
});

describe('intervals', () => {
  it('merges overlaps', () => {
    expect(mergeIntervals([{ start: 60, end: 120 }, { start: 0, end: 30 }, { start: 90, end: 150 }])).toEqual([
      { start: 0, end: 30 },
      { start: 60, end: 150 },
    ]);
  });
  it('computes overlap', () => {
    expect(overlapMinutes([{ start: 0, end: 60 }, { start: 120, end: 180 }], [{ start: 30, end: 150 }])).toBe(60);
  });
  it('computes adherence', () => {
    expect(adherence([], [{ start: 0, end: 10 }])).toBeNull();
    expect(adherence([{ start: 0, end: 60 }], [{ start: 30, end: 90 }])).toBe(0.5);
  });
});

describe('layoutColumns', () => {
  it('places overlapping items side by side', () => {
    const r = layoutColumns([
      { start: 0, end: 60 },
      { start: 30, end: 90 },
      { start: 60, end: 120 },
      { start: 200, end: 230 },
    ]);
    expect(r.map((x) => [x.start, x.col, x.cols])).toEqual([
      [0, 0, 2],
      [30, 1, 2],
      [60, 0, 2],
      [200, 0, 1],
    ]);
  });
});

describe('weeks', () => {
  it('builds Sunday-start weeks', () => {
    const start = weekStartOf(new Date(2026, 8, 16), 0);
    expect(weekDates(start)).toEqual([
      '2026-09-13',
      '2026-09-14',
      '2026-09-15',
      '2026-09-16',
      '2026-09-17',
      '2026-09-18',
      '2026-09-19',
    ]);
    expect(weekId(start, 0)).toBe('2026-W38');
    expect(weekId(weekStartOf(new Date(2026, 8, 16), 1), 1)).toBe('2026-W38');
  });
});
