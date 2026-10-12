import { loadRive, loadAssetFile, type RiveRuntime, type WrappedRenderer } from './rive/runtime';
import { Draw } from './rive/draw';
import { RiveAssets } from './rive/assets';
import { loadGlyphs } from './rive/riveText';
import { RaceSession, type SessionSetup } from './game/session';
import { TRACKS } from './game/tracks';
import { CHARACTERS } from './game/characters';

export interface Widget {
  canvas: HTMLCanvasElement;
  renderer: WrappedRenderer;
  draw: Draw;
  paint: (d: Draw, w: number, h: number, t: number) => void;
}

/**
 * Owns the Rive runtime, the single game canvas (the 3D world and the HUD are both drawn by the
 * Rive renderer), the main loop and Rive-powered DOM widgets.
 */
export class App {
  rive!: RiveRuntime;
  assets!: RiveAssets;
  canvas: HTMLCanvasElement;
  private renderer!: WrappedRenderer;
  private draw!: Draw;
  session: RaceSession | null = null;
  private attract: RaceSession | null = null;
  private widgets = new Set<Widget>();
  private last = 0;
  private t = 0;
  private dpr = 1;
  private cssW = 1;
  private cssH = 1;
  onFrame: ((dt: number) => void) | null = null;
  /** menus / overlays drawn with Rive on top of the race (set by Menus) */
  overlay: ((d: Draw, w: number, h: number, t: number) => void) | null = null;
  /** dev/testing: when true the loop renders but does not advance the simulation */
  manualStep = false;
  /** capture/testing: when true, the loop only runs frames requested via requestStep(), each exactly 1/30 s */
  stepMode = false;
  private stepQueue: (() => void)[] = [];

  /** Advance exactly one 1/30 s frame (stepMode); resolves after it has been drawn. */
  requestStep(): Promise<void> {
    return new Promise((resolve) => this.stepQueue.push(resolve));
  }

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
  }

  async init() {
    this.rive = await loadRive();
    const [file] = await Promise.all([loadAssetFile(), loadGlyphs()]);
    this.assets = new RiveAssets(this.rive, file);
    this.renderer = this.rive.makeRenderer(this.canvas);
    this.draw = new Draw(this.rive, this.renderer);

    window.addEventListener('resize', () => this.resize());
    this.resize();
    this.newAttract();
    this.last = performance.now();
    this.rive.requestAnimationFrame(this.loop);
  }

  private newAttract() {
    this.attract?.dispose();
    const track = TRACKS[Math.floor(Math.random() * TRACKS.length)];
    const chars = [...CHARACTERS].sort(() => Math.random() - 0.5);
    const setup: SessionSetup = {
      mode: 'race', track, laps: 99, difficulty: 'hard', items: true, seed: Math.floor(Math.random() * 1e9),
      players: chars.map((c) => ({ id: 'a_' + c.id, name: c.name, char: c.id, control: 'bot' as const, localIndex: -1 })),
    };
    this.attract = new RaceSession(setup);
  }

  resize() {
    this.cssW = window.innerWidth;
    this.cssH = window.innerHeight;
    // the whole world is vector-rendered every frame: cap the backing resolution for a steady frame rate
    this.dpr = Math.min(1.25, window.devicePixelRatio || 1);
    this.canvas.style.width = this.cssW + 'px';
    this.canvas.style.height = this.cssH + 'px';
    this.canvas.width = Math.floor(this.cssW * this.dpr);
    this.canvas.height = Math.floor(this.cssH * this.dpr);
    document.documentElement.style.setProperty('--game-w', this.cssW + 'px');
    document.documentElement.style.setProperty('--game-h', this.cssH + 'px');
    document.documentElement.style.setProperty('--game-scale', String(Math.min(this.cssW / 512, this.cssH / 448)));
  }

  startSession(s: RaceSession) {
    this.session = s;
    s.startAudio();
  }

  endSession() {
    this.session?.stopAudio();
    this.session?.dispose();
    this.session = null;
  }

  addWidget(canvas: HTMLCanvasElement, paint: Widget['paint']): () => void {
    const renderer = this.rive.makeRenderer(canvas);
    const w: Widget = { canvas, renderer, draw: new Draw(this.rive, renderer), paint };
    this.widgets.add(w);
    return () => {
      this.widgets.delete(w);
      try { renderer.delete(); } catch { /* ignore */ }
    };
  }

  clearWidgets() {
    for (const w of this.widgets) { try { w.renderer.delete(); } catch { /* ignore */ } }
    this.widgets.clear();
  }

  private loop = (now: number) => {
    try {
      this.frame(now);
    } catch (e) {
      // never let one bad frame stop the game loop
      console.error('[dariokart] frame error', e);
    }
    this.rive.requestAnimationFrame(this.loop);
  };

  private frame(now: number) {
    let dt = Math.min(0.1, Math.max(0, (now - this.last) / 1000));
    this.last = now;
    if (this.stepMode) {
      const done = this.stepQueue.shift();
      if (!done) return;
      dt = 1 / 30;
      // resolve once this frame's Rive draw calls have been flushed
      requestAnimationFrame(() => done());
    }
    this.t += dt;
    this.assets.beginFrame(dt);
    this.onFrame?.(dt);

    const s = this.session ?? this.attract;
    if (s && !this.manualStep) {
      let acc = dt;
      while (acc > 0) {
        const step = Math.min(acc, 1 / 60);
        s.update(step);
        acc -= step;
      }
      if (s === this.attract && s.race.phase === 'done') this.newAttract();
    }

    // the frame: 3D world + HUD, all drawn through the Rive renderer
    const d = this.draw;
    this.renderer.clear();
    d.save();
    d.scale(this.dpr);
    if (s) s.render(d, this.assets, this.cssW, this.cssH);
    this.overlay?.(d, this.cssW, this.cssH, this.t);
    d.restore();
    this.renderer.flush?.();

    for (const w of this.widgets) {
      if (!w.canvas.isConnected) { this.widgets.delete(w); continue; }
      const rect = w.canvas.getBoundingClientRect();
      const pw = Math.max(1, Math.round(rect.width * this.dpr)), ph = Math.max(1, Math.round(rect.height * this.dpr));
      if (w.canvas.width !== pw || w.canvas.height !== ph) { w.canvas.width = pw; w.canvas.height = ph; }
      w.renderer.clear();
      w.draw.save();
      w.draw.scale(this.dpr);
      w.paint(w.draw, rect.width, rect.height, this.t);
      w.draw.restore();
      w.renderer.flush?.();
    }
  }
}
