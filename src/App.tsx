import { addDays, format } from 'date-fns';
import { useEffect, useMemo, useState } from 'react';
import type { Session } from './Root';
import { useMediaQuery, useSettings } from './data/hooks';
import type { ExternalEvent, Task } from './data/types';
import { useGcal } from './features/calendar/GcalContext';
import { DayView } from './features/day/DayView';
import { SearchDialog } from './features/history/SearchDialog';
import { SettingsDialog } from './features/settings/SettingsDialog';
import { TaskEditor } from './features/tasks/TaskEditor';
import { TaskPanel } from './features/tasks/TaskPanel';
import { BlockEditor, ExternalEventDialog } from './features/timeline/BlockEditor';
import { WeekView } from './features/week/WeekView';
import { fmtKeyJa, fromKey, shiftKey, todayKey, weekId, weekStartOf } from './lib/date';
import { UIContext, useRoute, type BlockTarget, type UIApi } from './ui';

const PANEL_KEY = 'planner:panel-open';
const NARROW = '(max-width: 767px)';

export function App({ session }: { session: Session }) {
  const narrow = useMediaQuery(NARROW);
  const [route, go] = useRoute(narrow ? 'day' : 'week');
  const settings = useSettings();
  const gcal = useGcal();

  const [panelOpen, setPanelOpenState] = useState(() => {
    try {
      const v = localStorage.getItem(PANEL_KEY);
      return v === null ? !window.matchMedia(NARROW).matches : v === '1';
    } catch {
      return true;
    }
  });
  // Remember only explicit choices, so a narrow first load doesn't hide the panel forever.
  const setPanelOpen = (next: boolean | ((prev: boolean) => boolean)) =>
    setPanelOpenState((prev) => {
      const v = typeof next === 'function' ? next(prev) : next;
      try {
        localStorage.setItem(PANEL_KEY, v ? '1' : '0');
      } catch {
        /* ignore */
      }
      return v;
    });

  const [blockTarget, setBlockTarget] = useState<BlockTarget | null>(null);
  const [extTarget, setExtTarget] = useState<ExternalEvent | null>(null);
  const [taskTarget, setTaskTarget] = useState<Task | null>(null);
  const [dialog, setDialog] = useState<'settings' | 'search' | null>(null);

  const ui = useMemo<UIApi>(
    () => ({ openBlock: setBlockTarget, openExternal: setExtTarget, openTask: setTaskTarget, go }),
    [go],
  );

  const step = route.view === 'week' ? 7 : 1;
  const modalOpen = !!(blockTarget || extTarget || taskTarget || dialog);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (modalOpen || e.ctrlKey || e.metaKey || e.altKey) return;
      if ((e.target as HTMLElement).closest('input, textarea, select, [contenteditable="true"]')) return;
      switch (e.key) {
        case 'ArrowLeft':
          go(route.view, shiftKey(route.date, -step));
          break;
        case 'ArrowRight':
          go(route.view, shiftKey(route.date, step));
          break;
        case 't':
          go(route.view, todayKey());
          break;
        case 'w':
          go('week', route.date);
          break;
        case 'd':
          go('day', route.date);
          break;
        case '/':
          e.preventDefault();
          setDialog('search');
          break;
        case 'n':
          e.preventDefault();
          setPanelOpen(true);
          setTimeout(() => document.getElementById('task-add-input')?.focus(), 0);
          break;
        default:
          return;
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [modalOpen, route, step, go]);

  let title: string;
  if (route.view === 'week') {
    const s = weekStartOf(fromKey(route.date), settings.weekStartsOn);
    title = `${format(addDays(s, 3), 'yyyy年M月')} 第${Number(weekId(s, settings.weekStartsOn).slice(6))}週`;
  } else {
    title = fmtKeyJa(route.date);
  }

  return (
    <UIContext.Provider value={ui}>
      <div className="app">
        <header className="toolbar">
          <div className="tb-group">
            <button className="icon-btn" onClick={() => go(route.view, shiftKey(route.date, -step))} aria-label="前へ" title="前へ (←)">
              ‹
            </button>
            <button className="btn small" onClick={() => go(route.view, todayKey())} title="今日 (T)">
              今日
            </button>
            <button className="icon-btn" onClick={() => go(route.view, shiftKey(route.date, step))} aria-label="次へ" title="次へ (→)">
              ›
            </button>
            <h1 className="tb-title">{title}</h1>
            <input
              type="date"
              className="tb-date"
              value={route.date}
              onChange={(e) => e.target.value && go(route.view, e.target.value)}
              aria-label="日付へ移動"
            />
          </div>
          <div className="tb-group">
            {session.mode === 'local' && (
              <span className="local-badge" title="Firebase 未設定のため、このブラウザにだけ保存しています">
                この端末のみ保存
              </span>
            )}
            <div className="seg" role="tablist">
              <button className={route.view === 'week' ? 'on' : ''} onClick={() => go('week', route.date)} title="週 (W)">
                週
              </button>
              <button className={route.view === 'day' ? 'on' : ''} onClick={() => go('day', route.date)} title="日 (D)">
                日
              </button>
            </div>
            <button className="icon-btn" title="検索 (/)" aria-label="検索" onClick={() => setDialog('search')}>
              🔍
            </button>
            {gcal.configured && (
              <button
                className="btn small ghost"
                onClick={() => (gcal.connected ? gcal.refresh() : gcal.connect())}
                title={gcal.connected ? 'Google カレンダーの予定を再読み込み' : 'Google カレンダーに接続'}
              >
                {gcal.connected ? '📅 更新' : '📅 接続'}
              </button>
            )}
            <button className={`btn small ${panelOpen ? 'on' : ''}`} onClick={() => setPanelOpen((o) => !o)}>
              ✓ ToDo
            </button>
            <button className="icon-btn" title="設定" aria-label="設定" onClick={() => setDialog('settings')}>
              ⚙
            </button>
          </div>
        </header>
        {gcal.error && (
          <div className="warn-banner" role="alert">
            <span>{gcal.error}</span>
            <button className="icon-btn" onClick={gcal.clearError} aria-label="閉じる">
              ×
            </button>
          </div>
        )}
        <div className="app-body">
          <main className="view">{route.view === 'week' ? <WeekView date={route.date} /> : <DayView date={route.date} />}</main>
          {panelOpen && <TaskPanel onClose={() => setPanelOpen(false)} />}
        </div>
      </div>

      {blockTarget && <BlockEditor key={blockTarget.block.id} target={blockTarget} onClose={() => setBlockTarget(null)} />}
      {extTarget && <ExternalEventDialog event={extTarget} onClose={() => setExtTarget(null)} />}
      {taskTarget && <TaskEditor key={taskTarget.id} task={taskTarget} onClose={() => setTaskTarget(null)} />}
      {dialog === 'settings' && <SettingsDialog session={session} onClose={() => setDialog(null)} />}
      {dialog === 'search' && <SearchDialog onClose={() => setDialog(null)} />}
    </UIContext.Provider>
  );
}
