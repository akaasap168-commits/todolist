import type { DayDoc, Priority, Settings, WeekDoc } from './types';

export const DEFAULT_SETTINGS: Settings = {
  dayStart: 5,
  dayEnd: 22,
  weekStartsOn: 0,
  categories: [
    { id: 'work', name: '仕事', color: '#4f7cff' },
    { id: 'study', name: '勉強', color: '#9b59d0' },
    { id: 'exercise', name: '運動', color: '#2eaa6e' },
    { id: 'life', name: '生活', color: '#e0a526' },
    { id: 'rest', name: '休憩', color: '#8a95a5' },
    { id: 'move', name: '移動', color: '#e36f5a' },
  ],
  weeklySectionRows: 4,
  gcal: { importCalendarIds: [], exportCalendarId: '' },
};

export function normalizeSettings(s: Partial<Settings> | null | undefined): Settings {
  return {
    ...DEFAULT_SETTINGS,
    ...(s ?? {}),
    gcal: { ...DEFAULT_SETTINGS.gcal, ...(s?.gcal ?? {}) },
  };
}

const pad = (list: Priority[] | undefined, n: number): Priority[] => {
  const out = [...(list ?? [])];
  while (out.length < n) out.push({ text: '', done: false });
  return out;
};

export const emptyDay = (): DayDoc => ({ priorities: pad([], 3), vision: [], real: [] });

export function normalizeDay(d: Partial<DayDoc> | null | undefined): DayDoc {
  return {
    ...(d ?? {}),
    priorities: pad(d?.priorities, 3),
    vision: d?.vision ?? [],
    real: d?.real ?? [],
  };
}

export function normalizeWeek(w: Partial<WeekDoc> | null | undefined, rows: number): WeekDoc {
  return {
    priorities: pad(w?.priorities, rows),
    microSuccess: pad(w?.microSuccess, rows),
    evaluation: pad(w?.evaluation, rows),
  };
}

export const newId = () =>
  typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID().replace(/-/g, '').slice(0, 16)
    : Math.random().toString(36).slice(2, 12) + Date.now().toString(36);
