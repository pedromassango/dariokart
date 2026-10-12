// Procedural sound effects. Each recipe schedules nodes into `out` starting at
// time `t` and returns the total duration in seconds (used for cleanup).

import { midiToFreq, noteToMidi } from './notes';
import { WaveName, cleanupOnEnd, getNoise, makeOsc } from './synth';

export type SfxName =
  | 'menuMove' | 'menuSelect' | 'menuBack'
  | 'countdownBeep' | 'countdownGo'
  | 'itemBox' | 'itemRoulette' | 'itemGet'
  | 'coin' | 'boost' | 'miniTurbo' | 'hop' | 'driftStart' | 'bump'
  | 'spinOut' | 'shellFire' | 'shellHit' | 'bananaDrop' | 'bananaHit' | 'lightning' | 'feather'
  | 'lapComplete' | 'finalLap' | 'finishWin' | 'finishLose'
  | 'wrongWay' | 'fall' | 'lakituDrop' | 'playerJoin';

export const SFX_NAMES: SfxName[] = [
  'menuMove', 'menuSelect', 'menuBack', 'countdownBeep', 'countdownGo', 'itemBox', 'itemRoulette', 'itemGet',
  'coin', 'boost', 'miniTurbo', 'hop', 'driftStart', 'bump', 'spinOut', 'shellFire', 'shellHit', 'bananaDrop',
  'bananaHit', 'lightning', 'feather', 'lapComplete', 'finalLap', 'finishWin', 'finishLose', 'wrongWay', 'fall',
  'lakituDrop', 'playerJoin',
];

/** Minimum seconds between two triggers of the same effect (anti-stacking). */
export const SFX_MIN_INTERVAL: Partial<Record<SfxName, number>> = {
  itemRoulette: 0.035,
  bump: 0.09,
  coin: 0.04,
  menuMove: 0.03,
  driftStart: 0.1,
  wrongWay: 0.5,
  hop: 0.06,
};

interface ToneOpts {
  wave?: WaveName;
  f0: number;
  f1?: number;
  /** 'exp' (default) or 'lin' frequency glide */
  glide?: 'exp' | 'lin';
  at?: number;
  dur: number;
  vol?: number;
  attack?: number;
  /** 'exp' decay to silence, or 'hold' sustain then short release */
  env?: 'exp' | 'hold';
  vibRate?: number;
  vibDepth?: number; // cents
}

interface NoiseOpts {
  at?: number;
  dur: number;
  vol?: number;
  type?: BiquadFilterType;
  f0: number;
  f1?: number;
  q?: number;
  env?: 'exp' | 'hold' | 'swell';
}

class Builder {
  end = 0;
  constructor(
    readonly ctx: AudioContext,
    readonly out: AudioNode,
    readonly t: number,
    readonly p: number,
  ) {}

  tone(o: ToneOpts): void {
    const { ctx, p } = this;
    const t = this.t + (o.at ?? 0);
    const vol = o.vol ?? 0.3;
    const osc = makeOsc(ctx, o.wave ?? 'square');
    osc.frequency.setValueAtTime(o.f0 * p, t);
    if (o.f1 !== undefined) {
      if (o.glide === 'lin') osc.frequency.linearRampToValueAtTime(o.f1 * p, t + o.dur);
      else osc.frequency.exponentialRampToValueAtTime(Math.max(1, o.f1 * p), t + o.dur);
    }
    const g = ctx.createGain();
    const a = o.attack ?? 0.004;
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(vol, t + a);
    if (o.env === 'hold') {
      g.gain.setValueAtTime(vol, t + Math.max(a, o.dur - 0.03));
      g.gain.linearRampToValueAtTime(0, t + o.dur);
    } else {
      g.gain.exponentialRampToValueAtTime(0.0008, t + o.dur);
    }
    osc.connect(g).connect(this.out);
    const extra: AudioNode[] = [g];
    if (o.vibRate && o.vibDepth) {
      const lfo = ctx.createOscillator();
      lfo.frequency.value = o.vibRate;
      const lg = ctx.createGain();
      lg.gain.value = o.vibDepth;
      lfo.connect(lg).connect(osc.detune);
      lfo.start(t);
      lfo.stop(t + o.dur + 0.02);
      cleanupOnEnd(lfo, lg);
    }
    osc.start(t);
    osc.stop(t + o.dur + 0.02);
    cleanupOnEnd(osc, ...extra);
    this.end = Math.max(this.end, (o.at ?? 0) + o.dur);
  }

