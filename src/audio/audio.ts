// Dariokart procedural audio engine (Web Audio API, no audio files).
//
// Graph:
//   music players -> musicBus -> musicVol ---------------------> master -> compressor -> destination
//                          \-> echo send -> delay <-> feedback(lowpass) -/
//   sfx voices -> per-call gain/pan -> sfxVol ---------------------------/
//   engine (oscs + noise layers) -> engineGain -> sfxVol

import { SONGS, type MusicName } from './songs';
import { SFX_MIN_INTERVAL, buildSfx, type SfxName } from './sfx';
import { SongPlayer, compileSong } from './sequencer';
import { getNoise, makeOsc } from './synth';

export type { SfxName } from './sfx';
export type { MusicName } from './songs';
export { SFX_NAMES } from './sfx';
export const MUSIC_NAMES: MusicName[] = ['title', 'menu', 'circuit', 'plains', 'ghost', 'beach', 'rainbow', 'star', 'results', 'castle'];

export interface SfxOptions {
  volume?: number;
  /** -1..1 */
  pan?: number;
  /** playback rate multiplier */
  pitch?: number;
}

export interface EngineState {
  running: boolean;
  speed01: number;
  onRoad: boolean;
  drifting: boolean;
  boosting: boolean;
}

interface Settings {
  master: number;
  music: number;
  sfx: number;
  muted: boolean;
}

const STORAGE_KEY = 'dariokart.audio.v1';
const DEFAULT_SETTINGS: Settings = { master: 0.8, music: 0.7, sfx: 0.9, muted: false };
/** Tracks that reset the tempo multiplier to 1 when started (non-race music). */
const TEMPO_RESET: MusicName[] = ['title', 'menu', 'results'];

const clamp01 = (v: number) => (Number.isFinite(v) ? Math.min(1, Math.max(0, v)) : 0);

