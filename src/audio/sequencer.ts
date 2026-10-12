// Song compiler + lookahead scheduler.

import { Chord, midiToFreq, noteToMidi, parseChord, rootInRange } from './notes';
import { DrumKind, INSTRUMENTS, Instrument, playDrum, playNote } from './synth';
import type { SongDef } from './songs';

export type ChannelName = 'lead' | 'harmony' | 'arp' | 'bass' | 'drums';
const CHANNELS: ChannelName[] = ['lead', 'harmony', 'arp', 'bass', 'drums'];

interface NoteEvent {
  ch: Exclude<ChannelName, 'drums'>;
  midi: number;
  steps: number;
  vel: number;
}
interface DrumEvent {
  ch: 'drums';
  kind: DrumKind;
  vel: number;
}
type Event = NoteEvent | DrumEvent;

export interface CompiledSong {
  def: SongDef;
  totalSteps: number;
  events: Event[][];
}

const DEFAULT_MIX: Record<ChannelName, number> = { lead: 0.2, harmony: 0.09, arp: 0.1, bass: 0.32, drums: 0.36 };
const PAN: Record<ChannelName, number> = { lead: 0.08, harmony: -0.3, arp: 0.35, bass: 0, drums: -0.08 };

function chordTones(ch: Chord, low: number): number[] {
  const root = rootInRange(ch, low);
  return ch.intervals.map((i) => root + i);
}

function toneAt(tones: number[], idx: number): number {
  const n = tones.length;
  return tones[idx % n] + 12 * Math.floor(idx / n);
}

const compiled = new Map<SongDef, CompiledSong>();

export function compileSong(def: SongDef): CompiledSong {
  const cached = compiled.get(def);
  if (cached) return cached;
  const spb = def.stepsPerBar;
  const chordBars = def.chords.split('|').map((b) => b.trim()).filter(Boolean);
  const bars = chordBars.length;
  const totalSteps = bars * spb;
  const events: Event[][] = Array.from({ length: totalSteps }, () => []);

  // Chord per step.
  const chordAt: Chord[] = new Array(totalSteps);
  chordBars.forEach((bar, bi) => {
    const syms = bar.split(/\s+/);
    const seg = spb / syms.length;
    for (let s = 0; s < spb; s++) {
      chordAt[bi * spb + s] = parseChord(syms[Math.min(syms.length - 1, Math.floor(s / seg))]);
    }
  });

  // Melody (+ auto harmony).
  const defLen = def.defLen ?? 2;
  let pos = 0;
  for (const tok of def.melody.split(/[\s|]+/)) {
    if (!tok) continue;
    const [name, lenStr] = tok.split(':');
    const len = lenStr ? parseInt(lenStr, 10) : defLen;
    if (pos >= totalSteps) break;
    if (name !== 'r') {
      const midi = noteToMidi(name);
      if (!Number.isNaN(midi)) {
        events[pos].push({ ch: 'lead', midi, steps: len, vel: 1 });
        if (def.harmony) {
          const tones = chordTones(chordAt[pos], midi - 12);
          let best = -1;
          for (let i = 0; i < 8; i++) {
            const t = toneAt(tones, i);
            if (t <= midi - 3 && t > best) best = t;
          }
          if (best > 0) events[pos].push({ ch: 'harmony', midi: best, steps: len, vel: 1 });
        }
      }
    }
    pos += len;
  }

  // Bass + arp + drums per bar.
  for (let bar = 0; bar < bars; bar++) {
    const bpat = def.bassPattern[bar % def.bassPattern.length];
    const apat = def.arpPattern ? def.arpPattern[bar % def.arpPattern.length] : '';
    const isFill = def.fill && bar % 8 === 7;
    const dpat = def.drums ? (isFill ? def.fill! : def.drums[bar % def.drums.length]) : '';
    for (let s = 0; s < spb; s++) {
      const step = bar * spb + s;
      const chord = chordAt[step];

      const hold = (pat: string) => {
        let n = 1;
        while (s + n < spb && pat[s + n] === '-') n++;
        return n;
      };

      const bc = bpat[s];
      if (bc && bc !== '.' && bc !== '-') {
        const root = rootInRange(chord, def.bassLow ?? 40);
        const iv = chord.intervals;
        let midi = root;
        if (bc === 'O') midi = root + 12;
        else if (bc === '5') midi = root + (iv[2] ?? 7);
        else if (bc === '3') midi = root + (iv[1] ?? 4);
        else if (bc === '7') midi = root + (iv[3] ?? 12);
        else if (bc === 'L') midi = root + (iv[2] ?? 7) - 12;
        events[step].push({ ch: 'bass', midi, steps: hold(bpat), vel: s % 4 === 0 ? 1 : 0.85 });
      }

      const ac = apat[s];
      if (ac && ac !== '.' && ac !== '-') {
        const tones = chordTones(chord, def.arpLow ?? 58);
        const len = hold(apat);
        if (ac === 'C') {
          for (const t of tones.slice(0, 3)) events[step].push({ ch: 'arp', midi: t, steps: len, vel: 0.7 });
        } else {
          const idx = parseInt(ac, 10);
          if (!Number.isNaN(idx)) events[step].push({ ch: 'arp', midi: toneAt(tones, idx), steps: len, vel: 1 });
        }
      }

      const dc = dpat[s];
      const vel = s === 0 ? 1 : 0.85;
      const push = (kind: DrumKind, v = vel) => events[step].push({ ch: 'drums', kind, vel: v });
      switch (dc) {
        case 'k': push('kick'); break;
        case 's': push('snare'); break;
        case 'h': push('hat', s % 4 === 0 ? 0.9 : 0.6); break;
        case 'o': push('openhat'); break;
        case 'c': push('kick'); push('crash'); break;
        case 't': push('tom'); break;
        case 'x': push('click'); break;
        case 'K': push('kick'); push('hat', 0.7); break;
        case 'S': push('snare'); push('hat', 0.7); break;
      }
    }
  }
  // Crash on the downbeat of the loop for drive.
  if (def.drums && totalSteps > 0) events[0].push({ ch: 'drums', kind: 'crash', vel: 0.6 });

  const c: CompiledSong = { def, totalSteps, events };
  compiled.set(def, c);
  return c;
}

