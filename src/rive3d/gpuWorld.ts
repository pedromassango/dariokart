import type { Race } from '../game/race';
import type { Kart } from '../game/kart';
import type { Viewport } from '../game/projector';
import type { Cam } from './view';
import { buildGpuMesh, packFrame } from './gpuMesh';

/**
 * Hosts the GPU 3D world: Rive's WebGL2 runtime playing `world3d.riv`, whose AnimaScript layout script
 * (rive/world3d/world3d.as) renders the course, karts and items with a depth buffer through a WGSL
 * shader. It draws into its own canvas underneath the vector (canvas2d) Rive canvas that carries the
 * Rive artboard billboards, HUD and menus.
 *
 * If WebGL2 or the signed .riv is unavailable, `ready` stays false and the game keeps the vector
 * renderer for the world.
 */

type WebGLRive = Awaited<ReturnType<typeof import('@rive-app/webgl2-advanced').default>>;
type RiveFile = Awaited<ReturnType<WebGLRive['load']>>;
type Artboard = ReturnType<RiveFile['artboardByName']>;
type VMI = ReturnType<ReturnType<RiveFile['viewModelByName']>['instance']>;
type Renderer = ReturnType<WebGLRive['makeRenderer']>;

interface WorldView { artboard: Artboard; vmi: VMI; mesh: string }

export interface GpuViewSpec { vp: Viewport; race: Race; cam: Cam; focus: Kart | null; time: number }

export class GpuWorld {
  ready = false;
  private rive: WebGLRive | null = null;
  private file: RiveFile | null = null;
  private renderer: Renderer | null = null;
  private views: WorldView[] = [];
  private dpr = 1;
  private lastT = 0;
  /** 1 or -1: some GL paths present render targets upside down; flipped once if detected */
  flipY = 1;

  constructor(readonly canvas: HTMLCanvasElement) {}

  async init(): Promise<boolean> {
    try {
      const probe = document.createElement('canvas').getContext('webgl2');
      if (!probe) return false;
      const [{ default: RiveWebGL }, { default: wasmUrl }] = await Promise.all([
        import('@rive-app/webgl2-advanced'),
        import('@rive-app/webgl2-advanced/rive.wasm?url'),
      ]);
      const rive = await RiveWebGL({ locateFile: () => wasmUrl });
      const res = await fetch(new URL('assets/world3d.riv', document.baseURI).href);
      if (!res.ok) return false;
      // scripts reach the GPU through a deferred session: the file is imported through it and the
      // renderer replays what the scripts record (gpuCanvas, render passes) at flush
      const session = rive.makeDeferredSession?.();
      if (!session) return false;
      const renderer = rive.makeRenderer(this.canvas);
      const file = await rive.load(new Uint8Array(await res.arrayBuffer()), undefined, false, session);
      if (!file || !renderer.attachSession?.(session)) return false;
      this.rive = rive;
      this.file = file;
      this.renderer = renderer;
      this.ready = true;
      return true;
    } catch (e) {
      console.warn('[dariokart] GPU world unavailable, using the vector renderer', e);
      return false;
    }
  }

  resize(cssW: number, cssH: number, dpr: number) {
    this.dpr = dpr;
    this.canvas.style.width = cssW + 'px';
    this.canvas.style.height = cssH + 'px';
    this.canvas.width = Math.max(1, Math.floor(cssW * dpr));
    this.canvas.height = Math.max(1, Math.floor(cssH * dpr));
  }

  private view(i: number): WorldView {
    let v = this.views[i];
    if (!v) {
      const file = this.file!;
      const artboard = file.artboardByName('World');
      const vmi = file.viewModelByName('World').instance();
      artboard.bindViewModelInstance(vmi);
      v = { artboard, vmi, mesh: '' };
      this.views[i] = v;
    }
    return v;
  }

  /** Renders one GPU world per viewport. Call once per frame (even with no views, to clear). */
  render(specs: GpuViewSpec[], now: number) {
    const rive = this.rive, renderer = this.renderer, file = this.file;
    if (!rive || !renderer || !file) return;
    const dt = this.lastT ? Math.min(0.1, (now - this.lastT) / 1000) : 0;
    this.lastT = now;
    const dpr = this.dpr;
    file.displayScale?.(dpr);
    renderer.clear();
    specs.forEach((s, i) => {
      const v = this.view(i);
      const mesh = buildGpuMesh(s.race.track);
      if (v.mesh !== mesh.text) {
        v.vmi.string('mesh').value = mesh.text;
        v.mesh = mesh.text;
      }
      v.vmi.string('frame').value = packFrame(s.race, s.cam, { focus: s.focus, time: s.time, aspect: s.vp.w / Math.max(1, s.vp.h) }, this.flipY);
      const ab = v.artboard;
      ab.width = s.vp.w;
      ab.height = s.vp.h;
      ab.advance(dt);
      renderer.save();
      renderer.align(rive.Fit.layout, rive.Alignment.topLeft,
        { minX: s.vp.x * dpr, minY: s.vp.y * dpr, maxX: (s.vp.x + s.vp.w) * dpr, maxY: (s.vp.y + s.vp.h) * dpr },
        ab.bounds, dpr);
      ab.draw(renderer);
      renderer.restore();
    });
    renderer.flush();
  }
}
