import { useEffect, type CSSProperties } from 'react';
import { useDays, useNow, useSettings } from '../../data/hooks';
import { toKey } from '../../lib/date';
import { adherence, fmtDuration, totalMinutes } from '../../lib/time';
import { TextField, useUI } from '../../ui';
import { useGcal, useGcalEvents } from '../calendar/GcalContext';
import { startNow, stopRunning } from '../timeline/recording';
import { Timeline, computeRange } from '../timeline/Timeline';
import { DailyPriorities } from './DailyPriorities';

export function DayView({ date }: { date: string }) {
  const settings = useSettings();
  const ui = useUI();
  const gcal = useGcal();
  const now = useNow();
  const { days, update } = useDays([date]);
  const day = days[date];
  const ext = useGcalEvents([date])[date] ?? [];
  const range = computeRange(settings, [day], ext);
  const rate = adherence(day.vision, day.real);
  const isToday = toKey(now) === date;
  const running = day.real.some((b) => b.running);
  const allDay = ext.filter((e) => e.allDay);

  useEffect(() => {
    document.querySelector('.day .now-line')?.scrollIntoView({ block: 'center' });
  }, [date]);

  return (
    <div className="day">
      <div className="day-head">
        <div className="day-stats">
          <span>Vision {fmtDuration(totalMinutes(day.vision))}</span>
          <span>Real {fmtDuration(totalMinutes(day.real))}</span>
          {rate !== null && <span title="Vision の時間のうち、Real も記録されている割合">予定どおり率 {Math.round(rate * 100)}%</span>}
        </div>
        <div className="day-actions">
          {isToday && (
            <button className="btn primary small" onClick={() => startNow(date, update, ui.openBlock)}>
              ▶ 今から記録
            </button>
          )}
          {running && (
            <button className="btn small" onClick={() => stopRunning(date, update)}>
              ■ 記録終了
            </button>
          )}
          {gcal.canExport && day.vision.length > 0 && (
            <button className="btn small ghost" onClick={() => gcal.pushDay(date, day.vision, update)}>
              📅 Vision を全部カレンダーへ
            </button>
          )}
        </div>
      </div>

      <section className="card">
        <h2 className="sec-title">
          Daily Priorities <small>今日優先すること</small>
        </h2>
        <DailyPriorities date={date} day={day} update={update} />
      </section>

      {allDay.length > 0 && (
        <div className="allday">
          {allDay.map((e) => (
            <span key={e.calendarId + e.id} className="chip on" style={{ '--c': e.color ?? '#7a8699' } as CSSProperties}>
              {e.title}
            </span>
          ))}
        </div>
      )}

      <section className="card tl-card">
        <div className="lane-heads with-gutter">
          <span>
            Vision <small>理想の予定</small>
          </span>
          <span>
            Real <small>実際</small>
          </span>
        </div>
        <Timeline date={date} day={day} update={update} range={range} slotPx={22} labels="gutter" external={ext} />
      </section>

      <section className="card">
        <h2 className="sec-title">メモ</h2>
        <TextField multiline value={day.note ?? ''} onCommit={(note) => update(date, () => ({ note }))} placeholder="今日の気づき・振り返り" />
      </section>
    </div>
  );
}
