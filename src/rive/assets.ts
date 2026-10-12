import type { RiveRuntime, RiveFile, WrappedRenderer } from './runtime';
import type { Artboard, StateMachineInstance, SMIInput } from '@rive-app/canvas-advanced';
import { applyTransform, type Draw } from './draw';

interface Inst {
  artboard: Artboard;
  sm: StateMachineInstance | null;
  inputs: Map<string, SMIInput>;
  minX: number; minY: number; w: number; h: number;
  frame: number;
}

export type InputValues = Record<string, number | boolean>;

/**
 * Manages instances of artboards from the Dariokart .riv asset pack:
 * caches instances by key, advances their "Main" state machines once per frame,
 * and draws them with the shared Rive renderer at any screen transform.
 */
export class RiveAssets {
  readonly rive: RiveRuntime;
  readonly file: RiveFile | null;
  private insts = new Map<string, Inst>();
  private names = new Set<string>();
  private frame = 0;
  private dt = 0;

  constructor(rive: RiveRuntime, file: RiveFile | null) {
    this.rive = rive;
    this.file = file;
    if (file) {
      const n = file.artboardCount();
      for (let i = 0; i < n; i++) {
        const ab = file.artboardByIndex(i);
        this.names.add(ab.name);
        ab.delete?.();
      }
    }
  }

  get loaded() { return !!this.file; }
  has(name: string) { return this.names.has(name); }

  /** Call once per rendered frame before drawing. */
  beginFrame(dt: number) {
    this.frame++;
    this.dt = dt;
  }

  private get(key: string, name: string): Inst | null {
    // instances are cached per (key, artboard): the same key may legitimately show different artboards over time
    key = key + '|' + name;
    let inst = this.insts.get(key);
    if (inst) return inst;
    if (!this.file || !this.names.has(name)) return null;
    const artboard = this.file.artboardByName(name);
    if (!artboard) return null;
    let sm: StateMachineInstance | null = null;
    try {
      if (artboard.stateMachineCount() > 0) {
        const def = artboard.stateMachineByName('Main') ?? artboard.stateMachineByIndex(0);
        if (def) sm = new this.rive.StateMachineInstance(def, artboard);
      }
    } catch { sm = null; }
    const inputs = new Map<string, SMIInput>();
    if (sm) {
      for (let i = 0; i < sm.inputCount(); i++) {
        const inp = sm.input(i);
        inputs.set(inp.name, inp);
      }
    }
    const b = artboard.bounds;
    inst = { artboard, sm, inputs, minX: b.minX, minY: b.minY, w: b.maxX - b.minX, h: b.maxY - b.minY, frame: -1 };
    this.insts.set(key, inst);
    // settle first frame
    sm?.advance(0);
    artboard.advance(0);
    return inst;
  }

  setInputs(key: string, name: string, values: InputValues) {
    const inst = this.get(key, name);
    if (!inst) return;
    for (const k in values) {
      const inp = inst.inputs.get(k);
      if (!inp) continue;
      const v = values[k];
      if (inp.type === this.rive.SMIInput.trigger) { if (v) inp.asTrigger().fire(); }
      else if (inp.type === this.rive.SMIInput.bool) { const b = inp.asBool(); if (b.value !== !!v) b.value = !!v; }
      else { const nmb = inp.asNumber(); if (nmb.value !== Number(v)) nmb.value = Number(v); }
    }
  }

  /**
   * Draws an artboard instance. (cx, cy) is the anchor point in current renderer space;
   * `width` is the drawn width in px; anchorY 0 = top, 0.5 = center, 1 = bottom.
   * Returns false if the artboard is unavailable (caller draws a vector fallback).
   */
  draw(d: Draw | WrappedRenderer, key: string, name: string, cx: number, cy: number, width: number, opts: { anchorY?: number; inputs?: InputValues; flipX?: boolean; height?: number } = {}): boolean {
    const inst = this.get(key, name);
    if (!inst) return false;
    if (opts.inputs) this.setInputs(key, name, opts.inputs);
    if (inst.frame !== this.frame) {
      inst.frame = this.frame;
      if (inst.sm) inst.sm.advance(this.dt);
      inst.artboard.advance(this.dt);
    }
    const r = 'r' in d ? d.r : d;
    const sx = width / inst.w;
    const sy = opts.height ? opts.height / inst.h : sx;
    const ay = opts.anchorY ?? 0.5;
    const fx = opts.flipX ? -sx : sx;
    const tx = cx - (opts.flipX ? -1 : 1) * (inst.minX + inst.w * 0.5) * sx;
    const ty = cy - (inst.minY + inst.h * ay) * sy;
    r.save();
    applyTransform(r, fx, 0, 0, sy, tx, ty);
    inst.artboard.draw(r as never);
    r.restore();
    return true;
  }

  /**
   * Draws an artboard mapped onto a parallelogram (top-left, top-right, bottom-left corners),
   * used to lay artboards flat on the Mode-7 floor.
   */
  drawAffine(d: Draw, key: string, name: string, tlx: number, tly: number, trx: number, try_: number, blx: number, bly: number): boolean {
    const inst = this.get(key, name);
    if (!inst) return false;
    if (inst.frame !== this.frame) {
      inst.frame = this.frame;
      if (inst.sm) inst.sm.advance(this.dt);
      inst.artboard.advance(this.dt);
    }
    const xx = (trx - tlx) / inst.w, xy = (try_ - tly) / inst.w;
    const yx = (blx - tlx) / inst.h, yy = (bly - tly) / inst.h;
    const r = d.r;
    r.save();
    applyTransform(r, xx, xy, yx, yy, tlx - xx * inst.minX - yx * inst.minY, tly - xy * inst.minX - yy * inst.minY);
    inst.artboard.draw(r as never);
    r.restore();
    return true;
  }

  aspect(name: string): number {
    const inst = this.get('__probe_' + name, name);
    return inst ? inst.h / inst.w : 1;
  }
}
