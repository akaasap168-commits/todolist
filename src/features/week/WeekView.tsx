import { addDays, format } from 'date-fns';
import { useEffect, useMemo, type CSSProperties } from 'react';
import { useDays, useNow, useSettings } from '../../data/hooks';
import { DOW, fromKey, toKey, weekDates, weekId, weekStartOf } from '../../lib/date';
import { adherence } from '../../lib/time';
import { useUI } from '../../ui';
import { useGcalEvents } from '../calendar/GcalContext';
import { DailyPriorities } from '../day/DailyPriorities';
import { startNow } from '../timeline/recording';
import { Timeline, computeRange } from '../timeline/Timeline';
import { WeekSections } from './WeekSections';

export function WeekView({ date }: { date: string }) {
  const settings = useSettings();
  const ui = useUI();
  const today = toKey(useNow());
  const start = useMemo(() => weekStartOf(fromKey(date), settings.weekStartsOn), [date, settings.weekStartsOn]);
  const dates = useMemo(() => weekDates(start), [start]);
  const { days, update } = useDays(dates);
  const ext = useGcalEvents(dates);
  const range = computeRange(
    settings,
    dates.map((d) => days[d]),
    dates.flatMap((d) => ext[d] ?? []),
  );

  useEffect(() => {
    document.querySelector('.week .now-line')?.scrollIntoView({ block: 'center', inline: 'nearest' });
  }, [start]);

  return (
    <div className="week">
      <div className="week-grid">
        <div className="wk-cell wk-head wk-corner">
          <div className="wk-month">{format(addDays(start, 3), 'yyyy年M月')}</div>
          <div className="muted small">{weekId(start, settings.weekStartsOn)}</div>
        </div>
        {dates.map((d) => {
          const dd = fromKey(d);
          const day = days[d];
          const rate = adherence(day.vision, day.real);
          const allDay = (ext[d] ?? []).filter((e) => e.allDay);
          return (
            <div key={d} className={`wk-cell wk-head wk-dayhead ${d === today ? 'today' : ''}`}>
              <div className="wk-dayhead-row">
                <button className="wk-date" onClick={() => ui.go('day', d)} title="1日ビューで開く">
                  <span className={`dow dow-${dd.getDay()}`}>{DOW[dd.getDay()]}</span>
                  <span className="dnum">
                    {dd.getMonth() + 1}/{dd.getDate()}
                  </span>
                </button>
                <span className="wk-dayhead-right">
                  {rate !== null && (
                    <span className="rate" title="予定どおり率">
                      {Math.round(rate * 100)}%
                    </span>
                  )}
                  {d === today && (
                    <button className="icon-btn tiny" title="今から記録" onClick={() => startNow(d, update, ui.openBlock)}>
                      ▶
                    </button>
                  )}
                </span>
              </div>
              {allDay.length > 0 && (
                <div className="allday">
                  {allDay.map((e) => (
                    <span key={e.calendarId + e.id} className="chip on tiny" style={{ '--c': e.color ?? '#7a8699' } as CSSProperties}>
                      {e.title}
                    </span>
                  ))}
                </div>
              )}
            </div>
          );
        })}

        <div className="wk-cell wk-side-label">
          <b>Daily Priorities</b>
          <small>今日優先すること</small>
        </div>
        {dates.map((d) => (
          <div key={d} className={`wk-cell ${d === today ? 'today' : ''}`}>
            <DailyPriorities date={d} day={days[d]} update={update} />
          </div>
        ))}

        <div className="wk-cell wk-side">
          <div className="wk-side-inner">
            <WeekSections start={start} dates={dates} days={days} />
          </div>
        </div>
        {dates.map((d) => (
          <div key={d} className={`wk-cell wk-tl ${d === today ? 'today' : ''}`}>
            <div className="lane-heads">
              <span>Vision</span>
              <span>Real</span>
            </div>
            <Timeline date={d} day={days[d]} update={update} range={range} slotPx={11} labels="center" external={ext[d]} />
          </div>
        ))}
      </div>
    </div>
  );
}
