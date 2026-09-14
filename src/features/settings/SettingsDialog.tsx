import { useState } from 'react';
import type { Session } from '../../Root';
import { newId } from '../../data/defaults';
import { useAppData } from '../../data/hooks';
import { LocalStore } from '../../data/store';
import type { Category } from '../../data/types';
import { Modal, TextField } from '../../ui';
import { useGcal } from '../calendar/GcalContext';

const HOURS = Array.from({ length: 24 }, (_, i) => i);

export function SettingsDialog({ session, onClose }: { session: Session; onClose: () => void }) {
  const { settings, updateSettings } = useAppData();
  const gcal = useGcal();
  const [migrating, setMigrating] = useState<string | null>(null);
  const localCount = session.mode === 'firebase' ? LocalStore.dumpAll().length : 0;

  const setCat = (i: number, patch: Partial<Category>) =>
    updateSettings({ categories: settings.categories.map((c, j) => (j === i ? { ...c, ...patch } : c)) });

  const toggleImport = (id: string) => {
    const ids = settings.gcal.importCalendarIds;
    updateSettings({
      gcal: { ...settings.gcal, importCalendarIds: ids.includes(id) ? ids.filter((x) => x !== id) : [...ids, id] },
    });
  };

  return (
    <Modal title="設定" onClose={onClose} wide>
      <section className="settings-sec">
        <h3>表示</h3>
        <div className="row wrap">
          <label className="inline">
            タイムライン
            <select value={settings.dayStart} onChange={(e) => updateSettings({ dayStart: Number(e.target.value) })}>
              {HOURS.filter((h) => h <= settings.dayEnd).map((h) => (
                <option key={h} value={h}>
                  {h}:00
                </option>
              ))}
            </select>
            〜
            <select value={settings.dayEnd} onChange={(e) => updateSettings({ dayEnd: Number(e.target.value) })}>
              {HOURS.filter((h) => h >= settings.dayStart).map((h) => (
                <option key={h} value={h}>
                  {h}時台
                </option>
              ))}
            </select>
          </label>
          <label className="inline">
            週の始まり
            <select value={settings.weekStartsOn} onChange={(e) => updateSettings({ weekStartsOn: Number(e.target.value) as 0 | 1 })}>
              <option value={0}>日曜</option>
              <option value={1}>月曜</option>
            </select>
          </label>
          <label className="inline">
            週間セクションの行数
            <select value={settings.weeklySectionRows} onChange={(e) => updateSettings({ weeklySectionRows: Number(e.target.value) })}>
              {[2, 3, 4, 5, 6, 8].map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </select>
          </label>
        </div>
        <p className="muted small">範囲外に予定がある日は、タイムラインが自動で広がります。</p>
      </section>

      <section className="settings-sec">
        <h3>カテゴリ</h3>
        <ul className="cat-list">
          {settings.categories.map((c, i) => (
            <li key={c.id}>
              <input type="color" value={c.color} onChange={(e) => setCat(i, { color: e.target.value })} aria-label="色" />
              <TextField value={c.name} onCommit={(name) => setCat(i, { name: name || c.name })} className="boxed" />
              <button
                className="icon-btn"
                aria-label="削除"
                onClick={() => {
                  if (confirm(`カテゴリ「${c.name}」を削除しますか？（既存の予定は「未分類」になります）`)) {
                    updateSettings({ categories: settings.categories.filter((x) => x.id !== c.id) });
                  }
                }}
              >
                ×
              </button>
            </li>
          ))}
        </ul>
        <button
          className="btn small"
          onClick={() => updateSettings({ categories: [...settings.categories, { id: newId(), name: '新しいカテゴリ', color: '#6c8ebf' }] })}
        >
          ＋ カテゴリを追加
        </button>
      </section>

      <section className="settings-sec">
        <h3>Google カレンダー</h3>
        {!gcal.configured && (
          <p className="muted">未設定です。SETUP.md の「Google カレンダー連携」の手順で OAuth クライアント ID を設定すると使えます。</p>
        )}
        {gcal.configured && !gcal.connected && (
          <>
            <p className="muted small">接続はこのタブを閉じるまで有効です。</p>
            <button className="btn primary" onClick={gcal.connect}>
              Google カレンダーに接続
            </button>
          </>
        )}
        {gcal.connected && (
          <>
            <h4>取り込むカレンダー（Vision 列に表示）</h4>
            <ul className="cal-list">
              {gcal.calendars.map((c) => (
                <li key={c.id}>
                  <label className="check">
                    <input
                      type="checkbox"
                      checked={settings.gcal.importCalendarIds.includes(c.id)}
                      disabled={c.id === settings.gcal.exportCalendarId}
                      onChange={() => toggleImport(c.id)}
                    />
                    <i className="dot" style={{ background: c.color }} />
                    {c.summary}
                    {c.primary && <span className="muted small">（メイン）</span>}
                  </label>
                </li>
              ))}
            </ul>
            <h4>Vision の書き出し先</h4>
            <select
              value={settings.gcal.exportCalendarId}
              onChange={(e) => updateSettings({ gcal: { ...settings.gcal, exportCalendarId: e.target.value } })}
            >
              <option value="">書き出さない</option>
              {gcal.calendars
                .filter((c) => c.writable)
                .map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.summary}
                  </option>
                ))}
            </select>
            <p className="muted small">専用の「Planner」カレンダーを作って選ぶのがおすすめです。書き出し先は取り込み対象から自動で外れます。</p>
            <button className="btn small ghost" onClick={gcal.disconnect}>
              接続を解除
            </button>
          </>
        )}
      </section>

      <section className="settings-sec">
        <h3>アカウントとデータ</h3>
        {session.mode === 'local' ? (
          <p className="muted">
            ローカル保存モードです。データはこのブラウザの中にだけ保存されます。SETUP.md の手順で Firebase を設定すると、ログインして複数端末で同期できるようになります（このデータは移行できます）。
          </p>
        ) : (
          <>
            <p>
              {session.user?.name} <span className="muted">{session.user?.email}</span>
            </p>
            <p className="small">
              UID: <code className="uid">{session.user?.uid}</code>{' '}
              <button className="btn small ghost" onClick={() => navigator.clipboard?.writeText(session.user?.uid ?? '')}>
                コピー
              </button>
            </p>
            <p className="muted small">Firestore のセキュリティルールに、この UID だけを許可してください（SETUP.md 参照）。</p>
            <div className="row wrap">
              {localCount > 0 && (
                <button
                  className="btn small"
                  disabled={!!migrating}
                  onClick={async () => {
                    if (!confirm('この端末のローカルデータを Firebase にコピーしますか？（同じ日付のデータは上書きされます）')) return;
                    setMigrating('移行中…');
                    try {
                      const n = await session.migrateLocal!();
                      setMigrating(`${n} 件を移行しました`);
                    } catch (e) {
                      setMigrating(`失敗しました: ${(e as Error).message}`);
                    }
                  }}
                >
                  この端末のローカルデータを移行
                </button>
              )}
              {migrating && <span className="small">{migrating}</span>}
              <button className="btn small ghost" onClick={session.signOut}>
                ログアウト
              </button>
            </div>
          </>
        )}
      </section>

      <section className="settings-sec">
        <h3>キーボードショートカット</h3>
        <table className="keys">
          <tbody>
            <tr><td><kbd>←</kbd> <kbd>→</kbd></td><td>前 / 次の週（日）</td></tr>
            <tr><td><kbd>T</kbd></td><td>今日へ</td></tr>
            <tr><td><kbd>W</kbd> / <kbd>D</kbd></td><td>週ビュー / 日ビュー</td></tr>
            <tr><td><kbd>N</kbd></td><td>ToDo を追加</td></tr>
            <tr><td><kbd>/</kbd></td><td>検索</td></tr>
            <tr><td><kbd>Esc</kbd></td><td>ダイアログを閉じる</td></tr>
          </tbody>
        </table>
      </section>
    </Modal>
  );
}
