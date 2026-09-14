import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { normalizeDay, normalizeSettings } from './defaults';
import type { Store } from './store';
import type { Block, DayDoc, Settings, Task } from './types';

// ---------------------------------------------------------------- store

const StoreContext = createContext<Store | null>(null);

export function useStore(): Store {
  const s = useContext(StoreContext);
  if (!s) throw new Error('StoreProvider missing');
  return s;
}

// ---------------------------------------------------------------- generic doc

export function useDoc<T>(path: string | null): { data: T | null; loaded: boolean } {
  const store = useStore();
  const [state, setState] = useState<{ path: string | null; data: T | null; loaded: boolean }>({
    path: null,
    data: null,
    loaded: false,
  });
  useEffect(() => {
    if (!path) return;
    return store.subscribeDoc<T>(path, (data) => setState({ path, data, loaded: true }));
  }, [store, path]);
  return state.path === path ? { data: state.data, loaded: state.loaded } : { data: null, loaded: false };
}

// ---------------------------------------------------------------- app data (settings, tasks)

interface AppData {
  settings: Settings;
  updateSettings: (patch: Partial<Settings>) => void;
  tasks: Task[];
  saveTask: (task: Task) => void;
  deleteTask: (id: string) => void;
}

const AppDataContext = createContext<AppData | null>(null);

export function AppDataProvider({ store, children }: { store: Store; children: ReactNode }) {
  const [rawSettings, setRawSettings] = useState<Partial<Settings> | null>(null);
  const [tasks, setTasks] = useState<Task[]>([]);

  useEffect(() => store.subscribeDoc<Settings>('meta/settings', setRawSettings), [store]);
  useEffect(
    () => store.subscribeCollection<Task>('tasks', (list) => setTasks(list.sort((a, b) => a.order - b.order))),
    [store],
  );

  const settings = useMemo(() => normalizeSettings(rawSettings), [rawSettings]);

  const value = useMemo<AppData>(
    () => ({
      settings,
      updateSettings: (patch) => void store.setDoc('meta/settings', patch, true),
      tasks,
      saveTask: (task) => {
        const { id, ...rest } = task;
        void store.setDoc(`tasks/${id}`, { ...rest, updatedAt: Date.now() });
      },
      deleteTask: (id) => void store.deleteDoc(`tasks/${id}`),
    }),
    [store, settings, tasks],
  );

  return (
    <StoreContext.Provider value={store}>
      <AppDataContext.Provider value={value}>{children}</AppDataContext.Provider>
    </StoreContext.Provider>
  );
}

export function useAppData(): AppData {
  const v = useContext(AppDataContext);
  if (!v) throw new Error('AppDataProvider missing');
  return v;
}

export const useSettings = () => useAppData().settings;

// ---------------------------------------------------------------- days

export type DayPatch = Partial<DayDoc>;
export type DayUpdater = (date: string, fn: (prev: DayDoc) => DayPatch) => void;

type VisionListener = (date: string, prev: Block[], next: Block[], update: DayUpdater) => void;
const visionListeners = new Set<VisionListener>();

/** Lets the Google Calendar layer observe changes to vision blocks. */
export function onVisionChange(l: VisionListener) {
  visionListeners.add(l);
  return () => {
    visionListeners.delete(l);
  };
}

export function useDays(dates: string[]): { days: Record<string, DayDoc>; update: DayUpdater; loaded: boolean } {
  const store = useStore();
  const key = dates.join(',');
  const [docs, setDocs] = useState<Record<string, DayDoc | null>>({});
  const latest = useRef<Record<string, DayDoc>>({});

  useEffect(() => {
    const list = key.split(',').filter(Boolean);
    const unsubs = list.map((d) =>
      store.subscribeDoc<DayDoc>(`days/${d}`, (data) => {
        latest.current[d] = normalizeDay(data);
        setDocs((prev) => ({ ...prev, [d]: data }));
      }),
    );
    return () => unsubs.forEach((u) => u());
  }, [store, key]);

  const days = useMemo(() => {
    const out: Record<string, DayDoc> = {};
    for (const d of key.split(',').filter(Boolean)) out[d] = normalizeDay(docs[d]);
    return out;
  }, [docs, key]);

  const update = useCallback<DayUpdater>(
    (date, fn) => {
      const prev = latest.current[date] ?? normalizeDay(null);
      const patch = fn(prev);
      latest.current[date] = { ...prev, ...patch };
      void store.setDoc(`days/${date}`, patch, true);
      if (patch.vision) {
        const next = patch.vision;
        visionListeners.forEach((l) => l(date, prev.vision, next, update));
      }
    },
    [store],
  );

  const loaded = dates.every((d) => d in docs);
  return { days, update, loaded };
}

// ---------------------------------------------------------------- misc

export function useNow(intervalMs = 30_000): Date {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), intervalMs);
    return () => clearInterval(t);
  }, [intervalMs]);
  return now;
}

export function useMediaQuery(q: string): boolean {
  const [m, setM] = useState(() => window.matchMedia(q).matches);
  useEffect(() => {
    const mq = window.matchMedia(q);
    const l = () => setM(mq.matches);
    mq.addEventListener('change', l);
    return () => mq.removeEventListener('change', l);
  }, [q]);
  return m;
}
