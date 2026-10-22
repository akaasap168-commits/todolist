/**
 * Background sound for the timer.
 *
 * The ambient sounds are synthesised with the Web Audio API rather than shipped as
 * audio files: nothing to download, nothing to license, it works offline, and the
 * PWA cache stays small. The user's own files play through the same graph.
 */

import { getSoundFile } from './soundFiles';

export type AmbientId = 'river' | 'rain' | 'waves' | 'fire' | 'brown' | 'pink' | 'white';

export const AMBIENTS: { id: AmbientId; name: string }[] = [
  { id: 'river', name: '川' },
  { id: 'rain', name: '雨' },
  { id: 'waves', name: '波' },
  { id: 'fire', name: '焚き火' },
  { id: 'brown', name: 'ブラウンノイズ' },
  { id: 'pink', name: 'ピンクノイズ' },
  { id: 'white', name: 'ホワイトノイズ' },
];

/** 'none' | AmbientId | `file:<id>` */
export type SoundChoice = string;

export const fileChoice = (id: string) => `file:${id}`;
export const choiceFileId = (c: SoundChoice) => (c.startsWith('file:') ? c.slice(5) : null);

const FADE = 1.5; // seconds
const NOISE_SEC = 15;
const XFADE_SEC = 0.6; // length of the seam that is cross-faded away
const PEAK = 0.9; // every generated buffer is normalised to this, so nothing clips

let ctx: AudioContext | null = null;
let master: GainNode | null = null;
/** Each sound gets its own gain, so one can fade out while the next fades in. */
let current: { choice: SoundChoice; gain: GainNode; stop: (at: number) => void } | null = null;
const noiseCache = new Map<string, AudioBuffer>();
const fileCache = new Map<string, AudioBuffer>();

/** Must be called from a user gesture, or the browser keeps the context suspended. */
export function unlockAudio(): AudioContext {
  ctx ??= new AudioContext();
  if (ctx.state === 'suspended') void ctx.resume();
  master ??= (() => {
    const g = ctx!.createGain();
    g.gain.value = 1;
    g.connect(ctx!.destination);
    return g;
  })();
  return ctx;
}

// ---------------------------------------------------------------- noise

type NoiseKind = 'white' | 'pink' | 'brown';

/** Raw noise of the given kind. Amplitude is arbitrary; it gets normalised after. */
function generateNoise(kind: NoiseKind, n: number): Float32Array {
  const d = new Float32Array(n);
  if (kind === 'white') {
    for (let i = 0; i < n; i++) d[i] = Math.random() * 2 - 1;
  } else if (kind === 'brown') {
    // Random walk with a leak, which gives brown noise its steep low-end slope.
    let last = 0;
    for (let i = 0; i < n; i++) {
      last = (last + 0.02 * (Math.random() * 2 - 1)) * 0.995;
      d[i] = last;
    }
  } else {
    // Paul Kellet's pink noise filter.
    let b0 = 0;
    let b1 = 0;
    let b2 = 0;
    let b3 = 0;
    let b4 = 0;
    let b5 = 0;
    let b6 = 0;
    for (let i = 0; i < n; i++) {
      const w = Math.random() * 2 - 1;
      b0 = 0.99886 * b0 + w * 0.0555179;
      b1 = 0.99332 * b1 + w * 0.0750759;
      b2 = 0.969 * b2 + w * 0.153852;
      b3 = 0.8665 * b3 + w * 0.3104856;
      b4 = 0.55 * b4 + w * 0.5329522;
      b5 = -0.7616 * b5 - w * 0.016898;
      d[i] = b0 + b1 + b2 + b3 + b4 + b5 + b6 + w * 0.5362;
      b6 = w * 0.115926;
    }
  }
  return d;
}

