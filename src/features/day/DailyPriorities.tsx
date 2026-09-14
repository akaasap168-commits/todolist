import type { DragEvent } from 'react';
import { useAppData, type DayUpdater } from '../../data/hooks';
import type { DayDoc, Priority } from '../../data/types';
import { TextField } from '../../ui';
import { TASK_MIME, type DraggedTask } from '../timeline/Timeline';

export function DailyPriorities({ date, day, update }: { date: string; day: DayDoc; update: DayUpdater }) {
  const { tasks, saveTask } = useAppData();

  const setItem = (i: number, patch: Partial<Priority>) =>
    update(date, (p) => ({ priorities: p.priorities.map((x, j) => (j === i ? { ...x, ...patch } : x)) }));

  const toggle = (i: number) => {
    const it = day.priorities[i];
    const done = !it.done;
    setItem(i, { done });
    const t = it.taskId ? tasks.find((x) => x.id === it.taskId) : undefined;
    if (t && t.done !== done) saveTask({ ...t, done, doneAt: done ? Date.now() : undefined });
  };

  const onDragOver = (e: DragEvent) => {
    if (e.dataTransfer.types.includes(TASK_MIME)) {
      e.preventDefault();
      e.dataTransfer.dropEffect = 'copy';
    }
  };

  const onDrop = (e: DragEvent, i: number) => {
    const raw = e.dataTransfer.getData(TASK_MIME);
    if (!raw) return;
    e.preventDefault();
    const t = JSON.parse(raw) as DraggedTask;
    setItem(i, { text: t.title, taskId: t.id, done: false });
  };

  return (
    <div className="prio">
      {day.priorities.slice(0, 3).map((it, i) => (
        <div key={i} className={`prio-row ${it.done ? 'done' : ''}`} onDragOver={onDragOver} onDrop={(e) => onDrop(e, i)}>
          <input type="checkbox" checked={it.done} onChange={() => toggle(i)} aria-label="完了" />
          <TextField
            value={it.text}
            onCommit={(text) => setItem(i, { text, taskId: text ? it.taskId : undefined })}
          />
        </div>
      ))}
    </div>
  );
}