function loadSettings(): Settings {
  try {
    const raw = typeof localStorage !== 'undefined' ? localStorage.getItem(STORAGE_KEY) : null;
    if (!raw) return { ...DEFAULT_SETTINGS };
    const p = JSON.parse(raw) as Partial<Settings>;
    return {
      master: typeof p.master === 'number' ? clamp01(p.master) : DEFAULT_SETTINGS.master,
      music: typeof p.music === 'number' ? clamp01(p.music) : DEFAULT_SETTINGS.music,
      sfx: typeof p.sfx === 'number' ? clamp01(p.sfx) : DEFAULT_SETTINGS.sfx,
      muted: typeof p.muted === 'boolean' ? p.muted : false,
    };
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

interface EngineNodes {
  oscA: OscillatorNode;
  oscB: OscillatorNode;
  sub: OscillatorNode;
  filter: BiquadFilterNode;
  tone: GainNode;
  tremolo: OscillatorNode;
  tremoloDepth: GainNode;
  rumbleSrc: AudioBufferSourceNode;
  rumbleFilter: BiquadFilterNode;
  rumbleGain: GainNode;
  skidSrc: AudioBufferSourceNode;
  skidFilter: BiquadFilterNode;
  skidGain: GainNode;
  squeal: OscillatorNode;
  squealGain: GainNode;
  out: GainNode;
  all: AudioNode[];
}

class AudioEngine {
  private ctx: AudioContext | null = null;
  private master!: GainNode;
  private musicBus!: GainNode;
  private musicVol!: GainNode;
  private sfxVol!: GainNode;
  private echoDelay!: DelayNode;
  private echoSend!: GainNode;
  private echoFeedback!: GainNode;

  private settings: Settings = loadSettings();
  private unlockPromise: Promise<void> | null = null;

  private current: SongPlayer | null = null;
  private currentName: MusicName | null = null;
  private pendingMusic: { name: MusicName; loop: boolean } | null = null;

  private tempoTarget = 1;
  private tempoCurrent = 1;
  private tempoLastT = 0;

  private lastSfx = new Map<SfxName, number>();

  private engine: EngineNodes | null = null;
  private engineState: EngineState = { running: false, speed01: 0, onRoad: true, drifting: false, boosting: false };
  private engineStopTimer: ReturnType<typeof setTimeout> | null = null;

  constructor() {
    if (typeof window !== 'undefined') {
      // Convenience: unlock on the first user gesture even if the game forgets to.
      const handler = () => {
        if (this.ctx && this.ctx.state === 'running') return;
        void this.unlock();
      };
      for (const ev of ['pointerdown', 'keydown', 'touchend', 'mousedown']) {
        window.addEventListener(ev, handler, { capture: true, passive: true });
      }
    }
  }

  // ------------------------------------------------------------- lifecycle --

  unlock(): Promise<void> {
    if (this.ctx && this.ctx.state === 'running') return Promise.resolve();
    if (this.unlockPromise) return this.unlockPromise;
    this.unlockPromise = this.doUnlock().finally(() => {
      this.unlockPromise = null;
    });
    return this.unlockPromise;
  }

  private async doUnlock(): Promise<void> {
    try {
      if (!this.ctx) {
        if (typeof window === 'undefined') return;
        const Ctor =
          window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
        if (!Ctor) return;
        this.ctx = new Ctor({ latencyHint: 'interactive' });
        this.buildGraph();
      }
      if (this.ctx.state !== 'running') await this.ctx.resume();
      if (this.ctx.state === 'running') {
        if (this.pendingMusic) {
          const p = this.pendingMusic;
          this.pendingMusic = null;
          this.startMusic(p.name, p.loop, 0.3);
        }
        this.applyEngine();
      }
    } catch {
      /* audio unavailable – stay silent */
    }
  }

  private buildGraph(): void {
    const ctx = this.ctx!;
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -10;
    comp.knee.value = 8;
    comp.ratio.value = 4;
    comp.attack.value = 0.005;
    comp.release.value = 0.15;
    comp.connect(ctx.destination);

    this.master = ctx.createGain();
    this.master.connect(comp);

    this.musicVol = ctx.createGain();
    this.musicVol.connect(this.master);
    this.musicBus = ctx.createGain();
    this.musicBus.gain.value = 1.6; // music trim relative to sfx
    this.musicBus.connect(this.musicVol);

    // SNES-style echo: delay with filtered feedback on the music bus.
    this.echoSend = ctx.createGain();
    this.echoSend.gain.value = 0.2;
    this.echoDelay = ctx.createDelay(1.5);
    this.echoDelay.delayTime.value = 0.2;
    this.echoFeedback = ctx.createGain();
    this.echoFeedback.gain.value = 0.3;
    const echoFilter = ctx.createBiquadFilter();
    echoFilter.type = 'lowpass';
    echoFilter.frequency.value = 2800;
    this.musicBus.connect(this.echoSend);
    this.echoSend.connect(this.echoDelay);
    this.echoDelay.connect(echoFilter);
    echoFilter.connect(this.echoFeedback);
    this.echoFeedback.connect(this.echoDelay);
    echoFilter.connect(this.musicVol);

    this.sfxVol = ctx.createGain();
    this.sfxVol.connect(this.master);

    this.applyVolumes(true);
  }

  private applyVolumes(immediate = false): void {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const set = (p: AudioParam, v: number) => {
      if (immediate) p.setValueAtTime(v, t);
      else p.setTargetAtTime(v, t, 0.03);
    };
    const s = this.settings;
    // Perceptual-ish curve.
    set(this.master.gain, s.muted ? 0 : s.master * s.master);
    set(this.musicVol.gain, s.music * s.music);
    set(this.sfxVol.gain, s.sfx * s.sfx);
  }

  private persist(): void {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(this.settings));
    } catch {
      /* ignore */
    }
  }

  private get ready(): boolean {
    return !!this.ctx && this.ctx.state === 'running';
  }

  // ------------------------------------------------------------------- sfx --

  playSfx(name: SfxName, opts: SfxOptions = {}): void {
    if (!this.ready || this.settings.muted) return;
    const ctx = this.ctx!;
    const now = ctx.currentTime;
    const minGap = SFX_MIN_INTERVAL[name] ?? 0.025;
    const last = this.lastSfx.get(name);
    if (last !== undefined && now - last < minGap) return;
    this.lastSfx.set(name, now);

    try {
      const g = ctx.createGain();
      g.gain.value = Math.max(0, opts.volume ?? 1);
      let tail: AudioNode = g;
      let panner: StereoPannerNode | undefined;
      if (opts.pan && typeof ctx.createStereoPanner === 'function') {
        panner = ctx.createStereoPanner();
        panner.pan.value = Math.max(-1, Math.min(1, opts.pan));
        g.connect(panner);
        tail = panner;
      }
      tail.connect(this.sfxVol);
      const pitch = opts.pitch && opts.pitch > 0 ? opts.pitch : 1;
      const dur = buildSfx(name, ctx, g, now + 0.005, pitch);
      setTimeout(() => {
        try {
          g.disconnect();
          panner?.disconnect();
        } catch {
          /* ignore */
        }
      }, (dur + 0.5) * 1000);
    } catch {
      /* never throw from gameplay code paths */
    }
  }

  // ----------------------------------------------------------------- music --

  playMusic(name: MusicName, opts: { loop?: boolean } = {}): void {
    const loop = opts.loop ?? true;
    if (!SONGS[name]) return;
    if (TEMPO_RESET.includes(name)) this.setMusicTempo(1, true);
    if (!this.ready) {
      this.pendingMusic = { name, loop };
      return;
    }
    if (this.currentName === name && this.current && !this.current.isStopped) return;
    this.startMusic(name, loop, this.current ? 0.6 : 0.05);
  }

  private startMusic(name: MusicName, loop: boolean, fade: number): void {
    const ctx = this.ctx!;
    try {
      if (this.current) this.current.stop(fade);
      const song = compileSong(SONGS[name]);
      const player = new SongPlayer(ctx, this.musicBus, song, loop, () => this.tempo());
      // Echo tuned to the song's tempo.
      const echo = song.def.echo ?? { mix: 0.2, feedback: 0.3, steps: 3 };
      const t = ctx.currentTime;
      this.echoDelay.delayTime.setTargetAtTime(Math.min(1.4, player.stepDuration() * echo.steps), t, 0.1);
      this.echoSend.gain.setTargetAtTime(echo.mix, t, 0.2);
      this.echoFeedback.gain.setTargetAtTime(Math.min(0.7, echo.feedback), t, 0.2);
      player.onEnded = () => {
        if (this.current === player) {
          this.current = null;
          this.currentName = null;
        }
      };
      player.start(fade);
      this.current = player;
      this.currentName = name;
    } catch {
      /* ignore */
    }
  }

  stopMusic(fadeSec = 0.5): void {
    this.pendingMusic = null;
    if (this.current) this.current.stop(Math.max(0, fadeSec));
    this.current = null;
    this.currentName = null;
  }

  /** Currently playing (or queued) music track, if any. */
  getMusic(): MusicName | null {
    return this.currentName ?? this.pendingMusic?.name ?? null;
  }

  setMusicTempo(mult: number, immediate = false): void {
    const m = Number.isFinite(mult) ? Math.min(2, Math.max(0.5, mult)) : 1;
    this.tempoTarget = m;
    if (immediate) this.tempoCurrent = m;
  }

  /** Smoothed tempo multiplier (eases toward target over ~1s). */
  private tempo(): number {
    const now = this.ctx ? this.ctx.currentTime : 0;
    const dt = Math.max(0, now - this.tempoLastT);
    this.tempoLastT = now;
    const k = 1 - Math.exp(-dt / 0.5);
    this.tempoCurrent += (this.tempoTarget - this.tempoCurrent) * k;
    return this.tempoCurrent;
  }

  // ---------------------------------------------------------------- engine --

  setEngine(state: EngineState): void {
    this.engineState = {
      running: !!state.running,
      speed01: clamp01(state.speed01),
      onRoad: state.onRoad !== false,
      drifting: !!state.drifting,
      boosting: !!state.boosting,
    };
    this.applyEngine();
  }

  private createEngine(): EngineNodes {
    const ctx = this.ctx!;
    const out = ctx.createGain();
    out.gain.value = 0;
    out.connect(this.sfxVol);

    // Motor tone: two detuned oscillators + a sub through a lowpass.
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 600;
    filter.Q.value = 4;
    const tone = ctx.createGain();
    tone.gain.value = 0.22;
    filter.connect(tone).connect(out);
    const oscA = makeOsc(ctx, 'sawtooth');
    const oscB = makeOsc(ctx, 'pulse25');
    oscB.detune.value = 14;
    const sub = makeOsc(ctx, 'square');
    const subGain = ctx.createGain();
    subGain.gain.value = 0.5;
    oscA.connect(filter);
    oscB.connect(filter);
    sub.connect(subGain).connect(filter);

    // Off-road tremolo: LFO modulating the tone gain.
    const tremolo = ctx.createOscillator();
    tremolo.type = 'square';
    tremolo.frequency.value = 16;
    const tremoloDepth = ctx.createGain();
    tremoloDepth.gain.value = 0;
    tremolo.connect(tremoloDepth).connect(tone.gain);

    // Off-road rumble (low noise).
    const noise = getNoise(ctx);
    const rumbleSrc = ctx.createBufferSource();
    rumbleSrc.buffer = noise;
    rumbleSrc.loop = true;
    const rumbleFilter = ctx.createBiquadFilter();
    rumbleFilter.type = 'lowpass';
    rumbleFilter.frequency.value = 300;
    rumbleFilter.Q.value = 1;
    const rumbleGain = ctx.createGain();
    rumbleGain.gain.value = 0;
    rumbleSrc.connect(rumbleFilter).connect(rumbleGain).connect(out);

    // Tire squeal (band-passed noise + faint pulse whine).
    const skidSrc = ctx.createBufferSource();
    skidSrc.buffer = noise;
    skidSrc.loop = true;
    const skidFilter = ctx.createBiquadFilter();
    skidFilter.type = 'bandpass';
    skidFilter.frequency.value = 2800;
    skidFilter.Q.value = 3.5;
    const skidGain = ctx.createGain();
    skidGain.gain.value = 0;
    skidSrc.connect(skidFilter).connect(skidGain).connect(out);
    const squeal = makeOsc(ctx, 'pulse12');
    squeal.frequency.value = 1150;
    const squealLfo = ctx.createOscillator();
    squealLfo.frequency.value = 11;
    const squealLfoGain = ctx.createGain();
    squealLfoGain.gain.value = 35;
    squealLfo.connect(squealLfoGain).connect(squeal.detune);
    const squealGain = ctx.createGain();
    squealGain.gain.value = 0;
    squeal.connect(squealGain).connect(out);

    const t = ctx.currentTime;
    for (const s of [oscA, oscB, sub, tremolo, squeal, squealLfo]) s.start(t);
    rumbleSrc.start(t, Math.random() * 0.5);
    skidSrc.start(t, Math.random() * 0.5);

    return {
      oscA, oscB, sub, filter, tone, tremolo, tremoloDepth, rumbleSrc, rumbleFilter, rumbleGain,
      skidSrc, skidFilter, skidGain, squeal, squealGain, out,
      all: [oscA, oscB, sub, subGain, filter, tone, tremolo, tremoloDepth, rumbleSrc, rumbleFilter, rumbleGain,
        skidSrc, skidFilter, skidGain, squeal, squealLfo, squealLfoGain, squealGain, out],
    };
  }

  private destroyEngine(): void {
    const e = this.engine;
    if (!e) return;
    this.engine = null;
    for (const n of e.all) {
      try {
        if (n instanceof AudioScheduledSourceNode) n.stop();
        n.disconnect();
      } catch {
        /* ignore */
      }
    }
  }

  private applyEngine(): void {
    if (!this.ready) return;
    const s = this.engineState;
    const ctx = this.ctx!;
    const t = ctx.currentTime;

    if (!s.running) {
      if (this.engine) {
        this.engine.out.gain.setTargetAtTime(0, t, 0.08);
        if (!this.engineStopTimer) {
          this.engineStopTimer = setTimeout(() => {
            this.engineStopTimer = null;
            if (!this.engineState.running) this.destroyEngine();
          }, 700);
        }
      }
      return;
    }
    if (this.engineStopTimer) {
      clearTimeout(this.engineStopTimer);
      this.engineStopTimer = null;
    }
    try {
      if (!this.engine) this.engine = this.createEngine();
    } catch {
      return;
    }
    const e = this.engine;
    const sp = s.speed01;
    const boost = s.boosting ? 1 : 0;
    // Idle ~52Hz up to ~200Hz at top speed; boost revs it higher.
    const base = 52 + sp * 150 + boost * 45;
    const tc = 0.06;
    e.oscA.frequency.setTargetAtTime(base, t, tc);
    e.oscB.frequency.setTargetAtTime(base * 1.5, t, tc);
    e.sub.frequency.setTargetAtTime(base / 2, t, tc);
    const cutoff = (s.onRoad ? 380 : 260) + sp * (s.onRoad ? 1500 : 700) + boost * 900;
    e.filter.frequency.setTargetAtTime(cutoff, t, tc);
    e.tone.gain.setTargetAtTime(s.onRoad ? 0.22 : 0.17, t, 0.05);

    const offRoad = !s.onRoad && sp > 0.03;
    e.tremoloDepth.gain.setTargetAtTime(offRoad ? 0.08 : 0, t, 0.05);
    e.tremolo.frequency.setTargetAtTime(10 + sp * 14, t, 0.1);
    e.rumbleGain.gain.setTargetAtTime(offRoad ? 0.25 + sp * 0.45 : 0, t, 0.06);
    e.rumbleFilter.frequency.setTargetAtTime(200 + sp * 300, t, 0.1);

    const skid = s.drifting && sp > 0.15;
    e.skidGain.gain.setTargetAtTime(skid ? (s.onRoad ? 0.22 : 0.1) * (0.5 + sp * 0.5) : 0, t, 0.04);
    e.skidFilter.frequency.setTargetAtTime(s.onRoad ? 2600 + sp * 600 : 900, t, 0.08);
    e.squealGain.gain.setTargetAtTime(skid && s.onRoad ? 0.025 : 0, t, 0.05);

    e.out.gain.setTargetAtTime(this.settings.muted ? 0 : 0.35, t, 0.08);
  }

  // --------------------------------------------------------------- volumes --

  setMasterVolume(v: number): void {
    this.settings.master = clamp01(v);
    this.applyVolumes();
    this.persist();
  }

  setMusicVolume(v: number): void {
    this.settings.music = clamp01(v);
    this.applyVolumes();
    this.persist();
  }

  setSfxVolume(v: number): void {
    this.settings.sfx = clamp01(v);
    this.applyVolumes();
    this.persist();
  }

  getVolumes(): { master: number; music: number; sfx: number } {
    const { master, music, sfx } = this.settings;
    return { master, music, sfx };
  }

  setMuted(m: boolean): void {
    this.settings.muted = !!m;
    this.applyVolumes();
    this.applyEngine();
    this.persist();
  }

  isMuted(): boolean {
    return this.settings.muted;
  }
}

export type { AudioEngine };
export const audio = new AudioEngine();
