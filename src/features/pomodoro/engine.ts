/**
 * Pomodoro cycle logic, kept free of side effects so it can be tested directly.
 *
 * Time is handled by deadline, never by counting down a tick: `endsAt` is an absolute
 * timestamp, so a throttled background tab cannot make the timer drift.
 */

export type Preset = 25 | 50;
export type Phase = 'focus' | 'break';

export const PRESETS: Preset[] = [25, 50];

/** Break length that goes with each focus length. */
export const BREAK_MIN: Record<Preset, number> = { 25: 5, 50: 10 };

/** A deadline missed by more than this while the app was closed is not resumed. */
export const STALE_MS = 2 * 60_000;

export interface Durations {
  focus: number; // ms
  break: number; // ms
}

export interface Cycle {
  preset: Preset;
  phase: Phase;
  startedAt: number; // start of the current phase (epoch ms)
  endsAt: number; // deadline of the current phase (epoch ms)
  paused: boolean;
  leftMs: number; // remaining while paused
  sets: number; // focus phases finished so far
  taskId?: string;
  /** Phase lengths of this cycle, so tests can use short phases. */
  durations: Durations;
}

/** A phase that ran to its end. */
export interface Segment {
  phase: Phase;
  startedAt: number;
  endedAt: number;
}

export type CatchUp =
  /** The deadline is still ahead (or the cycle is paused). */
  | { kind: 'running'; cycle: Cycle }
  /** The deadline just passed: finish that phase and keep going. */
  | { kind: 'transition'; cycle: Cycle; done: Segment }
  /** The deadline passed long ago: the cycle is over. */
  | { kind: 'stale'; done: Segment };

export const durationsOf = (preset: Preset): Durations => ({
  focus: preset * 60_000,
  break: BREAK_MIN[preset] * 60_000,
});

const phaseMs = (c: Cycle) => c.durations[c.phase];

export function startCycle(preset: Preset, now: number, taskId?: string, durations = durationsOf(preset)): Cycle {
  return {
    preset,
    phase: 'focus',
    startedAt: now,
    endsAt: now + durations.focus,
    paused: false,
    leftMs: 0,
    sets: 0,
    taskId,
    durations,
  };
}

export function remainingMs(c: Cycle, now: number): number {
  return Math.max(0, c.paused ? c.leftMs : c.endsAt - now);
}

export function pause(c: Cycle, now: number): Cycle {
  return c.paused ? c : { ...c, paused: true, leftMs: remainingMs(c, now) };
}

/**
 * Resume, keeping the phase its full length: the window slides so that it ends
 * `leftMs` from now. Paused time therefore stays out of what gets recorded.
 */
export function resume(c: Cycle, now: number): Cycle {
  if (!c.paused) return c;
  const endsAt = now + c.leftMs;
  return { ...c, paused: false, leftMs: 0, endsAt, startedAt: endsAt - phaseMs(c) };
}

const moveOn = (c: Cycle, from: number): Cycle => {
  const phase: Phase = c.phase === 'focus' ? 'break' : 'focus';
  return {
    ...c,
    phase,
    startedAt: from,
    endsAt: from + c.durations[phase],
    paused: false,
    leftMs: 0,
    sets: c.phase === 'focus' ? c.sets + 1 : c.sets,
  };
};

const segmentOf = (c: Cycle, endedAt: number): Segment => ({
  phase: c.phase,
  startedAt: c.startedAt,
  endedAt,
});

/** The phase reached its deadline: move on from that exact boundary, so nothing drifts. */
export function finishPhase(c: Cycle): { cycle: Cycle; done: Segment } {
  return { cycle: moveOn(c, c.endsAt), done: segmentOf(c, c.endsAt) };
}

/** The user skipped ahead: the phase ends now, and it did not run to its end. */
export function skipPhase(c: Cycle, now: number): Cycle {
  return moveOn(c, now);
}

/** Work out where a stored cycle stands after the app was away. */
export function catchUp(c: Cycle, now: number): CatchUp {
  if (c.paused || c.endsAt > now) return { kind: 'running', cycle: c };
  if (now - c.endsAt > STALE_MS) return { kind: 'stale', done: segmentOf(c, c.endsAt) };
  const { cycle, done } = finishPhase(c);
  return { kind: 'transition', cycle, done };
}

/** mm:ss, rounded up so the last second is shown as 0:01 rather than 0:00. */
export function fmtRemaining(ms: number): string {
  const total = Math.ceil(Math.max(0, ms) / 1000);
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}
