import { useState } from 'react';
import { newId } from '../../data/defaults';
import { useAppData, useDays, type DayPatch } from '../../data/hooks';
import type { Template } from '../../data/types';
import { fmtKeyJa } from '../../lib/date';
import { fmtDuration, fmtTime } from '../../lib/time';
import { Modal, TextField } from '../../ui';

export function TemplateDialog({ date, onClose }: { date: string; onClose: () => void }) {
  const { templates, saveTemplate, deleteTemplate } = useAppData();
  const { days, update } = useDays([date]);
  const day = days[date];
  const [name, setName] = useState('');
  const [withPriorities, setWithPriorities] = useState(true);
  const [saved, setSaved] = useState<string | null>(null);

  const apply = (t: Template, mode: 'replace' | 'add') => {
    const blocks = t.blocks.map((b) => ({
      id: newId(),
      start: b.start,
      end: b.end,
      title: b.title,
      categoryId: b.categoryId,
    }));
    update(date, (p) => {
      const patch: DayPatch = { vision: mode === 'replace' ? blocks : [...p.vision, ...blocks] };
      if (withPriorities && t.priorities?.some((x) => x)) {
        patch.priorities = p.priorities.map((x, i) => (t.priorities![i] ? { text: t.priorities![i], done: false } : x));
      }
      return patch;
    });
    onClose();
  };

  const saveCurrent = () => {
    const blocks = day.vision
      .map((b) => ({ start: b.start, end: b.end, title: b.title, categoryId: b.categoryId }))
      .sort((a, b) => a.start - b.start);
    if (!blocks.length) {
      alert('この日の Vision が空です。先に予定を作ってから保存してください。');
      return;
    }
    const now = Date.now();
    const tplName = name.trim() || `テンプレート${templates.length + 1}`;
    saveTemplate({
      id: newId(),
      name: tplName,
      blocks,
      priorities: day.priorities.map((p) => p.text),
      createdAt: now,
      updatedAt: now,
    });
    setName('');
    setSaved(`「${tplName}」を保存しました`);
  };

  return (
    <Modal title="テンプレート" onClose={onClose} wide>
      <p className="muted small">適用先: {fmtKeyJa(date)}</p>

      {templates.length === 0 ? (
        <p className="muted">
          まだテンプレートがありません。いつもの一日を Vision に作ってから、下の「この日の Vision を保存」で登録してください。
        </p>
      ) : (
        <>
          <label className="check">
            <input type="checkbox" checked={withPriorities} onChange={(e) => setWithPriorities(e.target.checked)} />
            Daily Priorities も一緒に反映する
          </label>
          <ul className="tpl-list">
            {templates.map((t) => {
              const total = t.blocks.reduce((s, b) => s + b.end - b.start, 0);
              const from = t.blocks.length ? Math.min(...t.blocks.map((b) => b.start)) : 0;
              const to = t.blocks.length ? Math.max(...t.blocks.map((b) => b.end)) : 0;
              return (
                <li key={t.id}>
                  <div className="tpl-main">
                    <TextField
                      className="boxed"
                      value={t.name}
                      onCommit={(n) => saveTemplate({ ...t, name: n.trim() || t.name })}
                    />
                    <span className="muted small">
                      {t.blocks.length}件 ・ {fmtTime(from)}–{fmtTime(to)} ・ 合計 {fmtDuration(total)}
                    </span>
                    <span className="tpl-preview">
                      {t.blocks
                        .slice(0, 4)
                        .map((b) => b.title || '(無題)')
                        .join(' / ')}
                      {t.blocks.length > 4 ? ' …' : ''}
                    </span>
                  </div>
                  <div className="tpl-actions">
                    <button className="btn small primary" onClick={() => apply(t, 'replace')} title="この日の Vision を置き換えます">
                      置き換え
                    </button>
                    <button className="btn small" onClick={() => apply(t, 'add')} title="今ある Vision に足します">
                      追加
                    </button>
                    <button
                      className="icon-btn"
                      aria-label="削除"
                      onClick={() => confirm(`テンプレート「${t.name}」を削除しますか？`) && deleteTemplate(t.id)}
                    >
                      🗑
                    </button>
                  </div>
                </li>
              );
            })}
          </ul>
        </>
      )}

      <section className="settings-sec">
        <h3>この日の Vision を保存</h3>
        <div className="row wrap">
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="名前 例: 平日の基本形" className="tpl-name" />
          <button className="btn" onClick={saveCurrent}>
            保存
          </button>
          {saved && <span className="small">{saved}</span>}
        </div>
        <p className="muted small">
          {fmtKeyJa(date)} の Vision {day.vision.length} 件と Daily Priorities を、新しいテンプレートとして登録します。
        </p>
      </section>

      <div className="modal-foot">
        <span className="spacer" />
        <button className="btn" onClick={onClose}>
          閉じる
        </button>
      </div>
    </Modal>
  );
}
