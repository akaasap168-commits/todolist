import { addDays } from 'date-fns';
import { useState, type FormEvent } from 'react';
import { useAppData } from '../../data/hooks';
import type { Task } from '../../data/types';
import { toKey, todayKey } from '../../lib/date';
import { fmtDuration } from '../../lib/time';
import { CategoryPicker, Modal } from '../../ui';

const ESTIMATES = [15, 30, 45, 60, 90, 120, 180, 240];

export function TaskEditor({ task, onClose }: { task: Task; onClose: () => void }) {
  const { saveTask, deleteTask, settings } = useAppData();
  const [title, setTitle] = useState(task.title);
  const [notes, setNotes] = useState(task.notes ?? '');
  const [categoryId, setCategoryId] = useState(task.categoryId);
  const [dueDate, setDueDate] = useState(task.dueDate ?? '');
  const [estimate, setEstimate] = useState(task.estimateMin ?? 0);
  const [done, setDone] = useState(task.done);

  const save = (e?: FormEvent) => {
    e?.preventDefault();
    saveTask({
      ...task,
      title: title.trim() || task.title,
      notes: notes.trim() || undefined,
      categoryId,
      dueDate: dueDate || undefined,
      estimateMin: estimate || undefined,
      done,
      doneAt: done ? (task.doneAt ?? Date.now()) : undefined,
    });
    onClose();
  };

  const remove = () => {
    if (!confirm(`「${task.title}」を削除しますか？`)) return;
    deleteTask(task.id);
    onClose();
  };

  return (
    <Modal title="ToDo を編集" onClose={onClose}>
      <form onSubmit={save}>
        <div className="field">
          <label htmlFor="task-title">タイトル</label>
          <input id="task-title" autoFocus value={title} onChange={(e) => setTitle(e.target.value)} />
        </div>
        <div className="field">
          <label>期限</label>
          <div className="row wrap">
            <input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
            <button type="button" className="btn small" onClick={() => setDueDate(todayKey())}>
              今日
            </button>
            <button type="button" className="btn small" onClick={() => setDueDate(toKey(addDays(new Date(), 1)))}>
              明日
            </button>
            <button type="button" className="btn small ghost" onClick={() => setDueDate('')}>
              なし
            </button>
          </div>
        </div>
        <div className="field">
          <label>見積り時間（タイムラインにドラッグしたときの長さ）</label>
          <select value={estimate} onChange={(e) => setEstimate(Number(e.target.value))}>
            <option value={0}>未設定（30分）</option>
            {ESTIMATES.map((m) => (
              <option key={m} value={m}>
                {fmtDuration(m)}
              </option>
            ))}
          </select>
        </div>
        <div className="field">
          <label>カテゴリ</label>
          <CategoryPicker categories={settings.categories} value={categoryId} onChange={setCategoryId} />
        </div>
        <div className="field">
          <label htmlFor="task-notes">メモ</label>
          <textarea id="task-notes" rows={3} value={notes} onChange={(e) => setNotes(e.target.value)} />
        </div>
        <label className="check">
          <input type="checkbox" checked={done} onChange={(e) => setDone(e.target.checked)} />
          完了
        </label>
        <div className="modal-foot">
          <button type="button" className="btn danger ghost" onClick={remove}>
            削除
          </button>
          <span className="spacer" />
          <button type="button" className="btn" onClick={onClose}>
            キャンセル
          </button>
          <button type="submit" className="btn primary">
            保存
          </button>
        </div>
      </form>
    </Modal>
  );
}
