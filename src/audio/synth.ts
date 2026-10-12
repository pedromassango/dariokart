// Low-level SNES-flavoured synthesis primitives: cached periodic waves, a shared
// noise buffer, enveloped tone voices and a small drum kit.

export type WaveName =
  | 'pulse12'
  | 'pulse25'
  | 'square'
  | 'triangle'
  | 'sawtooth'
  | 'sine'
  | 'organ'
  | 'steel'
  | 'bass'
  | 'flute';

interface CtxCache {
  waves: Map<WaveName, PeriodicWave>;
  noise?: AudioBuffer;
}

const caches = new WeakMap<BaseAudioContext, CtxCache>();

function cacheFor(ctx: BaseAudioContext): CtxCache {
  let c = caches.get(ctx);
  if (!c) {
    c = { waves: new Map() };
    caches.set(ctx, c);
  }
  return c;
}

const HARMONICS = 48;

function pulseCoeffs(duty: number): [Float32Array, Float32Array] {
  const real = new Float32Array(HARMONICS);
  const imag = new Float32Array(HARMONICS);
  for (let n = 1; n < HARMONICS; n++) {
    // Fourier series of a pulse wave with the given duty cycle.
    real[n] = (2 / (n * Math.PI)) * Math.sin(n * Math.PI * duty);
    imag[n] = 0;
  }
  // Rotate into sine phase so all waves start near zero (avoids clicks).
  for (let n = 1; n < HARMONICS; n++) {
    const a = real[n];
    real[n] = 0;
    imag[n] = a;
  }
  return [real, imag];
}

function harmonicCoeffs(amps: number[]): [Float32Array, Float32Array] {
  const real = new Float32Array(amps.length + 1);
  const imag = new Float32Array(amps.length + 1);
  amps.forEach((a, i) => {
    imag[i + 1] = a;
  });
  return [real, imag];
}

function triangleAmps(count: number, extra: Record<number, number> = {}): number[] {
  const out: number[] = [];
  for (let n = 1; n <= count; n++) {
    let a = n % 2 === 1 ? (8 / (Math.PI * Math.PI)) / (n * n) * (((n - 1) / 2) % 2 === 0 ? 1 : -1) : 0;
    if (extra[n] !== undefined) a += extra[n];
    out.push(a);
  }
  return out;
}

/** Returns a PeriodicWave for custom waves, or null for built-in oscillator types. */
export function getWave(ctx: BaseAudioContext, name: WaveName): PeriodicWave | null {
  if (name === 'triangle' || name === 'sawtooth' || name === 'sine') return null;
  const cache = cacheFor(ctx);
  let w = cache.waves.get(name);
  if (w) return w;
  let coeffs: [Float32Array, Float32Array];
  switch (name) {
    case 'pulse12':
      coeffs = pulseCoeffs(0.125);
      break;
    case 'pulse25':
      coeffs = pulseCoeffs(0.25);
      break;
    case 'square':
      coeffs = pulseCoeffs(0.5);
      break;
    case 'organ':
      // Drawbar-ish: fundamental, octave, 12th, 2nd octave, a little 3rd octave.
      coeffs = harmonicCoeffs([1, 0.75, 0.5, 0.45, 0, 0.3, 0, 0.25, 0, 0, 0, 0.12]);
      break;
    case 'steel':
      // Bright, hollow, bell-like spectrum for a steel-drum flavour.
      coeffs = harmonicCoeffs([1, 0.15, 0.55, 0.6, 0.08, 0.3, 0, 0.18, 0.1, 0, 0.08]);
      break;
    case 'bass':
      // Triangle with added low harmonics so it carries on small speakers.
      coeffs = harmonicCoeffs(triangleAmps(15, { 2: 0.28, 4: 0.08 }));
      break;
    case 'flute':
      coeffs = harmonicCoeffs([1, 0.2, 0.08, 0.03]);
      break;
    default:
      coeffs = pulseCoeffs(0.5);
  }
  w = ctx.createPeriodicWave(coeffs[0], coeffs[1], { disableNormalization: false });
  cache.waves.set(name, w);
  return w;
}