const LOOKAHEAD = 0.12; // seconds scheduled ahead
const TICK_MS = 25;

/** One playing song instance with its own output gain (for crossfades). */
export class SongPlayer {
  readonly output: GainNode;
  private readonly ctx: AudioContext;
  private readonly song: CompiledSong;
  private readonly loop: boolean;
  private readonly getTempo: () => number;
  private readonly channels = {} as Record<ChannelName, GainNode>;
  private readonly nodes: AudioNode[] = [];
  private readonly insts = {} as Record<Exclude<ChannelName, 'drums'>, Instrument | undefined>;
  private vibratoGain?: GainNode;
  private vibratoOsc?: OscillatorNode;
  private step = 0;
  private nextTime = 0;
  private timer: ReturnType<typeof setInterval> | null = null;
  private stopped = false;
  onEnded?: () => void;

  constructor(ctx: AudioContext, dest: AudioNode, song: CompiledSong, loop: boolean, getTempo: () => number) {
    this.ctx = ctx;
    this.song = song;
    this.loop = loop;
    this.getTempo = getTempo;
    this.output = ctx.createGain();
    this.output.gain.value = 0;
    this.output.connect(dest);
    const def = song.def;
    for (const ch of CHANNELS) {
      const g = ctx.createGain();
      g.gain.value = def.mix?.[ch] ?? DEFAULT_MIX[ch];
      let last: AudioNode = g;
      if (typeof ctx.createStereoPanner === 'function') {
        const p = ctx.createStereoPanner();
        p.pan.value = PAN[ch];
        g.connect(p);
        last = p;
        this.nodes.push(p);
      }
      last.connect(this.output);
      this.channels[ch] = g;
      this.nodes.push(g);
    }
    this.insts.lead = INSTRUMENTS[def.lead];
    this.insts.harmony = def.harmony ? INSTRUMENTS[def.harmony] : undefined;
    this.insts.arp = def.arp ? INSTRUMENTS[def.arp] : undefined;
    this.insts.bass = INSTRUMENTS[def.bass];
    if (def.vibrato) {
      // One shared LFO per song for lead vibrato (cheap: no per-note LFOs).
      this.vibratoOsc = ctx.createOscillator();
      this.vibratoOsc.frequency.value = def.vibrato.rate;
      this.vibratoGain = ctx.createGain();
      this.vibratoGain.gain.value = def.vibrato.depth;
      this.vibratoOsc.connect(this.vibratoGain);
      this.vibratoOsc.start();
    }
  }

