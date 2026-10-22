/**
 * Drives the pomodoro cycle: phase changes, the background sound, the chime and
 * notification, and the automatic Real-lane record.
 *
 * The cycle itself lives in localStorage, not in Firestore: it belongs to the
 * device you are working on, and syncing it would let two devices fight over it.
 */

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { newId, normalizeDay } from '../../data/defaults';
import { useAppData, useStore } from '../../data/hooks';
import type { Store } from '../../data/store';
import type { Block, DayDoc } from '../../data/types';
import { toKey } from '../../lib/date';
import { DAY_MIN } from '../../lib/time';
import { chime, playSound, setSoundVolume, stopSound, unlockAudio } from './ambient';
import {
  catchUp,
  finishPhase,
  pause as pauseCycle,
  remainingMs,
  resume as resumeCycle,
  skipPhase,
  startCycle,
  type Cycle,
  type Phase,
  type Preset,
  type Segment,
} from './engine';
import { useSpotify } from './SpotifyContext';

const CYCLE_KEY = 'planner:pomodoro';

export interface Notice {
  text: string;
  /** A finished focus phase the user can still add to the Real lane. */
  segment: Segment | null;
  taskId?: string;
}

export interface PomodoroApi {
  cycle: Cycle | null;
  remaining: number; // ms left in the current phase
  notice: Notice | null;
  start(preset: Preset, taskId?: string): void;
  pause(): void;
  resume(): void;
  skip(): void;
  stop(): void;
  setTask(taskId: string | undefined): void;
  recordNotice(): void;
  dismissNotice(): void;
}

const PomodoroContext = createContext<PomodoroApi | null>(null);

export function usePomodoro(): PomodoroApi {
  const v = useContext(PomodoroContext);
  if (!v) throw new Error('PomodoroProvider missing');
  return v;
}

// ---------------------------------------------------------------- storage

function readCycle(): Cycle | null {
  try {
    const raw = localStorage.getItem(CYCLE_KEY);
    if (!raw) return null;
    const c = JSON.parse(raw) as Cycle;
    return typeof c?.endsAt === 'number' && c.durations ? c : null;
  } catch {
    return null;
  }
}

function writeCycle(c: Cycle | null) {
  try {
    if (c) localStorage.setItem(CYCLE_KEY, JSON.stringify(c));
    else localStorage.removeItem(CYCLE_KEY);
  } catch {
    /* storage unavailable */
  }
}

/**
 * Append one Real block, reading the day first so that nothing already recorded
 * is overwritten (setDoc merges field by field, and `real` is one field).
 */
function appendRealBlock(store: Store, date: string, block: Block) {
  let settled = false;
  let unsub: (() => void) | null = null;
  const handle = (data: DayDoc | null) => {
    if (settled) return;
    settled = true;
    void store.setDoc(`days/${date}`, { real: [...normalizeDay(data).real, block] }, true);
    unsub?.(); // null when the store answered synchronously; cleaned up below
  };
  unsub = store.subscribeDoc<DayDoc>(`days/${date}`, handle);
  if (settled) unsub();
}

// ---------------------------------------------------------------- provider

