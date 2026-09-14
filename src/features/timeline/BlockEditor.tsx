import { useState, type FormEvent } from 'react';
import { newId } from '../../data/defaults';
import { useAppData, useDays, type DayPatch } from '../../data/hooks';
import type { Block, ExternalEvent } from '../../data/types';
import { fmtKeyJa } from '../../lib/date';
import { DAY_MIN, SLOT, fmtDuration, fmtTime, nowMinutes, snapCeil } from '../../lib/time';
import { CategoryPicker, Modal, type BlockTarget } from '../../ui';
import { useGcal } from '../calendar/GcalContext';

const TIME_OPTIONS = Array.from({ length: DAY_MIN / SLOT + 1 }, (_, i) => i * SLOT);

function TimeSelect({ value, onChange, min = 0 }: { value: number; onChange: (v: number) => void; min?: number }) {
  return (
    <select value={value} onChange={(e) => onChange(Number(e.target.value))}>
      {TIME_OPTIONS.filter((m) => m >= min).map((m) => (
        <option key={m} value={m}>
          {fmtTime(m)}
        </option>
      ))}
    </select>
  );
}

export function BlockEditor({ target, onClose }: { target: BlockTarget; onClose: () => void }) {
  const { date, kind, isNew } = target;
  const { days, update } = useDays([date]);
  const { settings, tasks, saveTask } = useAppData();
  const gcal = useGcal();
  const current = isNew ? target.block : (days[date][kind].find((b) => b.id === target.block.id) ?? target.block);

  const [title, setTitle] = useState(current.title);
  const [categoryId, setCategoryId] = useState(current.categoryId);
  const [start, setStart] = useState(current.start);
  const [end, setEnd] = useState(current.end);
  const [note, setNote] = useState(current.note ?? '');
  const [gcalSync, setGcalSync] = useState(!!current.gcalSync);

  const task = current.taskId ? tasks.find((t) => t.id === current.taskId) : undefined;

  const build = (): Block => ({
    ...current,
    title: title.trim(),
    categoryId,
    start,
    end: Math.max(end, start + SLOT),
    note: note.trim() || undefined,
    gcalSync: kind === 'vision' ? gcalSync || undefined : undefined,
  });

  const write = (b: Block) =>
    update(
      date,
      (p) =>
        ({
          [kind]: p[kind].some((x) => x.id === b.id) ? p[kind].map((x) => (x.id === b.id ? b : x)) : [...p[kind], b],
        }) as DayPatch,
    );

  const save = (e?: FormEvent) => {
    e?.preventDefault();
    write(build());
    onClose();
  };

  const remove = () => {
    update(date, (p) => ({ [kind]: p[kind].filter((x) => x.id !== current.id) }) as DayPatch);
    onClose();
  };

  const copyToReal = () => {
    const b = build();
    if (!isNew || b.title) write(b);
    const copy: Block = { id: newId(), start: b.start, end: b.end, title: b.title, categoryId: b.categoryId, taskId: b.taskId, note: b.note };
    update(date, (p) => ({ real: [...p.real, copy] }));
    onClose();
  };

  const stop = () => {
    const b = build();
    write({ ...b, running: undefined, end: Math.max(b.start + SLOT, snapCeil(nowMinutes())) });
    onClose();
  };

  const label = kind === 'vision' ? 'Vision（理想の予定）' : 'Real（実際の記録）';

  return (
    <Modal title={`${isNew ? '追加' : '編集'}: ${label}`} onClose={onClose}>
      <form onSubmit={save}>
        <p className="muted small">{fmtKeyJa(date)}</p>
        <div className="field">
          <label htmlFor="blk-title">内容</label>
          <input id="blk-title" autoFocus value={title} onChange={(e) => setTitle(e.target.value)} placeholder="何をする？" />
        </div>
        <div className="field">
          <label>時間</label>
          <div className="row">
            <TimeSelect value={start} onChange={(v) => { setStart(v); if (end <= v) setEnd(v + SLOT); }} />
            <span>〜</span>
            {current.running ? (
              <span className="muted">記録中</span>
            ) : (
              <TimeSelect value={end} min={start + SLOT} onChange={setEnd} />
            )}
            {!current.running && <span className="muted small">{fmtDuration(Math.max(end, start + SLOT) - start)}</span>}
          </div>
        </div>
        <div className="field">
          <label>カテゴリ</label>
          <CategoryPicker categories={settings.categories} value={categoryId} onChange={setCategoryId} />
        </div>
        <div className="field">
          <label htmlFor="blk-note">メモ</label>
          <textarea id="blk-note" rows={2} value={note} onChange={(e) => setNote(e.target.value)} />
        </div>
        {task && (
          <label className="check">
            <input type="checkbox" checked={task.done} onChange={() => saveTask({ ...task, done: !task.done, doneAt: task.done ? undefined : Date.now() })} />
            ToDo「{task.title}」を完了にする
          </label>
        )}
        {kind === 'vision' && gcal.configured && (
          <label className="check" title={gcal.canExport ? '' : '設定で Google カレンダーに接続し、書き出し先を選んでください'}>
            <input type="checkbox" checked={gcalSync} onChange={(e) => setGcalSync(e.target.checked)} />
            📅 Google カレンダーに書き出す
            {!gcal.canExport && gcalSync && <span className="muted small">（接続後に反映）</span>}
          </label>
        )}
        <div className="modal-foot">
          {!isNew && (
            <button type="button" className="btn danger ghost" onClick={remove}>
              削除
            </button>
          )}
          <span className="spacer" />
          {kind === 'vision' && (
            <button type="button" className="btn" onClick={copyToReal} title="同じ内容を Real に記録します">
              ✓ 予定どおり実施
            </button>
          )}
          {current.running && (
            <button type="button" className="btn" onClick={stop}>
              ■ 記録終了
            </button>
          )}
          <button type="submit" className="btn primary">
            保存
          </button>
        </div>
      </form>
    </Modal>
  );
}

export function ExternalEventDialog({ event, onClose }: { event: ExternalEvent; onClose: () => void }) {
  const { update } = useDays([event.date]);
  const gcal = useGcal();
  const cal = gcal.calendars.find((c) => c.id === event.calendarId);
  const copy = () => {
    const b: Block = { id: newId(), start: event.start, end: event.end, title: event.title };
    update(event.date, (p) => ({ real: [...p.real, b] }));
    onClose();
  };
  return (
    <Modal title="Google カレンダーの予定" onClose={onClose}>
      <h3 className="ext-title">{event.title}</h3>
      <p className="muted">
        {fmtKeyJa(event.date)} {fmtTime(event.start)}–{fmtTime(event.end)}
        {cal && ` ・ ${cal.summary}`}
      </p>
      <p className="muted small">取り込んだ予定はここでは編集できません。Google カレンダー側で変更してください。</p>
      <div className="modal-foot">
        <span className="spacer" />
        <button className="btn" onClick={onClose}>
          閉じる
        </button>
        <button className="btn primary" onClick={copy}>
          ✓ Real に記録
        </button>
      </div>
    </Modal>
  );
}
