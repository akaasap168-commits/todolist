import { useRef, useState, type CSSProperties, type DragEvent, type PointerEvent } from 'react';
import { newId } from '../../data/defaults';
import { useNow, useSettings, type DayPatch, type DayUpdater } from '../../data/hooks';
import type { Block, DayDoc, ExternalEvent, LaneKind, Settings } from '../../data/types';
import { toKey } from '../../lib/date';
import { DAY_MIN, SLOT, clamp, fmtTime, layoutColumns, nowMinutes, snapCeil, snapFloor, snapRound } from '../../lib/time';
import { useUI } from '../../ui';

export const TASK_MIME = 'application/x-planner-task';

export interface DraggedTask {
  id: string;
  title: string;
  categoryId?: string;
  estimateMin?: number;
}

export interface Range {
  start: number;
  end: number;
}

/** Visible time range: settings range, widened to whole hours covering every block/event. */
export function computeRange(settings: Settings, days: DayDoc[], external: ExternalEvent[] = []): Range {
  let start = settings.dayStart * 60;
  let end = Math.min(DAY_MIN, (settings.dayEnd + 1) * 60);
  for (const d of days) {
    for (const b of [...d.vision, ...d.real]) {
      start = Math.min(start, b.start);
      end = Math.max(end, b.end);
    }
  }
  for (const e of external) {
    if (e.allDay) continue;
    start = Math.min(start, e.start);
    end = Math.max(end, e.end);
  }
  start = clamp(Math.floor(start / 60) * 60, 0, DAY_MIN - 60);
  end = clamp(Math.ceil(end / 60) * 60, start + 60, DAY_MIN);
  return { start, end };
}

interface TimelineProps {
  date: string;
  day: DayDoc;
  update: DayUpdater;
  range: Range;
  slotPx: number;
  labels: 'gutter' | 'center';
  external?: ExternalEvent[];
}

export function Timeline({ date, day, update, range, slotPx, labels, external = [] }: TimelineProps) {
  const now = useNow();
  const isToday = toKey(now) === date;
  const nowMin = nowMinutes(now);
  const y = (m: number) => ((m - range.start) / SLOT) * slotPx;
  const height = y(range.end);
  const hours: number[] = [];
  for (let m = range.start; m < range.end; m += 60) hours.push(m);

  const laneProps = { date, update, range, slotPx, isToday, nowMin };

  return (
    <div className={`tl labels-${labels}`} style={{ '--slot': `${slotPx}px` } as CSSProperties}>
      {labels === 'gutter' && (
        <div className="tl-gutter" style={{ height }}>
          {hours.map((m) => (
            <span key={m} style={{ top: y(m) }}>
              {m / 60}:00
            </span>
          ))}
        </div>
      )}
      <div className="tl-lanes" style={{ height }}>
        <Lane kind="vision" blocks={day.vision} external={external} {...laneProps} />
        <Lane kind="real" blocks={day.real} external={[]} {...laneProps} />
        {labels === 'center' &&
          hours.map((m) => (
            <span key={m} className="tl-hour" style={{ top: y(m) }}>
              {m / 60}
            </span>
          ))}
        {isToday && nowMin >= range.start && nowMin <= range.end && (
          <div className="now-line" style={{ top: y(nowMin) }} />
        )}
      </div>
    </div>
  );
}

type DragMode = 'create' | 'move' | 'top' | 'bottom';

interface Drag {
  mode: DragMode;
  id?: string;
  anchor: number;
  origStart: number;
  origEnd: number;
  start: number;
  end: number;
  moved: boolean;
  y0: number;
  touch: boolean;
}

interface LaneProps {
  kind: LaneKind;
  date: string;
  blocks: Block[];
  external: ExternalEvent[];
  update: DayUpdater;
  range: Range;
  slotPx: number;
  isToday: boolean;
  nowMin: number;
}

type Item = ({ type: 'block'; b: Block } | { type: 'ext'; e: ExternalEvent }) & { start: number; end: number };

