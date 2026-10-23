import { describe, expect, it } from 'vitest';
import {
  catchUp,
  durationsOf,
  finishPhase,
  fmtRemaining,
  pause,
  remainingMs,
  resume,
  skipPhase,
  startCycle,
  STALE_MS,
} from './engine';

const T0 = 1_700_000_000_000; // a fixed moment, so the tests read plainly
const MIN = 60_000;

describe('startCycle', () => {
  it('starts a 25 minute focus phase', () => {
    const c = startCycle(25, T0);
    expect(c.phase).toBe('focus');
    expect(c.endsAt - c.startedAt).toBe(25 * MIN);
    expect(c.sets).toBe(0);
    expect(c.durations).toEqual({ focus: 25 * MIN, break: 5 * MIN });
  });

  it('pairs 50 minutes with a 10 minute break', () => {
    expect(durationsOf(50)).toEqual({ focus: 50 * MIN, break: 10 * MIN });
  });
});

describe('remainingMs', () => {
  it('counts down from the deadline', () => {
    const c = startCycle(25, T0);
    expect(remainingMs(c, T0 + 10 * MIN)).toBe(15 * MIN);
  });

  it('never goes below zero', () => {
    expect(remainingMs(startCycle(25, T0), T0 + 99 * MIN)).toBe(0);
  });
});

describe('pause and resume', () => {
  it('keeps the remaining time across a pause', () => {
    const paused = pause(startCycle(25, T0), T0 + 10 * MIN);
    expect(remainingMs(paused, T0 + 60 * MIN)).toBe(15 * MIN);

    const back = resume(paused, T0 + 60 * MIN);
    expect(remainingMs(back, T0 + 60 * MIN)).toBe(15 * MIN);
    expect(back.endsAt).toBe(T0 + 75 * MIN);
  });

  it('slides the window so paused time is not counted as focus', () => {
    const back = resume(pause(startCycle(25, T0), T0 + 10 * MIN), T0 + 60 * MIN);
    expect(back.endsAt - back.startedAt).toBe(25 * MIN);
    expect(back.startedAt).toBe(T0 + 50 * MIN);
  });

  it('ignores a second pause or a resume while running', () => {
    const c = startCycle(25, T0);
    expect(resume(c, T0)).toBe(c);
    const p = pause(c, T0 + MIN);
    expect(pause(p, T0 + 2 * MIN)).toBe(p);
  });
});

describe('finishPhase', () => {
  it('moves from focus to the break at the exact boundary', () => {
    const { cycle, done } = finishPhase(startCycle(25, T0));
    expect(done).toEqual({ phase: 'focus', startedAt: T0, endedAt: T0 + 25 * MIN });
    expect(cycle.phase).toBe('break');
    expect(cycle.sets).toBe(1);
    expect(cycle.startedAt).toBe(T0 + 25 * MIN);
    expect(cycle.endsAt).toBe(T0 + 30 * MIN);
  });

  it('comes back to focus after the break without counting another set', () => {
    const { cycle } = finishPhase(finishPhase(startCycle(50, T0)).cycle);
    expect(cycle.phase).toBe('focus');
    expect(cycle.sets).toBe(1);
    expect(cycle.startedAt).toBe(T0 + 60 * MIN);
    expect(cycle.endsAt).toBe(T0 + 110 * MIN);
  });

  it('does not drift when phases run back to back', () => {
    let c = startCycle(25, T0);
    for (let i = 0; i < 4; i++) c = finishPhase(c).cycle;
    expect(c.startedAt).toBe(T0 + 60 * MIN); // (25 + 5) x 2
    expect(c.sets).toBe(2);
  });
});

describe('skipPhase', () => {
  it('ends the phase now instead of at the deadline', () => {
    const c = skipPhase(startCycle(25, T0), T0 + 3 * MIN);
    expect(c.phase).toBe('break');
    expect(c.startedAt).toBe(T0 + 3 * MIN);
    expect(c.endsAt).toBe(T0 + 8 * MIN);
  });

  it('resumes a paused cycle into the next phase', () => {
    const c = skipPhase(pause(startCycle(25, T0), T0 + MIN), T0 + 2 * MIN);
    expect(c.paused).toBe(false);
    expect(c.leftMs).toBe(0);
  });
});

describe('catchUp', () => {
  it('leaves a running cycle alone', () => {
    const c = startCycle(25, T0);
    expect(catchUp(c, T0 + 10 * MIN)).toEqual({ kind: 'running', cycle: c });
  });

  it('never expires a paused cycle', () => {
    const p = pause(startCycle(25, T0), T0 + MIN);
    expect(catchUp(p, T0 + 10 * 60 * MIN).kind).toBe('running');
  });

  it('finishes a phase whose deadline just passed', () => {
    const r = catchUp(startCycle(25, T0), T0 + 25 * MIN + 1000);
    expect(r.kind).toBe('transition');
    if (r.kind !== 'transition') return;
    expect(r.done.endedAt).toBe(T0 + 25 * MIN);
    expect(r.cycle.phase).toBe('break');
  });

  it('gives up on a deadline that passed long ago', () => {
    const r = catchUp(startCycle(25, T0), T0 + 25 * MIN + STALE_MS + 1);
    expect(r.kind).toBe('stale');
    if (r.kind !== 'stale') return;
    expect(r.done).toEqual({ phase: 'focus', startedAt: T0, endedAt: T0 + 25 * MIN });
  });
});

describe('fmtRemaining', () => {
  it('shows mm:ss, rounding up', () => {
    expect(fmtRemaining(25 * MIN)).toBe('25:00');
    expect(fmtRemaining(61_200)).toBe('1:02');
    expect(fmtRemaining(1)).toBe('0:01');
    expect(fmtRemaining(0)).toBe('0:00');
    expect(fmtRemaining(-5)).toBe('0:00');
  });
});
