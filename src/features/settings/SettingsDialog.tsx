import { useState } from 'react';
import type { Session } from '../../Root';
import { newId } from '../../data/defaults';
import { useAppData } from '../../data/hooks';
import { LocalStore } from '../../data/store';
import type { Category, PomodoroSettings } from '../../data/types';
import { Modal, TextField } from '../../ui';
import { useGcal } from '../calendar/GcalContext';
import { choiceFileId, forgetFile, playSound, stopSound } from '../pomodoro/ambient';
import { SoundSelect, useSoundFiles, VolumeSlider } from '../pomodoro/controls';
import { usePomodoro } from '../pomodoro/PomodoroContext';
import { toContextUri, useSpotify } from '../pomodoro/SpotifyContext';
import { deleteSoundFile, putSoundFile } from '../pomodoro/soundFiles';

const HOURS = Array.from({ length: 24 }, (_, i) => i);
const MAX_SOUND_MB = 50;

export function SettingsDialog({ session, onClose }: { session: Session; onClose: () => void }) {
  const { settings, updateSettings } = useAppData();
  const gcal = useGcal();
  const spotify = useSpotify();
  const { cycle } = usePomodoro();
  const { files, reload: reloadFiles } = useSoundFiles();
  const [migrating, setMigrating] = useState<string | null>(null);
  const [uriInput, setUriInput] = useState('');
  const [uriError, setUriError] = useState<string | null>(null);
  const [soundError, setSoundError] = useState<string | null>(null);
  const [notifPerm, setNotifPerm] = useState<NotificationPermission>(() =>
    typeof Notification === 'undefined' ? 'denied' : Notification.permission,
  );
  const localCount = session.mode === 'firebase' ? LocalStore.dumpAll().length : 0;
  const p = settings.pomodoro;

  /** The saved choice stays selectable even before the playlist list is loaded. */
  const playlistOptions = [
    ...(p.spotify.contextUri && !spotify.playlists.some((x) => x.uri === p.spotify.contextUri)
      ? [{ uri: p.spotify.contextUri, name: p.spotify.contextName || p.spotify.contextUri }]
      : []),
    ...spotify.playlists.map((x) => ({ uri: x.uri, name: x.name })),
  ];

  const setPomo = (v: Partial<PomodoroSettings>) => updateSettings({ pomodoro: { ...p, ...v } });
  const setSpotifySettings = (v: Partial<PomodoroSettings['spotify']>) =>
    setPomo({ spotify: { ...p.spotify, ...v } });

  /**
   * Picking something to play is a clear statement of intent. Without this the
   * break would stay silent, because the source would still be "none".
   */
  const chooseContext = (contextUri: string, contextName: string) =>
    setPomo({
      spotify: { ...p.spotify, contextUri, contextName },
      ...(contextUri && p.breakSource === 'none' ? { breakSource: 'spotify' as const } : {}),
    });

  const addSoundFile = async (file: File) => {
    setSoundError(null);
    if (file.size > MAX_SOUND_MB * 1024 * 1024) {
      setSoundError(`${MAX_SOUND_MB}MB を超えるファイルは登録できません。`);
      return;
    }
    try {
      await putSoundFile(newId(), file);
      reloadFiles();
    } catch (e) {
      setSoundError(`登録に失敗しました: ${(e as Error).message}`);
    }
  };

  const removeSoundFile = async (id: string) => {
    await deleteSoundFile(id);
    forgetFile(id);
    reloadFiles();
    const patch: Partial<PomodoroSettings> = {};
    if (choiceFileId(p.focusSound) === id) patch.focusSound = 'none';
    if (p.breakFileId === id) patch.breakFileId = undefined;
    if (Object.keys(patch).length) setPomo(patch);
  };

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
        <h3>ポモドーロ</h3>
        <label className="check">
          <input type="checkbox" checked={p.autoRecord} onChange={(e) => setPomo({ autoRecord: e.target.checked })} />
          集中が終わったら Real に自動で記録する
        </label>
        {p.autoRecord && (
          <label className="inline">
            記録のカテゴリ
            <select
              value={p.recordCategoryId ?? ''}
              onChange={(e) => setPomo({ recordCategoryId: e.target.value || undefined })}
            >
              <option value="">なし</option>
              {settings.categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </label>
        )}
        <div className="row wrap">
          <label className="check">
            <input type="checkbox" checked={p.chime} onChange={(e) => setPomo({ chime: e.target.checked })} />
            切り替わるときにチャイムを鳴らす
          </label>
          <label className="check">
            <input type="checkbox" checked={p.notify} onChange={(e) => setPomo({ notify: e.target.checked })} />
            通知を出す
          </label>
        </div>
        {p.notify && notifPerm === 'default' && (
          <button
            className="btn small"
            onClick={() => void Notification.requestPermission().then((r) => setNotifPerm(r))}
          >
            通知を許可する
          </button>
        )}
        {p.notify && notifPerm === 'denied' && (
          <p className="muted small">このサイトの通知がブラウザ側で拒否されています。ブラウザの設定から許可してください。</p>
        )}
        <p className="muted small">
          タイマーの進み具合はこの端末にだけ保存されます（設定はログインしていれば端末間で同期します）。
        </p>
      </section>

      <section className="settings-sec">
        <h3>BGM</h3>
        <h4>集中中</h4>
        <div className="row wrap">
          <SoundSelect value={p.focusSound} onChange={(v) => setPomo({ focusSound: v })} files={files} label="集中中の音" />
          <VolumeSlider label="集中中の音量" value={p.focusVolume} onCommit={(v) => setPomo({ focusVolume: v })} />
          {!cycle && (
            <>
              <button className="btn small ghost" onClick={() => void playSound(p.focusSound, p.focusVolume)}>
                試聴
              </button>
              <button className="btn small ghost" onClick={stopSound}>
                停止
              </button>
            </>
          )}
        </div>
        <p className="muted small">
          川・雨・波・焚き火はブラウザが音を合成しています。音源ファイルを持たないので、オフラインでも鳴ります。
        </p>

        <h4>休憩中</h4>
        <div className="row wrap">
          <label className="inline">
            音源
            <select
              value={p.breakSource}
              onChange={(e) => setPomo({ breakSource: e.target.value as PomodoroSettings['breakSource'] })}
            >
              <option value="none">なし</option>
              <option value="spotify">Spotify</option>
              <option value="file">自分の音源</option>
            </select>
          </label>
          {p.breakSource === 'file' && (
            <label className="inline">
              ファイル
              <select value={p.breakFileId ?? ''} onChange={(e) => setPomo({ breakFileId: e.target.value || undefined })}>
                <option value="">選んでください</option>
                {files.map((f) => (
                  <option key={f.id} value={f.id}>
                    {f.name}
                  </option>
                ))}
              </select>
            </label>
          )}
          <VolumeSlider label="休憩中の音量" value={p.breakVolume} onCommit={(v) => setPomo({ breakVolume: v })} />
        </div>

        <h4>自分の音源</h4>
        <input
          type="file"
          accept="audio/*"
          aria-label="音源ファイルを追加"
          onChange={(e) => {
            const f = e.target.files?.[0];
            e.target.value = '';
            if (f) void addSoundFile(f);
          }}
        />
        {files.length > 0 && (
          <ul className="sound-list">
            {files.map((f) => (
              <li key={f.id}>
                <span>{f.name}</span>
                <span className="muted small">{(f.blob.size / 1024 / 1024).toFixed(1)}MB</span>
                <button className="icon-btn" aria-label="削除" onClick={() => void removeSoundFile(f.id)}>
                  ×
                </button>
              </li>
            ))}
          </ul>
        )}
        {soundError && <p className="err-text small">{soundError}</p>}
        <p className="muted small">
          音源はこの端末の中（IndexedDB）に保存され、ほかの端末には同期されません。{MAX_SOUND_MB}MB まで。
        </p>
      </section>

      <section className="settings-sec">
        <h3>Spotify（休憩中の音楽）</h3>
        {!spotify.configured && (
          <p className="muted">
            未設定です。SETUP.md の「Spotify 連携」の手順でクライアント ID を設定すると使えます。Spotify Premium が必要です。
          </p>
        )}
        {spotify.configured && !spotify.connected && (
          <>
            <p className="muted small">
              Spotify Premium のアカウントが必要です。接続すると、このタブやお使いの Spotify アプリを再生先に選べます。
            </p>
            <button className="btn primary" onClick={spotify.connect}>
              Spotify に接続
            </button>
          </>
        )}
        {spotify.connected && (
          <>
            <p className="small">
              {spotify.profile?.name ?? '接続済み'}
              {spotify.profile && <span className="muted">（{spotify.profile.product}）</span>}
            </p>
            {spotify.planWarning && <p className="err-text small">{spotify.planWarning}</p>}

            <h4>休憩中に流すもの</h4>
            <div className="row wrap">
              <select
                value={p.spotify.contextUri}
                onChange={(e) => {
                  const uri = e.target.value;
                  chooseContext(uri, spotify.playlists.find((x) => x.uri === uri)?.name ?? '');
                }}
              >
                <option value="">選んでください</option>
                {playlistOptions.map((o) => (
                  <option key={o.uri} value={o.uri}>
                    {o.name}
                  </option>
                ))}
              </select>
              <button className="btn small" onClick={() => void spotify.loadPlaylists()}>
                プレイリストを読み込む
              </button>
            </div>
            <div className="row wrap">
              <input
                className="tf boxed"
                placeholder="プレイリストのリンクを貼り付け"
                value={uriInput}
                onChange={(e) => setUriInput(e.target.value)}
              />
              <button
                className="btn small"
                onClick={() => {
                  const uri = toContextUri(uriInput);
                  if (!uri) {
                    setUriError('Spotify のプレイリストまたはアルバムのリンクを貼ってください。');
                    return;
                  }
                  setUriError(null);
                  chooseContext(uri, uriInput.trim());
                  setUriInput('');
                }}
              >
                設定
              </button>
            </div>
            {uriError && <p className="err-text small">{uriError}</p>}
            <p className="muted small">
              Spotify が作った公式プレイリストは一覧に出てこないため、その場合はリンクを貼って指定してください。
            </p>

            <h4>再生先</h4>
            <div className="row wrap">
              <select value={p.spotify.deviceId} onChange={(e) => setSpotifySettings({ deviceId: e.target.value })}>
                <option value="">このタブ{spotify.webDeviceId ? '' : '（準備前）'}</option>
                {spotify.devices.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.name}（{d.type}）
                  </option>
                ))}
              </select>
              <button
                className="btn small"
                onClick={() => {
                  void spotify.prepare();
                  void spotify.refreshDevices();
                }}
              >
                再生先を更新
              </button>
              <label className="check">
                <input
                  type="checkbox"
                  checked={p.spotify.shuffle}
                  onChange={(e) => setSpotifySettings({ shuffle: e.target.checked })}
                />
                シャッフル
              </label>
            </div>
            <div className="row wrap">
              <button
                className="btn small"
                disabled={!p.spotify.contextUri}
                onClick={() =>
                  void spotify.prepare().then(() =>
                    spotify.play({
                      contextUri: p.spotify.contextUri,
                      deviceId: p.spotify.deviceId,
                      shuffle: p.spotify.shuffle,
                      volume: p.breakVolume,
                    }),
                  )
                }
              >
                試聴
              </button>
              <button className="btn small ghost" onClick={() => void spotify.pause()}>
                停止
              </button>
              <button className="btn small ghost" onClick={spotify.disconnect}>
                接続を解除
              </button>
            </div>
            {spotify.error && <p className="err-text small">{spotify.error}</p>}
          </>
        )}
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
            <tr><td><kbd>P</kbd></td><td>ポモドーロタイマー</td></tr>
            <tr><td><kbd>M</kbd></td><td>一時メモ（付箋）の開閉</td></tr>
            <tr><td><kbd>/</kbd></td><td>検索</td></tr>
            <tr><td><kbd>Esc</kbd></td><td>ダイアログを閉じる</td></tr>
          </tbody>
        </table>
      </section>
    </Modal>
  );
}
