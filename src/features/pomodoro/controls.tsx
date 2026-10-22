import { useCallback, useEffect, useState } from 'react';
import { AMBIENTS, fileChoice, type SoundChoice } from './ambient';
import { listSoundFiles, type SoundFile } from './soundFiles';

/** The user's own audio files, read from IndexedDB. */
export function useSoundFiles(): { files: SoundFile[]; reload: () => void } {
  const [files, setFiles] = useState<SoundFile[]>([]);
  const reload = useCallback(() => {
    void listSoundFiles()
      .then((f) => setFiles([...f].sort((a, b) => a.addedAt - b.addedAt)))
      .catch(() => setFiles([]));
  }, []);
  useEffect(() => reload(), [reload]);
  return { files, reload };
}

/**
 * A slider that reports continuously while dragging but only saves on release,
 * so dragging it does not write to the store on every pixel.
 */
export function VolumeSlider({
  value,
  onCommit,
  onLive,
  label,
}: {
  value: number;
  onCommit: (v: number) => void;
  onLive?: (v: number) => void;
  label: string;
}) {
  const [v, setV] = useState(value);
  useEffect(() => setV(value), [value]);
  const commit = () => {
    if (v !== value) onCommit(v);
  };
  return (
    <input
      className="vol"
      type="range"
      min={0}
      max={1}
      step={0.05}
      value={v}
      aria-label={label}
      onChange={(e) => {
        const n = Number(e.target.value);
        setV(n);
        onLive?.(n);
      }}
      onPointerUp={commit}
      onKeyUp={commit}
      onBlur={commit}
    />
  );
}

export function SoundSelect({
  value,
  onChange,
  files,
  label,
}: {
  value: SoundChoice;
  onChange: (v: SoundChoice) => void;
  files: SoundFile[];
  label: string;
}) {
  return (
    <select value={value} onChange={(e) => onChange(e.target.value)} aria-label={label}>
      <option value="none">なし</option>
      <optgroup label="環境音">
        {AMBIENTS.map((a) => (
          <option key={a.id} value={a.id}>
            {a.name}
          </option>
        ))}
      </optgroup>
      {files.length > 0 && (
        <optgroup label="自分の音源">
          {files.map((f) => (
            <option key={f.id} value={fileChoice(f.id)}>
              {f.name}
            </option>
          ))}
        </optgroup>
      )}
    </select>
  );
}
