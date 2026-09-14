import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from 'react';
import type { Block, Category, ExternalEvent, LaneKind, Task } from './data/types';
import { todayKey } from './lib/date';

// ---------------------------------------------------------------- UI actions

export interface BlockTarget {
  date: string;
  kind: LaneKind;
  block: Block;
  isNew: boolean;
}

export type ViewName = 'week' | 'day';

export interface UIApi {
  openBlock(t: BlockTarget): void;
  openExternal(e: ExternalEvent): void;
  openTask(t: Task): void;
  go(view: ViewName, date: string): void;
}

export const UIContext = createContext<UIApi | null>(null);

export function useUI(): UIApi {
  const v = useContext(UIContext);
  if (!v) throw new Error('UIContext missing');
  return v;
}

// ---------------------------------------------------------------- routing

export interface Route {
  view: ViewName;
  date: string;
}

function parseHash(hash: string, fallback: ViewName): Route {
  const m = hash.match(/^#\/(week|day)\/(\d{4}-\d{2}-\d{2})$/);
  return m ? { view: m[1] as ViewName, date: m[2] } : { view: fallback, date: todayKey() };
}

export function useRoute(fallback: ViewName): [Route, (view: ViewName, date: string) => void] {
  const [hash, setHash] = useState(() => window.location.hash);
  useEffect(() => {
    const l = () => setHash(window.location.hash);
    window.addEventListener('hashchange', l);
    return () => window.removeEventListener('hashchange', l);
  }, []);
  const go = useCallback((view: ViewName, date: string) => {
    window.location.hash = `#/${view}/${date}`;
  }, []);
  return [parseHash(hash, fallback), go];
}

// ---------------------------------------------------------------- modal

export function Modal({
  title,
  onClose,
  children,
  wide,
}: {
  title: string;
  onClose: () => void;
  children: ReactNode;
  wide?: boolean;
}) {
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') closeRef.current();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);
  return (
    <div className="modal-backdrop" onPointerDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className={`modal ${wide ? 'wide' : ''}`} role="dialog" aria-modal="true" aria-label={title}>
        <div className="modal-head">
          <h2>{title}</h2>
          <button className="icon-btn" onClick={onClose} aria-label="閉じる">
            ×
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------- text field with debounced commit

export function TextField({
  value,
  onCommit,
  placeholder,
  className = '',
  multiline,
}: {
  value: string;
  onCommit: (v: string) => void;
  placeholder?: string;
  className?: string;
  multiline?: boolean;
}) {
  const [v, setV] = useState(value);
  const focused = useRef(false);
  const timer = useRef<number | undefined>(undefined);
  const commitRef = useRef(onCommit);
  commitRef.current = onCommit;
  const lastCommitted = useRef(value);

  useEffect(() => {
    lastCommitted.current = value;
    if (!focused.current) setV(value);
  }, [value]);

  useEffect(() => () => window.clearTimeout(timer.current), []);

  const commit = (nv: string) => {
    window.clearTimeout(timer.current);
    if (nv !== lastCommitted.current) {
      lastCommitted.current = nv;
      commitRef.current(nv);
    }
  };

  const props = {
    value: v,
    placeholder,
    className: `tf ${className}`,
    onFocus: () => {
      focused.current = true;
    },
    onBlur: () => {
      focused.current = false;
      commit(v);
    },
    onChange: (e: { target: { value: string } }) => {
      const nv = e.target.value;
      setV(nv);
      window.clearTimeout(timer.current);
      timer.current = window.setTimeout(() => commit(nv), 700);
    },
  };

  return multiline ? (
    <textarea rows={3} {...props} />
  ) : (
    <input
      type="text"
      {...props}
      onKeyDown={(e) => {
        if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
      }}
    />
  );
}

// ---------------------------------------------------------------- category picker

export function CategoryPicker({
  categories,
  value,
  onChange,
}: {
  categories: Category[];
  value?: string;
  onChange: (id: string | undefined) => void;
}) {
  return (
    <div className="chips">
      <button type="button" className={`chip ${!value ? 'on' : ''}`} onClick={() => onChange(undefined)}>
        なし
      </button>
      {categories.map((c) => (
        <button
          type="button"
          key={c.id}
          className={`chip ${value === c.id ? 'on' : ''}`}
          style={{ '--c': c.color } as CSSProperties}
          onClick={() => onChange(c.id)}
        >
          {c.name}
        </button>
      ))}
    </div>
  );
}