  noise(o: NoiseOpts): void {
    const { ctx, p } = this;
    const t = this.t + (o.at ?? 0);
    const vol = o.vol ?? 0.3;
    const src = ctx.createBufferSource();
    src.buffer = getNoise(ctx);
    src.loop = true;
    const f = ctx.createBiquadFilter();
    f.type = o.type ?? 'bandpass';
    f.frequency.setValueAtTime(o.f0 * p, t);
    if (o.f1 !== undefined) f.frequency.exponentialRampToValueAtTime(Math.max(20, o.f1 * p), t + o.dur);
    f.Q.value = o.q ?? 1;
    const g = ctx.createGain();
    if (o.env === 'swell') {
      g.gain.setValueAtTime(0.0008, t);
      g.gain.exponentialRampToValueAtTime(vol, t + o.dur * 0.6);
      g.gain.exponentialRampToValueAtTime(0.0008, t + o.dur);
    } else if (o.env === 'hold') {
      g.gain.setValueAtTime(0, t);
      g.gain.linearRampToValueAtTime(vol, t + 0.01);
      g.gain.setValueAtTime(vol, t + Math.max(0.01, o.dur - 0.04));
      g.gain.linearRampToValueAtTime(0, t + o.dur);
    } else {
      g.gain.setValueAtTime(vol, t);
      g.gain.exponentialRampToValueAtTime(0.0008, t + o.dur);
    }
    src.connect(f).connect(g).connect(this.out);
    src.start(t, Math.random() * 0.5);
    src.stop(t + o.dur + 0.02);
    cleanupOnEnd(src, f, g);
    this.end = Math.max(this.end, (o.at ?? 0) + o.dur);
  }

  /** A short melodic phrase: tokens `note:beats` at `bpm`; returns phrase length. */
  phrase(notes: string, bpm: number, wave: WaveName, vol: number, at = 0, staccato = 0.9): number {
    const beat = 60 / bpm;
    let pos = 0;
    for (const tok of notes.split(/\s+/)) {
      if (!tok) continue;
      const [n, l] = tok.split(':');
      const len = (l ? parseFloat(l) : 1) * beat;
      if (n !== 'r') {
        const f = midiToFreq(noteToMidi(n));
        this.tone({ wave, f0: f, at: at + pos, dur: Math.max(0.03, len * staccato), vol, env: 'hold', attack: 0.006 });
      }
      pos += len;
    }
    return pos;
  }
}

type Recipe = (b: Builder) => void;