export function PomodoroProvider({ children }: { children: ReactNode }) {
  const { settings, tasks } = useAppData();
  const store = useStore();
  const spotify = useSpotify();

  const [cycle, setCycleState] = useState<Cycle | null>(null);
  const [remaining, setRemaining] = useState(0);
  const [notice, setNotice] = useState<Notice | null>(null);
  /** True once the AudioContext has been unlocked by a gesture in this tab. */
  const [audioReady, setAudioReady] = useState(false);

  const p = settings.pomodoro;
  const pRef = useRef(p);
  pRef.current = p;
  const tasksRef = useRef(tasks);
  tasksRef.current = tasks;
  const spotifyRef = useRef(spotify);
  spotifyRef.current = spotify;

  const setCycle = useCallback((c: Cycle | null) => {
    writeCycle(c);
    setCycleState(c);
    setRemaining(c ? remainingMs(c, Date.now()) : 0);
  }, []);

  const unlock = useCallback(() => {
    unlockAudio();
    setAudioReady(true);
  }, []);

  // ---------------------------------------------------------------- recording

  const record = useCallback(
    (seg: Segment, taskId?: string) => {
      if (seg.phase !== 'focus') return;
      const startDate = new Date(seg.startedAt);
      const date = toKey(startDate);
      const start = startDate.getHours() * 60 + startDate.getMinutes();
      const endDate = new Date(seg.endedAt);
      // A phase that ran past midnight is cut at the end of the day it started in.
      const end = toKey(endDate) === date ? endDate.getHours() * 60 + endDate.getMinutes() : DAY_MIN;
      if (end <= start) return; // under a minute: nothing worth recording
      const task = taskId ? tasksRef.current.find((t) => t.id === taskId) : undefined;
      appendRealBlock(store, date, {
        id: newId(),
        start,
        end,
        title: task?.title ?? '集中',
        taskId: task?.id,
        categoryId: pRef.current.recordCategoryId,
      });
    },
    [store],
  );

  // ---------------------------------------------------------------- chime & notification

  const announce = useCallback((next: Cycle) => {
    const cfg = pRef.current;
    if (cfg.chime) chime(next.phase);
    if (!cfg.notify || typeof Notification === 'undefined' || Notification.permission !== 'granted') return;
    const breakMin = Math.round(next.durations.break / 60_000);
    const title = next.phase === 'break' ? '休憩の時間です' : '集中の時間です';
    const body =
      next.phase === 'break'
        ? `${next.sets} セット完了。${breakMin} 分休みましょう。`
        : '休憩おわり。次の集中をはじめます。';
    try {
      new Notification(title, { body, tag: 'planner-pomodoro' });
    } catch {
      /* some browsers only allow notifications through a service worker */
    }
  }, []);

  // ---------------------------------------------------------------- restore after a reload

  useEffect(() => {
    const stored = readCycle();
    if (!stored) return;
    const r = catchUp(stored, Date.now());
    if (r.kind === 'running') {
      setCycle(r.cycle);
    } else if (r.kind === 'transition') {
      if (pRef.current.autoRecord) record(r.done, stored.taskId);
      setCycle(r.cycle);
    } else {
      writeCycle(null);
      setNotice({
        text:
          r.done.phase === 'focus'
            ? 'アプリを閉じている間に集中時間が終わっていました。'
            : 'アプリを閉じている間に休憩が終わっていました。',
        segment: r.done.phase === 'focus' ? r.done : null,
        taskId: stored.taskId,
      });
    }
  }, [record, setCycle]);

  // ---------------------------------------------------------------- the clock

  useEffect(() => {
    if (!cycle || cycle.paused) return;

    const check = () => {
      const now = Date.now();
      if (now < cycle.endsAt) {
        const left = cycle.endsAt - now;
        // Re-render only when the displayed second changes.
        setRemaining((prev) => (Math.ceil(prev / 1000) === Math.ceil(left / 1000) ? prev : left));
        return;
      }
      const { cycle: next, done } = finishPhase(cycle);
      if (done.phase === 'focus' && pRef.current.autoRecord) record(done, cycle.taskId);
      announce(next);
      setCycle(next);
    };

    // The countdown is always "deadline minus now", never a subtracted tick, so a
    // throttled background tab cannot make the timer drift.
    const interval = window.setInterval(check, 500);
    const deadline = window.setTimeout(check, Math.max(0, cycle.endsAt - Date.now()) + 20);
    const onVisible = () => {
      if (!document.hidden) check();
    };
    document.addEventListener('visibilitychange', onVisible);
    check();
    return () => {
      window.clearInterval(interval);
      window.clearTimeout(deadline);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [cycle, record, announce, setCycle]);

  // ---------------------------------------------------------------- sound

  // A cycle restored after a reload has no gesture behind it yet, so pick one up
  // from the first interaction anywhere in the page.
  useEffect(() => {
    if (audioReady || !cycle) return;
    const on = () => unlock();
    window.addEventListener('pointerdown', on, { once: true });
    window.addEventListener('keydown', on, { once: true });
    return () => {
      window.removeEventListener('pointerdown', on);
      window.removeEventListener('keydown', on);
    };
  }, [audioReady, cycle, unlock]);

  const soundPhase: Phase | 'paused' | 'off' = !cycle ? 'off' : cycle.paused ? 'paused' : cycle.phase;
  const breakKey = `${p.breakSource}:${p.breakFileId ?? ''}:${p.spotify.contextUri}:${p.spotify.deviceId}:${p.spotify.shuffle}`;

  useEffect(() => {
    if (!audioReady) return;
    const cfg = pRef.current;
    const sp = spotifyRef.current;
    const spotifyBreak = cfg.breakSource === 'spotify';

    if (soundPhase === 'off' || soundPhase === 'paused') {
      stopSound();
      if (spotifyBreak && sp.connected) void sp.pause();
      return;
    }
    if (soundPhase === 'focus') {
      if (spotifyBreak && sp.connected) {
        void sp.pause();
        // Bring this tab up as a Spotify device during the focus phase, so the
        // break can start playing the moment it begins.
        void sp.prepare();
      }
      void playSound(cfg.focusSound, cfg.focusVolume);
      return;
    }
    // break
    stopSound();
    if (spotifyBreak) {
      if (!sp.connected) return;
      void sp.prepare().then(() =>
        sp.play({
          contextUri: cfg.spotify.contextUri,
          deviceId: cfg.spotify.deviceId,
          shuffle: cfg.spotify.shuffle,
          volume: cfg.breakVolume,
        }),
      );
    } else if (cfg.breakSource === 'file' && cfg.breakFileId) {
      void playSound(`file:${cfg.breakFileId}`, cfg.breakVolume);
    }
  }, [audioReady, soundPhase, p.focusSound, breakKey]);

  // Volume while something is already playing.
  useEffect(() => {
    if (!cycle || cycle.paused) return;
    setSoundVolume(cycle.phase === 'focus' ? p.focusVolume : p.breakVolume);
  }, [cycle, p.focusVolume, p.breakVolume]);

  // ---------------------------------------------------------------- actions

  const start = useCallback(
    (preset: Preset, taskId?: string) => {
      // Everything that needs a user gesture happens here, inside the click.
      unlock();
      if (pRef.current.notify && typeof Notification !== 'undefined' && Notification.permission === 'default') {
        void Notification.requestPermission();
      }
      if (pRef.current.breakSource === 'spotify') void spotifyRef.current.prepare();
      setNotice(null);
      setCycle(startCycle(preset, Date.now(), taskId));
    },
    [setCycle, unlock],
  );

  /** What was actually done so far in this focus phase. */
  const recordPartial = useCallback(
    (c: Cycle) => {
      if (c.phase !== 'focus' || !pRef.current.autoRecord) return;
      // While paused the window is anchored, so the work done is exactly
      // "phase length minus what is left".
      const endedAt = c.paused ? c.startedAt + (c.durations.focus - c.leftMs) : Date.now();
      record({ phase: 'focus', startedAt: c.startedAt, endedAt }, c.taskId);
    },
    [record],
  );

  const value = useMemo<PomodoroApi>(
    () => ({
      cycle,
      remaining,
      notice,
      start,
      pause: () => {
        if (cycle) setCycle(pauseCycle(cycle, Date.now()));
      },
      resume: () => {
        if (!cycle) return;
        unlock();
        setCycle(resumeCycle(cycle, Date.now()));
      },
      skip: () => {
        if (!cycle) return;
        unlock();
        recordPartial(cycle);
        const next = skipPhase(cycle, Date.now());
        announce(next);
        setCycle(next);
      },
      stop: () => {
        if (!cycle) return;
        recordPartial(cycle);
        stopSound();
        if (pRef.current.breakSource === 'spotify' && spotifyRef.current.connected) void spotifyRef.current.pause();
        setCycle(null);
      },
      setTask: (taskId) => {
        if (cycle) setCycle({ ...cycle, taskId });
      },
      recordNotice: () => {
        if (notice?.segment) record(notice.segment, notice.taskId);
        setNotice(null);
      },
      dismissNotice: () => setNotice(null),
    }),
    [cycle, remaining, notice, start, setCycle, record, recordPartial, announce, unlock],
  );

  return <PomodoroContext.Provider value={value}>{children}</PomodoroContext.Provider>;
}
