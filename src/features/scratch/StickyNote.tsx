import { useState } from 'react';
import { useDays, useDoc, useNow, useStore } from '../../data/hooks';
import type { Scratch } from '../../data/types';
import { toKey } from '../../lib/date';
import { SLOT, fmtDuration, fmtTime, nowMinutes } from '../../lib/time';
import { TextField } from '../../ui';

const relative = (ts: number, now: number) => {
  const m = Math.floor((now - ts) / 60000);
  if (m < 1) return 'たった今';
  if (m < 60) return `${m}分前`;
  const h = Math.floor(m / 60);
  return h < 24 ? `${h}時間前` : `${Math.floor(h / 24)}日前`;
};

/** A monitor-sized sticky note: what you were doing when you stepped away. */
export function StickyNote({ onClose }: { onClose: () => void }) {
  const store = useStore();
  const now = useNow(20_000);
  const { data } = useDoc<Scratch>('meta/scratch');
  const today = toKey(now);
  const { days } = useDays([today]);
  const running = days[today]?.real.find((b) => b.running);
  const [version, setVersion] = useState(0);

  const text = data?.text ?? '';
  const save = (t: string) => void store.setDoc('meta/scratch', { text: t, updatedAt: Date.now() });

  return (
    <aside className="sticky-note" aria-label="一時メモ">
      <div className="sn-head">
        <span className="sn-title">📌 メモ</span>
        {text.trim() && data?.updatedAt ? <span className="sn-time">{relative(data.updatedAt, now.getTime())}</span> : null}
        <button className="icon-btn" onClick={onClose} aria-label="メモを隠す">
          ×
        </button>
      </div>
      <TextField
        key={version}
        multiline
        rows={4}
        className="sn-text"
        value={text}
        onCommit={save}
        placeholder="離席前に書いておく&#10;例: 請求書 3ページ目まで確認済み&#10;次は金額の突き合わせから"
      />
      <div className="sn-foot">
        {running ? (
          <span className="sn-running" title="記録中の Real ブロック">
            ● {running.title || '(無題)'} ・ {fmtTime(running.start)} から{' '}
            {fmtDuration(Math.max(SLOT, nowMinutes(now) - running.start))}
          </span>
        ) : (
          <span className="muted small">M キーで開閉</span>
        )}
        {text.trim() && (
          <button
            className="link"
            onClick={() => {
              if (!confirm('メモを消しますか？')) return;
              save('');
              setVersion((v) => v + 1);
            }}
          >
            クリア
          </button>
        )}
      </div>
    </aside>
  );
}