const R: Record<SfxName, Recipe> = {
  menuMove: (b) => b.tone({ wave: 'pulse25', f0: 1320, dur: 0.045, vol: 0.18, env: 'hold' }),
  menuSelect: (b) => {
    b.tone({ wave: 'pulse25', f0: 784, dur: 0.06, vol: 0.2, env: 'hold' });
    b.tone({ wave: 'pulse25', f0: 1175, at: 0.06, dur: 0.06, vol: 0.2, env: 'hold' });
    b.tone({ wave: 'pulse12', f0: 1568, at: 0.12, dur: 0.18, vol: 0.18 });
  },
  menuBack: (b) => {
    b.tone({ wave: 'pulse25', f0: 988, dur: 0.06, vol: 0.2, env: 'hold' });
    b.tone({ wave: 'pulse25', f0: 659, at: 0.06, dur: 0.12, vol: 0.2 });
  },
  countdownBeep: (b) => b.tone({ wave: 'square', f0: 523, dur: 0.32, vol: 0.22, env: 'hold' }),
  countdownGo: (b) => {
    b.tone({ wave: 'square', f0: 1047, dur: 0.7, vol: 0.22, env: 'hold', vibRate: 7, vibDepth: 15 });
    b.tone({ wave: 'pulse25', f0: 523, dur: 0.7, vol: 0.12, env: 'hold' });
  },
  itemBox: (b) => {
    const notes = [72, 76, 79, 84, 88, 91];
    notes.forEach((m, i) => b.tone({ wave: 'pulse12', f0: midiToFreq(m), at: i * 0.035, dur: 0.12, vol: 0.16 }));
    b.noise({ type: 'highpass', f0: 6000, dur: 0.3, vol: 0.12 });
  },
  itemRoulette: (b) => b.tone({ wave: 'pulse12', f0: 1400 + Math.random() * 300, dur: 0.028, vol: 0.12, env: 'hold' }),
  itemGet: (b) => {
    b.tone({ wave: 'square', f0: 988, dur: 0.07, vol: 0.18, env: 'hold' });
    b.tone({ wave: 'square', f0: 1319, at: 0.07, dur: 0.07, vol: 0.18, env: 'hold' });
    b.tone({ wave: 'pulse25', f0: 1976, at: 0.14, dur: 0.35, vol: 0.16 });
  },
  coin: (b) => {
    b.tone({ wave: 'pulse25', f0: 1047, dur: 0.05, vol: 0.18, env: 'hold' });
    b.tone({ wave: 'pulse25', f0: 1568, at: 0.05, dur: 0.3, vol: 0.18 });
  },
  boost: (b) => {
    b.tone({ wave: 'sawtooth', f0: 180, f1: 900, dur: 0.45, vol: 0.16 });
    b.tone({ wave: 'pulse25', f0: 360, f1: 1400, dur: 0.3, vol: 0.08 });
    b.noise({ type: 'bandpass', f0: 500, f1: 4000, dur: 0.6, vol: 0.35, q: 1.2, env: 'swell' });
  },
  miniTurbo: (b) => {
    b.tone({ wave: 'sawtooth', f0: 300, f1: 1000, dur: 0.22, vol: 0.13 });
    b.noise({ type: 'bandpass', f0: 1200, f1: 5000, dur: 0.3, vol: 0.25, q: 1.5 });
  },
  hop: (b) => b.tone({ wave: 'square', f0: 330, f1: 700, dur: 0.09, vol: 0.14 }),
  driftStart: (b) => {
    b.noise({ type: 'bandpass', f0: 3200, f1: 2400, dur: 0.18, vol: 0.3, q: 3 });
    b.tone({ wave: 'pulse12', f0: 1100, f1: 950, dur: 0.15, vol: 0.05 });
  },
  bump: (b) => {
    b.tone({ wave: 'triangle', f0: 140, f1: 45, dur: 0.18, vol: 0.5 });
    b.noise({ type: 'lowpass', f0: 1200, f1: 200, dur: 0.12, vol: 0.4 });
  },
  spinOut: (b) => {
    // Descending warbling whirl.
    for (let i = 0; i < 14; i++) {
      const f = 1100 * Math.pow(0.88, i);
      b.tone({ wave: i % 2 ? 'pulse25' : 'square', f0: f * 1.2, f1: f * 0.8, at: i * 0.055, dur: 0.05, vol: 0.13 });
    }
    b.noise({ type: 'bandpass', f0: 2500, f1: 800, dur: 0.75, vol: 0.18, q: 2 });
  },
  shellFire: (b) => {
    b.tone({ wave: 'pulse25', f0: 1400, f1: 300, dur: 0.15, vol: 0.18 });
    b.noise({ type: 'highpass', f0: 2000, f1: 600, dur: 0.2, vol: 0.25 });
  },
  shellHit: (b) => {
    b.noise({ type: 'lowpass', f0: 4000, f1: 150, dur: 0.6, vol: 0.6 });
    b.tone({ wave: 'square', f0: 180, f1: 35, dur: 0.4, vol: 0.25 });
    b.tone({ wave: 'pulse12', f0: 1600, f1: 400, at: 0.02, dur: 0.15, vol: 0.1 });
  },
  bananaDrop: (b) => {
    b.tone({ wave: 'triangle', f0: 600, f1: 220, dur: 0.12, vol: 0.35 });
    b.noise({ type: 'lowpass', f0: 800, dur: 0.06, vol: 0.2, at: 0.1 });
  },
  bananaHit: (b) => {
    b.tone({ wave: 'square', f0: 400, f1: 1300, dur: 0.12, vol: 0.14 });
    b.tone({ wave: 'square', f0: 1300, f1: 250, at: 0.12, dur: 0.35, vol: 0.14, vibRate: 20, vibDepth: 60 });
    b.noise({ type: 'bandpass', f0: 3000, dur: 0.4, vol: 0.18, q: 2 });
  },
  lightning: (b) => {
    b.noise({ type: 'highpass', f0: 1500, dur: 0.25, vol: 0.5 });
    b.noise({ type: 'lowpass', f0: 3000, f1: 80, dur: 1.4, vol: 0.55 });
    b.tone({ wave: 'sawtooth', f0: 2400, f1: 60, dur: 1.0, vol: 0.18 });
    b.tone({ wave: 'square', f0: 90, f1: 30, at: 0.05, dur: 1.2, vol: 0.2 });
  },
  feather: (b) => {
    b.tone({ wave: 'triangle', f0: 400, f1: 1800, dur: 0.3, vol: 0.3 });
    b.tone({ wave: 'pulse12', f0: 800, f1: 2400, at: 0.05, dur: 0.25, vol: 0.06 });
    b.noise({ type: 'bandpass', f0: 1500, f1: 5000, dur: 0.35, vol: 0.12, q: 1, env: 'swell' });
  },
  lapComplete: (b) => {
    b.phrase('G5:0.5 C6:0.5 E6:0.5 G6:1.5', 300, 'pulse25', 0.18);
    b.phrase('E5:0.5 G5:0.5 C6:0.5 E6:1.5', 300, 'pulse12', 0.09);
  },
  finalLap: (b) => {
    // Short, urgent original jingle.
    const bpm = 200;
    b.phrase('C6:0.5 C6:0.5 r:0.5 C6:0.5 E6:1 G6:1 F6:0.5 E6:0.5 F6:0.5 A6:0.5 G6:3', bpm, 'pulse25', 0.17);
    b.phrase('E5:0.5 E5:0.5 r:0.5 E5:0.5 G5:1 C6:1 A5:0.5 A5:0.5 C6:0.5 C6:0.5 B5:3', bpm, 'pulse12', 0.09);
    b.phrase('C3:1 r:0.5 C3:0.5 C3:1 E3:1 F3:2 G3:3', bpm, 'bass', 0.32);
  },
  finishWin: (b) => {
    const bpm = 168;
    b.phrase(
      'G5:0.5 G5:0.5 G5:0.5 C6:1.5 E6:1 D6:0.5 C6:0.5 D6:1 G5:1 ' +
        'A5:0.5 B5:0.5 C6:0.5 D6:0.5 E6:1 F6:0.5 E6:0.5 D6:1 G6:4',
      bpm, 'pulse25', 0.17,
    );
    b.phrase(
      'E5:0.5 E5:0.5 E5:0.5 G5:1.5 C6:1 B5:0.5 A5:0.5 B5:1 D5:1 ' +
        'F5:0.5 G5:0.5 A5:0.5 B5:0.5 C6:1 D6:0.5 C6:0.5 B5:1 E6:4',
      bpm, 'pulse12', 0.09,
    );
    b.phrase('C3:1.5 C3:1.5 F3:1 G3:1 E3:1 A2:1 D3:1 G2:1 F3:1 D3:1 G2:1 C3:4', bpm, 'bass', 0.3);
    const beat = 60 / bpm;
    b.noise({ type: 'highpass', f0: 4000, dur: 1.2, vol: 0.2, at: 12 * beat });
  },
  finishLose: (b) => {
    const bpm = 110;
    b.phrase('E5:1 D#5:1 D5:1 C#5:1 C5:1 B4:0.5 Bb4:0.5 A4:3', bpm, 'pulse25', 0.16);
    b.phrase('A3:2 G#3:2 G3:2 F3:0.5 E3:0.5 A2:2', bpm, 'bass', 0.3);
  },
  wrongWay: (b) => {
    b.tone({ wave: 'square', f0: 880, dur: 0.18, vol: 0.16, env: 'hold' });
    b.tone({ wave: 'square', f0: 660, at: 0.2, dur: 0.18, vol: 0.16, env: 'hold' });
    b.tone({ wave: 'square', f0: 880, at: 0.4, dur: 0.18, vol: 0.16, env: 'hold' });
    b.tone({ wave: 'square', f0: 660, at: 0.6, dur: 0.18, vol: 0.16, env: 'hold' });
  },
  fall: (b) => {
    b.tone({ wave: 'triangle', f0: 1400, f1: 140, dur: 1.1, vol: 0.32, vibRate: 9, vibDepth: 40, env: 'hold' });
    b.tone({ wave: 'pulse12', f0: 1400, f1: 140, dur: 1.1, vol: 0.05, env: 'hold' });
    b.noise({ type: 'bandpass', f0: 600, f1: 150, dur: 0.4, vol: 0.25, at: 1.0, q: 0.8 });
  },
  lakituDrop: (b) => {
    const notes = [67, 72, 76, 79, 84];
    notes.forEach((m, i) => b.tone({ wave: 'pulse25', f0: midiToFreq(m), at: i * 0.06, dur: 0.15, vol: 0.14 }));
    b.tone({ wave: 'triangle', f0: 200, f1: 80, at: 0.32, dur: 0.15, vol: 0.4 });
    b.noise({ type: 'highpass', f0: 5000, dur: 0.4, vol: 0.12 });
  },
  playerJoin: (b) => {
    const notes = [72, 79, 84, 88];
    notes.forEach((m, i) => b.tone({ wave: 'pulse12', f0: midiToFreq(m), at: i * 0.07, dur: 0.25, vol: 0.15 }));
    b.tone({ wave: 'sine', f0: 2093, at: 0.28, dur: 0.5, vol: 0.12, vibRate: 6, vibDepth: 20 });
  },
};

/** Build an effect at time `t` into `out`. Returns its duration in seconds. */
export function buildSfx(name: SfxName, ctx: AudioContext, out: AudioNode, t: number, pitch: number): number {
  const recipe = R[name];
  if (!recipe) return 0;
  const b = new Builder(ctx, out, t, pitch);
  recipe(b);
  return b.end;
}
