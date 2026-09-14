import { addDays } from 'date-fns';
import { useState } from 'react';
import { normalizeWeek } from '../../data/defaults';
import { useDoc, useSettings, useStore } from '../../data/hooks';
import type { DayDoc, Priority, WeekDoc } from '../../data/types';
import { weekId } from '../../lib/date';
import { fmtDuration, overlapMinutes, totalMinutes } from '../../lib/time';
import { TextField } from '../../ui';

const SECTIONS: { key: keyof WeekDoc; title: string; ja: string; check: boolean }[] = [
  { key: 'priorities', title: 'Weekly Priorities', ja: '今週優先すること', check: true },
  { key: 'microSuccess', title: 'Micro Success', ja: '小さな成功', check: false },
  { key: 'evaluation', title: 'Weekly Evaluation', ja: '今週の振り返り', check: false },
];

export function WeekSections({ start, dates, days }: { start: Date; dates: string[]; days: Record<string, DayDoc> }) {
  const settings = useSettings();
  const store = useStore();
  const ws = settings.weekStartsOn;
  const rows = settings.weeklySectionRows;
  const path = `weeks/${weekId(start, ws)}`;
  const { data } = useDoc<WeekDoc>(path);
  const week = normalizeWeek(data, rows);
  const { data: prevData } = useDoc<WeekDoc>(`weeks/${weekId(addDays(start, -7), ws)}`);
  const [showPrev, setShowPrev] = useState(false);

  const setRow = (key: keyof WeekDoc, i: number, patch: Partial<Priority>) => {
    const list = week[key].map((x, j) => (j === i ? { ...x, ...patch } : x));
    void store.setDoc(path, { [key]: list }, true);
  };

  // stats
  const byCat = new Map<string, number>();
  let vision = 0;
  let overlap = 0;
  let real = 0;
  for (const d of dates) {
    const day = days[d];
    for (const b of day.real) byCat.set(b.categoryId ?? '', (byCat.get(b.categoryId ?? '') ?? 0) + (b.end - b.start));
    vision += totalMinutes(day.vision);
    real += totalMinutes(day.real);
    overlap += overlapMinutes(day.vision, day.real);
  }
  const catRows = [...byCat.entries()]
    .map(([id, min]) => ({ cat: settings.categories.find((c) => c.id === id), min }))
    .sort((a, b) => b.min - a.min);
  const maxMin = Math.max(1, ...catRows.map((r) => r.min));
  const prevEval = (prevData?.evaluation ?? []).filter((x) => x.text);

  return (
    <div className="wsec">
      {SECTIONS.map((s) => {
        const list = week[s.key];
        const lastFilled = list.reduce((m, x, i) => (x.text ? i : m), -1);
        const shown = list.slice(0, Math.max(rows, lastFilled + 2));
        return (
          <section key={s.key} className="wsec-block">
            <h3>
              {s.title}
              <small>{s.ja}</small>
            </h3>
            {shown.map((it, i) => (
              <div key={i} className={`wsec-row ${s.check && it.done ? 'done' : ''}`}>
                {s.check ? (
                  <input type="checkbox" checked={it.done} onChange={() => setRow(s.key, i, { done: !it.done })} aria-label="完了" />
                ) : (
                  <span className="bullet">○</span>
                )}
                <TextField value={it.text} onCommit={(text) => setRow(s.key, i, { text })} />
              </div>
            ))}
            {s.key === 'evaluation' && prevEval.length > 0 && (
              <div className="prev-eval">
                <button className="link" onClick={() => setShowPrev((v) => !v)}>
                  {showPrev ? '▾' : '▸'} 先週の振り返り
                </button>
                {showPrev && (
                  <ul>
                    {prevEval.map((x, i) => (
                      <li key={i}>{x.text}</li>
                    ))}
                  </ul>
                )}
              </div>
            )}
          </section>
        );
      })}

      <section className="wsec-block stats">
        <h3>
          今週の記録<small>Real の集計</small>
        </h3>
        <div className="muted small">
          Real {fmtDuration(real)}
          {vision > 0 && ` ・ 予定どおり率 ${Math.round((overlap / vision) * 100)}%`}
        </div>
        {catRows.map((r) => (
          <div key={r.cat?.id ?? 'none'} className="stat-row">
            <span className="stat-name">{r.cat?.name ?? '未分類'}</span>
            <span className="stat-bar">
              <i style={{ width: `${(r.min / maxMin) * 100}%`, background: r.cat?.color ?? '#9aa3b0' }} />
            </span>
            <span className="stat-val">{fmtDuration(r.min)}</span>
          </div>
        ))}
      </section>
    </div>
  );
}