/** Shared 1-second white noise buffer (reused by every noise voice). */
export function getNoise(ctx: BaseAudioContext): AudioBuffer {
  const cache = cacheFor(ctx);
  if (cache.noise) return cache.noise;
  const len = Math.floor(ctx.sampleRate * 1);
  const buf = ctx.createBuffer(1, len, ctx.sampleRate);
  const d = buf.getChannelData(0);
  // Slightly "crunchy" noise: sample-and-hold every 2 samples like a low-rate chip.
  let v = 0;
  for (let i = 0; i < len; i++) {
    if (i % 2 === 0) v = Math.random() * 2 - 1;
    d[i] = v;
  }
  cache.noise = buf;
  return buf;
}

export function makeOsc(ctx: BaseAudioContext, wave: WaveName): OscillatorNode {
  const osc = ctx.createOscillator();
  const pw = getWave(ctx, wave);
  if (pw) osc.setPeriodicWave(pw);
  else osc.type = wave as OscillatorType;
  return osc;
}

/** Disconnect a source and its listed helper nodes once it has ended. */
export function cleanupOnEnd(src: AudioScheduledSourceNode, ...nodes: AudioNode[]): void {
  src.onended = () => {
    try {
      src.disconnect();
      for (const n of nodes) n.disconnect();
    } catch {
      /* ignore */
    }
  };
}

export interface Instrument {
  wave: WaveName;
  /** attack, decay (time-constant), sustain level (0..1), release (time-constant) in seconds */
  a: number;
  d: number;
  s: number;
  r: number;
  vol: number;
  /** second oscillator detune in cents (chorus) */
  detune?: number;
  /** wave for the second oscillator (defaults to wave) */
  wave2?: WaveName;
  /** octave shift for the second oscillator */
  oct2?: number;
  /** short pitch drop at note start in semitones (steel drum / pluck) */
  drop?: number;
  /** fraction of note length actually held (staccato < 1) */
  gate?: number;
  /** lowpass cutoff (Hz) */
  lp?: number;
}

export const INSTRUMENTS: Record<string, Instrument> = {
  lead12: { wave: 'pulse12', a: 0.005, d: 0.15, s: 0.6, r: 0.06, vol: 0.9, gate: 0.92 },
  lead25: { wave: 'pulse25', a: 0.008, d: 0.2, s: 0.7, r: 0.07, vol: 0.85, gate: 0.95 },
  brass: { wave: 'pulse25', a: 0.025, d: 0.25, s: 0.75, r: 0.08, vol: 0.85, detune: 8, gate: 0.96 },
  square: { wave: 'square', a: 0.005, d: 0.12, s: 0.55, r: 0.05, vol: 0.7, gate: 0.9 },
  flute: { wave: 'flute', a: 0.03, d: 0.3, s: 0.8, r: 0.1, vol: 1.2, detune: 5, wave2: 'triangle', gate: 0.95 },
  organ: { wave: 'organ', a: 0.01, d: 0.4, s: 0.85, r: 0.12, vol: 0.8, detune: 6, gate: 0.97 },
  steel: { wave: 'steel', a: 0.002, d: 0.18, s: 0.15, r: 0.2, vol: 1.1, drop: 0.35, gate: 0.6 },
  synth: { wave: 'sawtooth', a: 0.02, d: 0.3, s: 0.6, r: 0.15, vol: 0.55, detune: 10, lp: 2600, gate: 0.95 },
  arp12: { wave: 'pulse12', a: 0.002, d: 0.06, s: 0.25, r: 0.03, vol: 0.8, gate: 0.7 },
  arp25: { wave: 'pulse25', a: 0.002, d: 0.08, s: 0.3, r: 0.04, vol: 0.75, gate: 0.75 },
  stab: { wave: 'square', a: 0.003, d: 0.07, s: 0.2, r: 0.04, vol: 0.55, gate: 0.6 },
  pad: { wave: 'triangle', a: 0.12, d: 0.6, s: 0.8, r: 0.3, vol: 1.0, detune: 7, wave2: 'pulse12', gate: 1 },
  bell: { wave: 'sine', a: 0.002, d: 0.25, s: 0.1, r: 0.25, vol: 1.0, oct2: 2, wave2: 'sine', gate: 0.5 },
  bass: { wave: 'bass', a: 0.004, d: 0.12, s: 0.75, r: 0.04, vol: 1.0, gate: 0.85 },
  bassPluck: { wave: 'bass', a: 0.002, d: 0.08, s: 0.4, r: 0.04, vol: 1.1, gate: 0.7 },
};

