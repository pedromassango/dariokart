import * as THREE from 'three';
import { loadRive, loadAssetFile, type RiveRuntime, type WrappedRenderer } from './rive/runtime';
import { Draw, argb } from './rive/draw';
import { RiveAssets } from './rive/assets';
import { loadGlyphs } from './rive/riveText';
import { RaceSession, type SessionSetup } from './game/session';
import { TRACKS } from './game/tracks';
import { CHARACTERS } from './game/characters';
import { RiveTexture } from './three/riveTexture';
import { setRiveTextures } from './three/riveTextures';
import { setMaxAnisotropy } from './three/textures';

export interface Widget {
  canvas: HTMLCanvasElement;
  renderer: WrappedRenderer;
  draw: Draw;
  paint: (d: Draw, w: number, h: number, t: number) => void;
}

/**
 * Owns the Rive runtime, the Three.js WebGL renderer (3D world), the Rive overlay canvas (HUD),
 * the main loop, Rive-powered DOM widgets and Rive textures used inside the 3D scene.
 */
export class App {
  rive!: RiveRuntime;
  assets!: RiveAssets;
  canvas: HTMLCanvasElement; // Rive overlay
  gl!: THREE.WebGLRenderer;
  private glCanvas: HTMLCanvasElement;
  private renderer!: WrappedRenderer;
  private draw!: Draw;
  session: RaceSession | null = null;
  private attract: RaceSession | null = null;
  private widgets = new Set<Widget>();
  private riveTex: RiveTexture[] = [];
  private last = 0;
  private t = 0;
  private dpr = 1;
  private cssW = 1;
  private cssH = 1;
  onFrame: ((dt: number) => void) | null = null;
  /** dev/testing: when true the loop renders but does not advance the simulation */
  manualStep = false;

  constructor(canvas: HTMLCanvasElement, glCanvas: HTMLCanvasElement) {
    this.canvas = canvas;
    this.glCanvas = glCanvas;
  }

  async init() {
    this.rive = await loadRive();
    const [file] = await Promise.all([loadAssetFile(), loadGlyphs()]);
    this.assets = new RiveAssets(this.rive, file);
    this.renderer = this.rive.makeRenderer(this.canvas);
    this.draw = new Draw(this.rive, this.renderer);

    this.gl = new THREE.WebGLRenderer({ canvas: this.glCanvas, antialias: true, powerPreference: 'high-performance' });
    this.gl.shadowMap.enabled = true;
    this.gl.shadowMap.type = THREE.PCFSoftShadowMap;
    this.gl.toneMapping = THREE.ACESFilmicToneMapping;
    this.gl.toneMappingExposure = 1.05;
    this.gl.outputColorSpace = THREE.SRGBColorSpace;
    setMaxAnisotropy(Math.min(8, this.gl.capabilities.getMaxAnisotropy()));
    this.makeRiveTextures();

    window.addEventListener('resize', () => this.resize());
    this.resize();
    this.newAttract();
    this.last = performance.now();
    this.rive.requestAnimationFrame(this.loop);
  }

  /** Rive artboards rendered into textures for the 3D world. */
  private makeRiveTextures() {
    const a = this.assets;
    const mk = (w: number, h: number, paint: (d: Draw, w: number, h: number, t: number) => void) => {
      const t = new RiveTexture(this.rive, w, h, paint);
      this.riveTex.push(t);
      return t;
    };
    const itemBox = mk(256, 256, (d, w, h) => {
      if (!a.draw(d, 'tex_panel', 'ItemPanel', w / 2, h / 2, w, { anchorY: 0.5 })) d.rect(0, 0, w, h, argb('#ffd040'));
    });
    const banner = a.has('Banner') || a.has('Logo') ? mk(1024, 160, (d, w, h) => {
      if (!a.draw(d, 'tex_banner', 'Banner', w / 2, h / 2, w, { anchorY: 0.5 })) {
        d.rect(0, 0, w, h, argb('#c81818'));
        a.draw(d, 'tex_logo', 'Logo', w / 2, h / 2, h * 2.6, { anchorY: 0.5 });
      }
    }) : null;
    const thwomp = a.has('Thwomp') ? mk(256, 256, (d, w, h, t) => {
      a.draw(d, 'tex_thwomp', 'Thwomp', w / 2, h * 0.98, w * 0.95, { anchorY: 1, inputs: { slam: Math.sin(t * 1.3) > 0.6 } });
    }) : null;
    setRiveTextures({ itemBox, banner, thwomp });
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
    this.dpr = Math.min(2, window.devicePixelRatio || 1);
    for (const c of [this.canvas, this.glCanvas]) {
      c.style.width = this.cssW + 'px';
      c.style.height = this.cssH + 'px';
    }
    this.canvas.width = Math.floor(this.cssW * this.dpr);
    this.canvas.height = Math.floor(this.cssH * this.dpr);
    this.gl?.setPixelRatio(this.dpr);
    this.gl?.setSize(this.cssW, this.cssH, false);
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
    const dt = Math.min(0.1, Math.max(0, (now - this.last) / 1000));
    this.last = now;
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

    for (const t of this.riveTex) t.update(this.t);

    // 3D world
    const gs = this.gl.getDrawingBufferSize(new THREE.Vector2());
    if (s) s.render3D(this.gl, gs.x / this.dpr, gs.y / this.dpr);

    // Rive overlay (HUD)
    const d = this.draw;
    this.renderer.clear();
    d.save();
    d.scale(this.dpr);
    if (s) s.renderOverlay(d, this.assets, this.cssW, this.cssH);
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
    this.rive.requestAnimationFrame(this.loop);
  };
}