function noiseBuffer(c: AudioContext, kind: NoiseKind): AudioBuffer {
  const cached = noiseCache.get(kind);
  if (cached) return cached;
  const len = Math.floor(c.sampleRate * NOISE_SEC);
  const xfade = Math.floor(c.sampleRate * XFADE_SEC);

  // Generate a little extra, then cross-fade that tail over the start. The loop
  // point is then a genuine continuation instead of a seam that ticks or dips.
  const raw = generateNoise(kind, len + xfade);
  const d = new Float32Array(len);
  d.set(raw.subarray(0, len));
  for (let i = 0; i < xfade; i++) {
    const t = (i / xfade) * (Math.PI / 2);
    // Equal-power curves: two uncorrelated noises keep a steady loudness across the fade.
    d[i] = d[i] * Math.sin(t) + raw[len + i] * Math.cos(t);
  }

  // Normalise. The random walk's peak cannot be predicted, and overshooting it
  // was clipping the waveform, which is what made the sound harsh.
  let peak = 0;
  for (let i = 0; i < len; i++) peak = Math.max(peak, Math.abs(d[i]));
  if (peak > 0) {
    const g = PEAK / peak;
    for (let i = 0; i < len; i++) d[i] *= g;
  }

  const buf = c.createBuffer(1, len, c.sampleRate);
  buf.copyToChannel(d, 0);
  noiseCache.set(kind, buf);
  return buf;
}

// ---------------------------------------------------------------- voices

interface Voice {
  out: AudioNode;
  stop(at: number): void;
}

/** Collects every node that has to be stopped, and starts sources as they are made. */
class Parts {
  private stops: ((at: number) => void)[] = [];

  constructor(private c: AudioContext) {}

  noise(kind: NoiseKind): AudioBufferSourceNode {
    const src = this.c.createBufferSource();
    src.buffer = noiseBuffer(this.c, kind);
    src.loop = true;
    src.start();
    this.stops.push((at) => src.stop(at));
    return src;
  }

  /** A slow sine that nudges `target` up and down: the swell of water, waves, flames. */
  wobble(target: AudioParam, periodSec: number, depth: number) {
    const lfo = this.c.createOscillator();
    lfo.frequency.value = 1 / periodSec;
    const amp = this.c.createGain();
    amp.gain.value = depth;
    lfo.connect(amp).connect(target);
    lfo.start();
    this.stops.push((at) => lfo.stop(at));
  }

  gain(value: number): GainNode {
    const g = this.c.createGain();
    g.gain.value = value;
    return g;
  }

  filter(type: BiquadFilterType, frequency: number, q?: number): BiquadFilterNode {
    const f = this.c.createBiquadFilter();
    f.type = type;
    f.frequency.value = frequency;
    if (q !== undefined) f.Q.value = q;
    return f;
  }

  onStop(fn: (at: number) => void) {
    this.stops.push(fn);
  }

  stopAll(at: number) {
    this.stops.forEach((s) => s(at));
    this.stops = [];
  }
}

function buildAmbient(c: AudioContext, id: AmbientId): Voice {
  const p = new Parts(c);
  const out = c.createGain();

  switch (id) {
    case 'river': {
      // Rushing water is broadband, so the main layer is pink noise through a
      // wide band; brown noise underneath gives it body.
      const rush = p.gain(0.5);
      p.noise('pink').connect(p.filter('highpass', 200)).connect(p.filter('lowpass', 3500)).connect(rush).connect(out);
      p.wobble(rush.gain, 9, 0.08); // the water moving, not a filter sweeping

      p.noise('brown').connect(p.filter('highpass', 60)).connect(p.filter('lowpass', 400)).connect(p.gain(0.35)).connect(out);
      break;
    }
    case 'rain': {
      const drops = p.gain(0.45);
      p.noise('pink').connect(p.filter('highpass', 500)).connect(p.filter('lowpass', 8000)).connect(drops).connect(out);
      p.wobble(drops.gain, 6, 0.05);
      // Distant rumble underneath.
      p.noise('brown').connect(p.filter('lowpass', 250)).connect(p.gain(0.25)).connect(out);
      break;
    }
    case 'waves': {
      const body = p.gain(0.8);
      p.noise('brown').connect(p.filter('highpass', 50)).connect(p.filter('lowpass', 800)).connect(body).connect(out);
      p.wobble(body.gain, 12, 0.45); // the long swell of a breaking wave

      // Spray on top, rising and falling with the same slow period.
      const spray = p.gain(0.07);
      p.noise('pink').connect(p.filter('highpass', 1500)).connect(spray).connect(out);
      p.wobble(spray.gain, 12, 0.06);
      break;
    }
    case 'fire': {
      const g = p.gain(0.5);
      p.noise('brown').connect(p.filter('highpass', 50)).connect(p.filter('lowpass', 320)).connect(g).connect(out);
      p.wobble(g.gain, 3.5, 0.18);

      // Crackles: very short bursts of filtered noise at random moments.
      const pop = () => {
        const t = c.currentTime;
        const n = c.createBufferSource();
        n.buffer = noiseBuffer(c, 'white');
        const bp = c.createBiquadFilter();
        bp.type = 'bandpass';
        bp.frequency.value = 1200 + Math.random() * 2500;
        bp.Q.value = 1.5;
        const env = c.createGain();
        env.gain.setValueAtTime(0.0001, t);
        env.gain.exponentialRampToValueAtTime(0.06 + Math.random() * 0.1, t + 0.004);
        env.gain.exponentialRampToValueAtTime(0.0001, t + 0.05 + Math.random() * 0.06);
        n.connect(bp).connect(env).connect(out);
        n.start(t, Math.random() * 4);
        n.stop(t + 0.25);
      };
      const timers = new Set<number>();
      const tick = window.setInterval(() => {
        for (let i = 0, n = 1 + Math.floor(Math.random() * 3); i < n; i++) {
          const id = window.setTimeout(() => {
            timers.delete(id);
            pop();
          }, Math.random() * 400);
          timers.add(id);
        }
      }, 450);
      p.onStop(() => {
        window.clearInterval(tick);
        timers.forEach((t) => window.clearTimeout(t));
        timers.clear();
      });
      break;
    }
    default: {
      // Plain noise, with the subsonic end removed so it does not eat headroom.
      const kind = id as NoiseKind;
      p.noise(kind).connect(p.filter('highpass', 40)).connect(p.filter('lowpass', 9000)).connect(p.gain(0.45)).connect(out);
    }
  }

  return { out, stop: (at) => p.stopAll(at) };
}

