import { newId } from '../../data/defaults';
import type { DayUpdater } from '../../data/hooks';
import type { Block } from '../../data/types';
import { SLOT, nowMinutes, snapCeil, snapFloor } from '../../lib/time';
import type { BlockTarget } from '../../ui';

/** Close any running Real block and start a new one at the current 15-minute slot. */
export function startNow(date: string, update: DayUpdater, openBlock: (t: BlockTarget) => void) {
  const slot = snapFloor(nowMinutes());
  const out: { block?: Block } = {};
  update(date, (prev) => {
    let start = slot;
    const real = prev.real.map((b) => {
      if (!b.running) return b;
      const end = Math.max(b.start + SLOT, slot);
      start = Math.max(start, end);
      return { ...b, running: undefined, end };
    });
    const block: Block = { id: newId(), start, end: start + SLOT, title: '', running: true };
    out.block = block;
    return { real: [...real, block] };
  });
  if (out.block) openBlock({ date, kind: 'real', block: out.block, isNew: false });
}

export function stopRunning(date: string, update: DayUpdater) {
  const now = nowMinutes();
  update(date, (prev) => ({
    real: prev.real.map((b) =>
      b.running ? { ...b, running: undefined, end: Math.max(b.start + SLOT, snapCeil(now)) } : b,
    ),
  }));
}