/**
 * Schedule one enveloped note. `vibrato` (optional) is an AudioNode whose output
 * (in cents) is connected to the oscillators' detune params for the note's life.
 */
export function playNote(
  ctx: BaseAudioContext,
  dest: AudioNode,
  inst: Instrument,
  freq: number,
  t: number,
  dur: number,
  vel = 1,
  vibrato?: AudioNode,
): void {
  const held = Math.max(0.02, dur * (inst.gate ?? 0.9));
  const peak = inst.vol * vel;
  const g = ctx.createGain();
  // Piecewise-linear ADSR (explicit ramps are robust across implementations;
  // long setTargetAtTime chains proved unstable in some engines).
  const sus = peak * inst.s;
  const tA = t + inst.a;
  const tD = tA + inst.d;
  const rel = t + Math.max(held, inst.a);
  g.gain.setValueAtTime(0, t);
  g.gain.linearRampToValueAtTime(peak, tA);
  if (rel >= tD) {
    g.gain.linearRampToValueAtTime(sus, tD);
    g.gain.setValueAtTime(sus, rel);
  } else if (rel > tA) {
    g.gain.linearRampToValueAtTime(peak + (sus - peak) * ((rel - tA) / inst.d), rel);
  }
  g.gain.linearRampToValueAtTime(0, rel + inst.r);
  const stopAt = rel + inst.r + 0.03;

  let out: AudioNode = g;
  let filt: BiquadFilterNode | undefined;
  if (inst.lp) {
    filt = ctx.createBiquadFilter();
    filt.type = 'lowpass';
    filt.frequency.value = inst.lp;
    filt.Q.value = 0.7;
    g.connect(filt);
    out = filt;
  }
  out.connect(dest);

  const oscs: OscillatorNode[] = [];
  const o1 = makeOsc(ctx, inst.wave);
  o1.frequency.value = freq;
  oscs.push(o1);
  if (inst.detune !== undefined || inst.oct2 !== undefined) {
    const o2 = makeOsc(ctx, inst.wave2 ?? inst.wave);
    o2.frequency.value = freq * Math.pow(2, inst.oct2 ?? 0);
    o2.detune.value = inst.detune ?? 0;
    oscs.push(o2);
  }
  const voiceGain = oscs.length > 1 ? 0.6 : 1;
  for (const o of oscs) {
    if (inst.drop) {
      o.frequency.setValueAtTime(o.frequency.value * Math.pow(2, inst.drop / 12), t);
      o.frequency.exponentialRampToValueAtTime(o.frequency.value, t + 0.04);
    }
    let node: AudioNode = o;
    let vg: GainNode | undefined;
    if (voiceGain !== 1) {
      vg = ctx.createGain();
      vg.gain.value = voiceGain;
      o.connect(vg);
      node = vg;
    }
    node.connect(g);
    if (vibrato) vibrato.connect(o.detune);
    o.start(t);
    o.stop(stopAt);
    const extra: AudioNode[] = [];
    if (vg) extra.push(vg);
    o.onended = () => {
      try {
        if (vibrato) vibrato.disconnect(o.detune);
      } catch {
        /* ignore */
      }
      try {
        o.disconnect();
        for (const n of extra) n.disconnect();
      } catch {
        /* ignore */
      }
    };
  }
  // Disconnect the envelope chain once the first oscillator ends.
  const prev = o1.onended;
  o1.onended = (ev) => {
    if (prev) prev.call(o1, ev);
    try {
      g.disconnect();
      filt?.disconnect();
    } catch {
      /* ignore */
    }
  };
}

