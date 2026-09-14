import { useState, type DragEvent } from 'react';
import { newId } from '../../data/defaults';
import { useAppData } from '../../data/hooks';
import type { Task } from '../../data/types';
import { fromKey, todayKey } from '../../lib/date';
import { fmtDuration } from '../../lib/time';
import { useUI } from '../../ui';
import { TASK_MIME, type DraggedTask } from '../timeline/Timeline';

type GroupKey = 'today' | 'upcoming' | 'someday';

const fmtShort = (key: string) => {
  const d = fromKey(key);
  return `${d.getMonth() + 1}/${d.getDate()}`;
};

export function TaskPanel({ onClose }: { onClose: () => void }) {
  const { tasks, saveTask, settings } = useAppData();
  const ui = useUI();
  const today = todayKey();
  const [title, setTitle] = useState('');
  const [forToday, setForToday] = useState(true);
  const [showDone, setShowDone] = useState(false);

  const add = () => {
    const t = title.trim();
    if (!t) return;
    const now = Date.now();
    const minOrder = tasks.reduce((m, x) => Math.min(m, x.order), 0);
    saveTask({ id: newId(), title: t, done: false, order: minOrder - 1, createdAt: now, updatedAt: now, dueDate: forToday ? today : undefined });
    setTitle('');
  };

  const open = tasks.filter((t) => !t.done);
  const groups: { key: GroupKey; title: string; items: Task[] }[] = [
    { key: 'today', title: '今日', items: open.filter((t) => t.dueDate && t.dueDate <= today) },
    {
      key: 'upcoming',
      title: '期限あり',
      items: open
        .filter((t) => t.dueDate && t.dueDate > today)
        .sort((a, b) => a.dueDate!.localeCompare(b.dueDate!) || a.order - b.order),
    },
    { key: 'someday', title: 'いつか', items: open.filter((t) => !t.dueDate) },
  ];
  const done = tasks.filter((t) => t.done).sort((a, b) => (b.doneAt ?? 0) - (a.doneAt ?? 0));

  const toggle = (t: Task) => saveTask({ ...t, done: !t.done, doneAt: t.done ? undefined : Date.now() });

  const dueFor = (group: GroupKey, t: Task, target?: Task) => {
    if (group === 'today') return t.dueDate && t.dueDate <= today ? t.dueDate : today;
    if (group === 'someday') return undefined;
    return t.dueDate && t.dueDate > today ? t.dueDate : target?.dueDate;
  };

  const dragged = (e: DragEvent) => {
    const raw = e.dataTransfer.getData(TASK_MIME);
    if (!raw) return undefined;
    const { id } = JSON.parse(raw) as DraggedTask;
    return tasks.find((t) => t.id === id);
  };

  const dropOnItem = (e: DragEvent, target: Task, list: Task[], group: GroupKey) => {
    const t = dragged(e);
    if (!t) return;
    e.preventDefault();
    e.stopPropagation();
    if (t.id === target.id) return;
    const i = list.findIndex((x) => x.id === target.id);
    const prev = list[i - 1];
    if (prev?.id === t.id) return;
    const order = prev ? (prev.order + target.order) / 2 : target.order - 1;
    saveTask({ ...t, order, dueDate: dueFor(group, t, target) });
  };

  const dropOnGroup = (e: DragEvent, list: Task[], group: GroupKey) => {
    const t = dragged(e);
    if (!t) return;
    e.preventDefault();
    const last = list[list.length - 1];
    saveTask({ ...t, order: last && last.id !== t.id ? last.order + 1 : t.order, dueDate: dueFor(group, t, last) });
  };

  const allowDrop = (e: DragEvent) => {
    if (e.dataTransfer.types.includes(TASK_MIME)) e.preventDefault();
  };

  const item = (t: Task, list: Task[], group: GroupKey | null) => {
    const cat = settings.categories.find((c) => c.id === t.categoryId);
    return (
      <li
        key={t.id}
        className={`task-item ${t.done ? 'done' : ''}`}
        draggable={!t.done}
        onDragStart={(e) => {
          const data: DraggedTask = { id: t.id, title: t.title, categoryId: t.categoryId, estimateMin: t.estimateMin };
          e.dataTransfer.setData(TASK_MIME, JSON.stringify(data));
          e.dataTransfer.setData('text/plain', t.title);
          e.dataTransfer.effectAllowed = 'copyMove';
        }}
        onDragOver={allowDrop}
        onDrop={group ? (e) => dropOnItem(e, t, list, group) : undefined}
      >
        <input type="checkbox" checked={t.done} onChange={() => toggle(t)} aria-label="完了" />
        <button className="task-main" onClick={() => ui.openTask(t)}>
          <span className="task-title">{t.title}</span>
          <span className="task-meta">
            {cat && (
              <span className="cat">
                <i className="dot" style={{ background: cat.color }} />
                {cat.name}
              </span>
            )}
            {t.dueDate && !t.done && <span className={t.dueDate < today ? 'overdue' : ''}>{fmtShort(t.dueDate)}</span>}
            {t.estimateMin ? <span>{fmtDuration(t.estimateMin)}</span> : null}
            {t.notes && <span title={t.notes}>📝</span>}
            {t.done && t.doneAt && <span>{new Date(t.doneAt).toLocaleDateString('ja-JP')} 完了</span>}
          </span>
        </button>
      </li>
    );
  };

  return (
    <aside className="tasks" aria-label="ToDo">
      <div className="tasks-head">
        <h2>ToDo</h2>
        <button className="icon-btn" onClick={onClose} aria-label="ToDo を閉じる">
          ×
        </button>
      </div>
      <form
        className="task-add"
        onSubmit={(e) => {
          e.preventDefault();
          add();
        }}
      >
        <input id="task-add-input" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="タスクを追加（Enter）" />
        <label className="check small" title="期限を今日にして追加">
          <input type="checkbox" checked={forToday} onChange={(e) => setForToday(e.target.checked)} />
          今日
        </label>
      </form>
      <p className="muted small hint">タイムラインや Daily Priorities にドラッグして予定にできます</p>

      {groups.map((g) => (
        <section key={g.key} className="task-group" onDragOver={allowDrop} onDrop={(e) => dropOnGroup(e, g.items, g.key)}>
          <h3>
            {g.title} <span className="count">{g.items.length}</span>
          </h3>
          <ul>{g.items.map((t) => item(t, g.items, g.key))}</ul>
          {g.items.length === 0 && <div className="task-empty">ここにドロップ</div>}
        </section>
      ))}

      <section className="task-group">
        <h3>
          <button className="link" onClick={() => setShowDone((v) => !v)}>
            {showDone ? '▾' : '▸'} 完了
          </button>{' '}
          <span className="count">{done.length}</span>
        </h3>
        {showDone && <ul>{done.slice(0, 100).map((t) => item(t, done, null))}</ul>}
      </section>
    </aside>
  );
}