function Lane({ kind, date, blocks, external, update, range, slotPx, isToday, nowMin }: LaneProps) {
  const ui = useUI();
  const settings = useSettings();
  const ref = useRef<HTMLDivElement>(null);
  const dragRef = useRef<Drag | null>(null);
  const [drag, setDragState] = useState<Drag | null>(null);

  const setDrag = (d: Drag | null) => {
    dragRef.current = d;
    setDragState(d);
  };
  const y = (m: number) => ((m - range.start) / SLOT) * slotPx;
  const toMin = (clientY: number) => {
    const r = ref.current!.getBoundingClientRect();
    return range.start + ((clientY - r.top) / slotPx) * SLOT;
  };
  const colorOf = (id?: string) => settings.categories.find((c) => c.id === id)?.color ?? '#7a8699';

  const onLaneDown = (e: PointerEvent<HTMLDivElement>) => {
    if (e.button !== 0) return;
    const m = clamp(snapFloor(toMin(e.clientY)), 0, DAY_MIN - SLOT);
    const touch = e.pointerType === 'touch';
    if (!touch) ref.current!.setPointerCapture(e.pointerId);
    setDrag({ mode: 'create', anchor: m, origStart: m, origEnd: m + SLOT, start: m, end: m + SLOT, moved: false, y0: e.clientY, touch });
  };

  const onBlockDown = (e: PointerEvent<HTMLDivElement>, b: Block) => {
    if (e.button !== 0) return;
    e.stopPropagation();
    const h = (e.target as HTMLElement).dataset.h;
    const mode: DragMode = h === 'top' ? 'top' : h === 'bottom' ? 'bottom' : 'move';
    const touch = e.pointerType === 'touch';
    if (!touch || mode !== 'move') ref.current!.setPointerCapture(e.pointerId);
    setDrag({
      mode,
      id: b.id,
      anchor: toMin(e.clientY),
      origStart: b.start,
      origEnd: b.end,
      start: b.start,
      end: b.end,
      moved: false,
      y0: e.clientY,
      touch,
    });
  };

  const onMove = (e: PointerEvent<HTMLDivElement>) => {
    const d = dragRef.current;
    if (!d) return;
    if (!d.moved && Math.abs(e.clientY - d.y0) <= 4) return;
    // On touch screens, dragging on the lane scrolls the page; only resize handles drag.
    if (d.touch && (d.mode === 'create' || d.mode === 'move')) return;
    const m = toMin(e.clientY);
    let { start, end } = d;
    if (d.mode === 'create') {
      const b = clamp(snapFloor(m), 0, DAY_MIN - SLOT);
      start = Math.min(d.anchor, b);
      end = Math.max(d.anchor, b) + SLOT;
    } else if (d.mode === 'move') {
      const dur = d.origEnd - d.origStart;
      start = clamp(d.origStart + snapRound(m - d.anchor), 0, DAY_MIN - dur);
      end = start + dur;
    } else if (d.mode === 'top') {
      start = clamp(snapRound(m), 0, d.origEnd - SLOT);
    } else {
      end = clamp(snapRound(m), d.origStart + SLOT, DAY_MIN);
    }
    setDrag({ ...d, moved: true, start, end });
  };

  const onUp = () => {
    const d = dragRef.current;
    if (!d) return;
    setDrag(null);
    if (d.mode === 'create') {
      const [s, en] = d.moved ? [d.start, d.end] : [d.anchor, Math.min(DAY_MIN, d.anchor + 30)];
      ui.openBlock({ date, kind, isNew: true, block: { id: newId(), start: s, end: en, title: '' } });
      return;
    }
    const b = blocks.find((x) => x.id === d.id);
    if (!b) return;
    if (!d.moved) {
      ui.openBlock({ date, kind, block: b, isNew: false });
      return;
    }
    update(
      date,
      (prev) =>
        ({
          [kind]: prev[kind].map((x) =>
            x.id === d.id
              ? { ...x, start: d.start, end: d.end, running: d.mode === 'bottom' ? undefined : x.running }
              : x,
          ),
        }) as DayPatch,
    );
  };

  const onDragOver = (e: DragEvent) => {
    if (e.dataTransfer.types.includes(TASK_MIME)) {
      e.preventDefault();
      e.dataTransfer.dropEffect = 'copy';
    }
  };

  const onDrop = (e: DragEvent) => {
    const raw = e.dataTransfer.getData(TASK_MIME);
    if (!raw) return;
    e.preventDefault();
    const t = JSON.parse(raw) as DraggedTask;
    const s = clamp(snapFloor(toMin(e.clientY)), 0, DAY_MIN - SLOT);
    const en = Math.min(DAY_MIN, s + (t.estimateMin || 30));
    const block: Block = { id: newId(), start: s, end: en, title: t.title, categoryId: t.categoryId, taskId: t.id };
    update(date, (prev) => ({ [kind]: [...prev[kind], block] }) as DayPatch);
  };

  const items: Item[] = [
    ...blocks.map((b): Item => {
      let start = b.start;
      let end = b.end;
      if (drag?.id === b.id && drag.moved) {
        start = drag.start;
        end = drag.end;
      } else if (b.running && isToday) {
        end = Math.max(b.end, snapCeil(nowMin));
      }
      return { type: 'block', b, start, end };
    }),
    ...external.filter((e) => !e.allDay).map((e): Item => ({ type: 'ext', e, start: e.start, end: e.end })),
  ];

  return (
    <div
      ref={ref}
      className={`lane lane-${kind}`}
      onPointerDown={onLaneDown}
      onPointerMove={onMove}
      onPointerUp={onUp}
      onPointerCancel={() => setDrag(null)}
      onDragOver={onDragOver}
      onDrop={onDrop}
    >
      {layoutColumns(items).map((it) => {
        const style = {
          top: y(it.start),
          height: Math.max(y(it.end) - y(it.start), 4),
          left: `calc(${(it.col / it.cols) * 100}% + 1px)`,
          width: `calc(${100 / it.cols}% - 2px)`,
        };
        const time = `${fmtTime(it.start)}–${fmtTime(it.end)}`;
        if (it.type === 'ext') {
          return (
            <div
              key={`ext-${it.e.calendarId}-${it.e.id}`}
              className="blk ext"
              style={{ ...style, '--c': it.e.color ?? '#7a8699' } as CSSProperties}
              title={`${time} ${it.e.title}（Google カレンダー）`}
              onPointerDown={(ev) => ev.stopPropagation()}
              onClick={() => ui.openExternal(it.e)}
            >
              <div className="blk-body">
                <span className="blk-title">{it.e.title}</span>
                {it.end - it.start >= 45 && <span className="blk-time">{time}</span>}
              </div>
            </div>
          );
        }
        const b = it.b;
        return (
          <div
            key={b.id}
            className={`blk ${b.running ? 'running' : ''} ${drag?.id === b.id && drag.moved ? 'dragging' : ''}`}
            style={{ ...style, '--c': colorOf(b.categoryId) } as CSSProperties}
            title={`${time} ${b.title}`}
            onPointerDown={(ev) => onBlockDown(ev, b)}
          >
            <div className="h h-top" data-h="top" />
            <div className="blk-body">
              <span className="blk-title">
                {b.gcalEventId && <span className="blk-flag">📅</span>}
                {b.title || (b.running ? '記録中…' : '(無題)')}
              </span>
              {it.end - it.start >= 45 && <span className="blk-time">{time}</span>}
            </div>
            <div className="h h-bottom" data-h="bottom" />
          </div>
        );
      })}
      {drag?.mode === 'create' && drag.moved && (
        <div className="blk ghost" style={{ top: y(drag.start), height: y(drag.end) - y(drag.start) }}>
          <span className="blk-time">
            {fmtTime(drag.start)}–{fmtTime(drag.end)}
          </span>
        </div>
      )}
    </div>
  );
}