  stepDuration(): number {
    const def = this.song.def;
    const beatsPerBar = def.stepsPerBar === 12 ? 3 : 4;
    const stepsPerBeat = def.stepsPerBar / beatsPerBar;
    return 60 / (def.bpm * this.getTempo()) / stepsPerBeat;
  }

  start(fadeIn: number): void {
    const now = this.ctx.currentTime;
    this.output.gain.cancelScheduledValues(now);
    this.output.gain.setValueAtTime(fadeIn > 0 ? 0.0001 : 1, now);
    if (fadeIn > 0) this.output.gain.linearRampToValueAtTime(1, now + fadeIn);
    this.nextTime = now + 0.05;
    this.tick();
    this.timer = setInterval(() => this.tick(), TICK_MS);
  }

  stop(fadeOut: number): void {
    if (this.stopped) return;
    this.stopped = true;
    if (this.timer !== null) clearInterval(this.timer);
    this.timer = null;
    const now = this.ctx.currentTime;
    const g = this.output.gain;
    g.cancelScheduledValues(now);
    g.setValueAtTime(g.value, now);
    if (fadeOut > 0) g.linearRampToValueAtTime(0, now + fadeOut);
    else g.setValueAtTime(0, now);
    // Allow already-scheduled notes to finish (silently), then tear down.
    setTimeout(() => this.dispose(), (Math.max(fadeOut, 0) + LOOKAHEAD + 1.2) * 1000);
  }

  get isStopped(): boolean {
    return this.stopped;
  }

  private dispose(): void {
    try {
      this.vibratoOsc?.stop();
      this.vibratoOsc?.disconnect();
      this.vibratoGain?.disconnect();
      for (const n of this.nodes) n.disconnect();
      this.output.disconnect();
    } catch {
      /* ignore */
    }
  }

  private tick(): void {
    if (this.stopped) return;
    const ctx = this.ctx;
    const now = ctx.currentTime;
    // If the timer was throttled (background tab), skip ahead instead of bursting.
    if (this.nextTime < now - 0.25) this.nextTime = now + 0.02;
    const horizon = now + LOOKAHEAD;
    while (this.nextTime < horizon) {
      const total = this.song.totalSteps;
      if (this.step >= total) {
        if (!this.loop) {
          const cb = this.onEnded;
          this.stop(1.5);
          cb?.();
          return;
        }
        this.step = 0;
      }
      const dur = this.stepDuration();
      this.scheduleStep(this.step, this.nextTime, dur);
      this.nextTime += dur;
      this.step++;
    }
  }

  private scheduleStep(step: number, time: number, stepDur: number): void {
    const def = this.song.def;
    const swing = def.swing ?? 0;
    const t = step % 2 === 1 ? time + swing * stepDur : time;
    for (const ev of this.song.events[step]) {
      if (ev.ch === 'drums') {
        playDrum(this.ctx, this.channels.drums, ev.kind, t, ev.vel);
        continue;
      }
      const inst = this.insts[ev.ch];
      if (!inst) continue;
      const vib = ev.ch === 'lead' || ev.ch === 'harmony' ? this.vibratoGain : undefined;
      playNote(this.ctx, this.channels[ev.ch], inst, midiToFreq(ev.midi), t, ev.steps * stepDur, ev.vel, vib);
    }
  }
}
