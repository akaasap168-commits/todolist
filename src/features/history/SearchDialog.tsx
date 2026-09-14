import { format, parse } from 'date-fns';
import { useEffect, useMemo, useState } from 'react';
import { useAppData, useStore } from '../../data/hooks';
import type { DayDoc, Task, WeekDoc } from '../../data/types';
import { fmtKeyJa } from '../../lib/date';
import { fmtTime } from '../../lib/time';
import { Modal, useUI } from '../../ui';

interface Result {
  key: string;
  sort: string;
  where: string;
  label: string;
  text: string;
  sub?: string;
  go: () => void;
}

const WEEK_LABEL: Record<keyof WeekDoc, string> = {
  priorities: 'Weekly Priorities',
  microSuccess: 'Micro Success',
  evaluation: 'Weekly Evaluation',
};

export function SearchDialog({ onClose }: { onClose: () => void }) {
  const store = useStore();
  const ui = useUI();
  const { tasks } = useAppData();
  const [q, setQ] = useState('');
  const [data, setData] = useState<{ days: (DayDoc & { id: string })[]; weeks: (WeekDoc & { id: string })[] } | null>(null);

  useEffect(() => {
    Promise.all([store.getCollection<DayDoc>('days'), store.getCollection<WeekDoc>('weeks')])
      .then(([days, weeks]) => setData({ days, weeks }))
      .catch(() => setData({ days: [], weeks: [] }));
  }, [store]);

  const results = useMemo(() => {
    const needle = q.trim().toLowerCase();
    if (!needle || !data) return [];
    const hit = (...s: (string | undefined)[]) => s.some((x) => x?.toLowerCase().includes(needle));
    const out: Result[] = [];
    const goDay = (d: string) => () => {
      ui.go('day', d);
      onClose();
    };
    for (const d of data.days) {
      const where = fmtKeyJa(d.id);
      for (const kind of ['vision', 'real'] as const) {
        for (const b of d[kind] ?? []) {
          if (hit(b.title, b.note)) {
            out.push({ key: `${d.id}-${kind}-${b.id}`, sort: d.id, where, label: kind === 'vision' ? 'Vision' : 'Real', text: b.title || '(無題)', sub: `${fmtTime(b.start)}–${fmtTime(b.end)}${b.note ? ` ・ ${b.note}` : ''}`, go: goDay(d.id) });
          }
        }
      }
      (d.priorities ?? []).forEach((p, i) => {
        if (p.text && hit(p.text)) out.push({ key: `${d.id}-p${i}`, sort: d.id, where, label: 'Daily Priority', text: p.text, go: goDay(d.id) });
      });
      if (d.note && hit(d.note)) out.push({ key: `${d.id}-note`, sort: d.id, where, label: 'メモ', text: d.note, go: goDay(d.id) });
    }
    for (const w of data.weeks) {
      const monday = parse(w.id, "RRRR-'W'II", new Date());
      const dateKey = isNaN(monday.getTime()) ? '' : format(monday, 'yyyy-MM-dd');
      for (const key of Object.keys(WEEK_LABEL) as (keyof WeekDoc)[]) {
        (w[key] ?? []).forEach((p, i) => {
          if (p.text && hit(p.text)) {
            out.push({
              key: `${w.id}-${key}-${i}`,
              sort: dateKey,
              where: w.id,
              label: WEEK_LABEL[key],
              text: p.text,
              go: () => {
                if (dateKey) ui.go('week', dateKey);
                onClose();
              },
            });
          }
        });
      }
    }
    for (const t of tasks as Task[]) {
      if (hit(t.title, t.notes)) {
        out.push({
          key: `task-${t.id}`,
          sort: t.dueDate ?? '9999',
          where: t.done ? 'ToDo（完了）' : 'ToDo',
          label: 'ToDo',
          text: t.title,
          sub: t.notes,
          go: () => {
            onClose();
            ui.openTask(t);
          },
        });
      }
    }
    return out.sort((a, b) => b.sort.localeCompare(a.sort)).slice(0, 200);
  }, [q, data, tasks, ui, onClose]);

  return (
    <Modal title="検索" onClose={onClose} wide>
      <input className="search-input" autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder="Vision / Real / ToDo / 振り返りをキーワード検索" />
      {!data && <p className="muted">読み込み中…</p>}
      {data && q.trim() && results.length === 0 && <p className="muted">見つかりませんでした</p>}
      <ul className="search-results">
        {results.map((r) => (
          <li key={r.key}>
            <button onClick={r.go}>
              <span className="sr-where">{r.where}</span>
              <span className="sr-label">{r.label}</span>
              <span className="sr-text">{r.text}</span>
              {r.sub && <span className="sr-sub">{r.sub}</span>}
            </button>
          </li>
        ))}
      </ul>
    </Modal>
  );
}