async function buildFile(c: AudioContext, id: string): Promise<Voice | null> {
  let buf = fileCache.get(id);
  if (!buf) {
    const rec = await getSoundFile(id);
    if (!rec) return null;
    buf = await c.decodeAudioData(await rec.blob.arrayBuffer());
    fileCache.set(id, buf);
  }
  const src = c.createBufferSource();
  src.buffer = buf;
  src.loop = true;
  src.start();
  return { out: src, stop: (at) => src.stop(at) };
}

// ---------------------------------------------------------------- control

const ramp = (g: GainNode, to: number, seconds: number) => {
  const t = g.context.currentTime;
  g.gain.cancelScheduledValues(t);
  g.gain.setValueAtTime(Math.max(0.0001, g.gain.value), t);
  // Linear is enough here and, unlike the exponential ramp, it can reach zero.
  g.gain.linearRampToValueAtTime(Math.max(0.0001, to), t + seconds);
};

/** Play one sound, fading out whatever was playing. 'none' just stops. */
export async function playSound(choice: SoundChoice, volume: number): Promise<void> {
  const c = unlockAudio();

  if (current && current.choice === choice) {
    ramp(current.gain, volume, 0.3);
    return;
  }

  stopSound();
  if (!choice || choice === 'none') return;

  const fileId = choiceFileId(choice);
  const voice = fileId ? await buildFile(c, fileId) : buildAmbient(c, choice as AmbientId);
  if (!voice) return;

  const gain = c.createGain();
  gain.gain.value = 0.0001;
  voice.out.connect(gain).connect(master!);
  ramp(gain, volume, FADE);
  current = { choice, gain, stop: voice.stop };
}

export function stopSound() {
  if (!ctx || !current) return;
  const { gain, stop } = current;
  current = null;
  const at = ctx.currentTime + FADE + 0.1;
  ramp(gain, 0, FADE);
  stop(at);
  // Take the finished graph back out once it is silent.
  window.setTimeout(() => gain.disconnect(), (FADE + 0.3) * 1000);
}

export function setSoundVolume(volume: number) {
  if (!current) return;
  ramp(current.gain, volume, 0.2);
}

export const soundPlaying = () => current?.choice ?? null;

/** Two short tones: rising into focus, falling into a break. */
export function chime(kind: 'focus' | 'break') {
  const c = unlockAudio();
  const notes = kind === 'focus' ? [660, 880] : [880, 587];
  notes.forEach((f, i) => {
    const t = c.currentTime + i * 0.22;
    const osc = c.createOscillator();
    osc.type = 'sine';
    osc.frequency.value = f;
    const g = c.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.25, t + 0.02);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.35);
    osc.connect(g).connect(c.destination);
    osc.start(t);
    osc.stop(t + 0.4);
  });
}

/** Drop a cached file buffer, so a replaced or deleted file is not reused. */
export const forgetFile = (id: string) => fileCache.delete(id);
