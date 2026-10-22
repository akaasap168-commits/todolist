import { useState } from 'react';
import { useAppData } from '../../data/hooks';
import { todayKey } from '../../lib/date';
import { setSoundVolume } from './ambient';
import { SoundSelect, useSoundFiles, VolumeSlider } from './controls';
import { BREAK_MIN, fmtRemaining, PRESETS } from './engine';
import { usePomodoro } from './PomodoroContext';
import { useSpotify } from './SpotifyContext';

export function PomodoroPanel({ onClose }: { onClose: () => void }) {
  const { cycle, remaining, notice, start, pause, resume, skip, stop, setTask, recordNotice, dismissNotice } = usePomodoro();
  const { settings, updateSettings, tasks } = useAppData();
  const { files } = useSoundFiles();
  const spotify = useSpotify();
  /** Chosen before a cycle exists; afterwards the cycle itself holds it. */
  const [pendingTask, setPendingTask] = useState<string>('');
  const p = settings.pomodoro;
  const today = todayKey();

  const patch = (v: Partial<typeof p>) => updateSettings({ pomodoro: { ...p, ...v } });

  // Say outright what the break will play, so silence is never a mystery.
  const breakLabel =
    p.breakSource === 'spotify'
      ? `Spotify${p.spotify.contextUri ? `（${p.spotify.contextName || 'プレイリスト設定済み'}）` : '（プレイリスト未選択）'}`
      : p.breakSource === 'file'
        ? (files.find((f) => f.id === p.breakFileId)?.name ?? '自分の音源（未選択）')
        : 'なし';

  // Open tasks, the ones due today first: what you are most likely sitting down to do.
  const choices = tasks
    .filter((t) => !t.done)
    .sort(
      (a, b) =>
        Number(!!b.dueDate && b.dueDate <= today) - Number(!!a.dueDate && a.dueDate <= today) || a.order - b.order,
    )
    .slice(0, 30);

  return (
    <aside className="pomo" aria-label="ポモドーロタイマー">
      <div className="pomo-head">
        <h2>ポモドーロ</h2>
        <button className="icon-btn" onClick={onClose} aria-label="閉じる">
          ×
        </button>
      </div>

      {notice && (
        <div className="pomo-notice">
          <p>{notice.text}</p>
          <div className="row wrap">
            {notice.segment && (
              <button className="btn small" onClick={recordNotice}>
                Real に記録する
              </button>
            )}
            <button className="btn small ghost" onClick={dismissNotice}>
              閉じる
            </button>
          </div>
        </div>
      )}

      <label className="inline pomo-task">
        ToDo
        <select
          value={cycle ? (cycle.taskId ?? '') : pendingTask}
          onChange={(e) => {
            const v = e.target.value;
            setPendingTask(v);
            if (cycle) setTask(v || undefined);
          }}
        >
          <option value="">（紐づけなし）</option>
          {choices.map((t) => (
            <option key={t.id} value={t.id}>
              {t.title}
            </option>
          ))}
        </select>
      </label>

      {!cycle ? (
        <div className="pomo-start">
          <div className="pomo-presets">
            {PRESETS.map((n) => (
              <button key={n} className="btn primary pomo-preset" onClick={() => start(n, pendingTask || undefined)}>
                <strong>{n}分</strong>
                <span>休憩 {BREAK_MIN[n]}分</span>
              </button>
            ))}
          </div>
          <p className="muted small">選ぶとすぐに始まり、集中と休憩が自動で切り替わります。</p>
        </div>
      ) : (
        <div className={`pomo-run ${cycle.phase}`}>
          <div className="pomo-phase">
            {cycle.phase === 'focus' ? '集中' : '休憩'}
            {cycle.paused && <span className="muted">（一時停止）</span>}
          </div>
          <div className="pomo-time">{fmtRemaining(remaining)}</div>
          <p className="muted small">
            {cycle.preset}分 / {BREAK_MIN[cycle.preset]}分 ・ 完了 {cycle.sets} セット
          </p>
          <div className="row wrap pomo-actions">
            {cycle.paused ? (
              <button className="btn primary" onClick={resume}>
                ▶ 再開
              </button>
            ) : (
              <button className="btn" onClick={pause}>
                ⏸ 一時停止
              </button>
            )}
            <button className="btn small" onClick={skip} title={cycle.phase === 'focus' ? '集中を切り上げて休憩へ' : '休憩を切り上げて集中へ'}>
              ⏭ 次へ
            </button>
            <button className="btn small ghost" onClick={stop}>
              ■ 終了
            </button>
          </div>
          {cycle.phase === 'break' && p.breakSource === 'spotify' && (
            <div className="row pomo-tracks">
              <button
                className="btn small"
                aria-label="前の曲へ"
                title="前の曲へ"
                onClick={() => void spotify.previous(p.spotify.deviceId)}
              >
                ⏮
              </button>
              <button
                className="btn small"
                aria-label="次の曲へ"
                title="次の曲へ"
                onClick={() => void spotify.next(p.spotify.deviceId)}
              >
                ⏭
              </button>
            </div>
          )}
        </div>
      )}

      <div className="pomo-sound">
        <label className="inline">
          集中中の音
          <SoundSelect value={p.focusSound} onChange={(v) => patch({ focusSound: v })} files={files} label="集中中の音" />
        </label>
        <VolumeSlider
          label="集中中の音量"
          value={p.focusVolume}
          onLive={(v) => {
            if (cycle?.phase === 'focus') setSoundVolume(v);
          }}
          onCommit={(v) => patch({ focusVolume: v })}
        />
        <p className="muted small">休憩中: {breakLabel} ・ 変更は ⚙ 設定 &gt; BGM</p>
      </div>
    </aside>
  );
}