// ---------------------------------------------------------------- drums --

export type DrumKind = 'kick' | 'snare' | 'hat' | 'openhat' | 'crash' | 'tom' | 'click';

function noiseBurst(
  ctx: BaseAudioContext,
  dest: AudioNode,
  t: number,
  dur: number,
  vol: number,
  filterType: BiquadFilterType,
  freq: number,
  q = 0.8,
  freqEnd?: number,
): void {
  const src = ctx.createBufferSource();
  src.buffer = getNoise(ctx);
  src.loop = true;
  // Random start offset so repeated hits don't sound identical.
  const offset = Math.random() * 0.5;
  const f = ctx.createBiquadFilter();
  f.type = filterType;
  f.frequency.setValueAtTime(freq, t);
  if (freqEnd) f.frequency.exponentialRampToValueAtTime(freqEnd, t + dur);
  f.Q.value = q;
  const g = ctx.createGain();
  g.gain.setValueAtTime(vol, t);
  g.gain.exponentialRampToValueAtTime(0.0008, t + dur);
  src.connect(f).connect(g).connect(dest);
  src.start(t, offset);
  src.stop(t + dur + 0.02);
  cleanupOnEnd(src, f, g);
}

function sweepTone(
  ctx: BaseAudioContext,
  dest: AudioNode,
  t: number,
  dur: number,
  vol: number,
  wave: WaveName,
  f0: number,
  f1: number,
): void {
  const o = makeOsc(ctx, wave);
  o.frequency.setValueAtTime(f0, t);
  o.frequency.exponentialRampToValueAtTime(Math.max(1, f1), t + dur);
  const g = ctx.createGain();
  g.gain.setValueAtTime(vol, t);
  g.gain.exponentialRampToValueAtTime(0.0008, t + dur);
  o.connect(g).connect(dest);
  o.start(t);
  o.stop(t + dur + 0.02);
  cleanupOnEnd(o, g);
}

export function playDrum(ctx: BaseAudioContext, dest: AudioNode, kind: DrumKind, t: number, vel = 1): void {
  switch (kind) {
    case 'kick':
      sweepTone(ctx, dest, t, 0.16, 1.0 * vel, 'sine', 160, 42);
      sweepTone(ctx, dest, t, 0.03, 0.35 * vel, 'triangle', 600, 120);
      break;
    case 'snare':
      noiseBurst(ctx, dest, t, 0.14, 0.55 * vel, 'bandpass', 2200, 0.6);
      sweepTone(ctx, dest, t, 0.07, 0.4 * vel, 'triangle', 240, 150);
      break;
    case 'hat':
      noiseBurst(ctx, dest, t, 0.035, 0.22 * vel, 'highpass', 7500, 0.7);
      break;
    case 'openhat':
      noiseBurst(ctx, dest, t, 0.16, 0.2 * vel, 'highpass', 6500, 0.7);
      break;
    case 'crash':
      noiseBurst(ctx, dest, t, 0.9, 0.3 * vel, 'highpass', 4000, 0.5, 2500);
      break;
    case 'tom':
      sweepTone(ctx, dest, t, 0.18, 0.7 * vel, 'triangle', 220, 90);
      break;
    case 'click':
      noiseBurst(ctx, dest, t, 0.02, 0.25 * vel, 'bandpass', 3500, 2);
      break;
  }
}
