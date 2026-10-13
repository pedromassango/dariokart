import type { Artboard, StateMachineInstance, ViewModelInstance } from '@rive-app/canvas-advanced';
import type { RiveRuntime } from './runtime';
import type { Draw } from './draw';
import type { Viewport } from '../game/projector';

/**
 * MK8-style speed lines + boost glow: `speedfx.riv`, whose AnimaScript layout (rive/speedfx/speedfx.as)
 * draws procedural streaks with the Rive renderer. One instance per viewport, sized to it and fed the
 * focused kart's speed, boost and drift every frame through the SpeedFx view model.
 */
interface FxView { artboard: Artboard; sm: StateMachineInstance | null; vmi: ViewModelInstance; last: number }

export class SpeedFx {
  private views = new Map<string, FxView>();

  private constructor(private rive: RiveRuntime, private file: Awaited<ReturnType<RiveRuntime['load']>>) {}

  static async load(rive: RiveRuntime): Promise<SpeedFx | null> {
    try {
      const res = await fetch(new URL('assets/speedfx.riv', document.baseURI).href);
      if (!res.ok) return null;
      const file = await rive.load(new Uint8Array(await res.arrayBuffer()));
      return file ? new SpeedFx(rive, file) : null;
    } catch (e) {
      console.warn('[dariokart] speed effects unavailable', e);
      return null;
    }
  }

  private view(key: string): FxView {
    let v = this.views.get(key);
    if (!v) {
      const artboard = this.file.artboardByName('SpeedFx');
      const vmi = this.file.viewModelByName('SpeedFx').instance();
      artboard.bindViewModelInstance(vmi);
      const sm = artboard.stateMachineCount() > 0 ? new this.rive.StateMachineInstance(artboard.stateMachineByIndex(0), artboard) : null;
      sm?.bindViewModelInstance(vmi);
      v = { artboard, sm, vmi, last: 0 };
      this.views.set(key, v);
    }
    return v;
  }

  /** speed: 0..1 of top speed, boost: 0..1, drift: -1..1; drawn in CSS pixels inside `vp` */
  draw(d: Draw, key: string, vp: Viewport, speed: number, boost: number, drift: number) {
    const v = this.view(key);
    const now = performance.now();
    const dt = v.last ? Math.min(0.1, (now - v.last) / 1000) : 0;
    v.last = now;
    v.vmi.number('speed').value = speed;
    v.vmi.number('boost').value = boost;
    v.vmi.number('drift').value = drift;
    const ab = v.artboard;
    ab.width = vp.w;
    ab.height = vp.h;
    v.sm?.advance(dt);
    ab.advance(dt);
    const r = d.r;
    r.save();
    r.align(this.rive.Fit.layout, this.rive.Alignment.topLeft, { minX: vp.x, minY: vp.y, maxX: vp.x + vp.w, maxY: vp.y + vp.h }, ab.bounds, 1);
    ab.draw(r as never);
    r.restore();
  }
}
