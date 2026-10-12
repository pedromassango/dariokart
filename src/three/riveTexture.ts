import * as THREE from 'three';
import type { RiveRuntime, WrappedRenderer } from '../rive/runtime';
import { Draw } from '../rive/draw';

/**
 * An offscreen canvas rendered by the Rive renderer every frame and uploaded to WebGL as a texture.
 * This is how Rive artboards (animated "?" item faces, start banner, thwomp face...) appear inside the 3D world.
 */
export class RiveTexture {
  readonly canvas: HTMLCanvasElement;
  readonly texture: THREE.CanvasTexture;
  private renderer: WrappedRenderer;
  private draw: Draw;
  private paint: (d: Draw, w: number, h: number, t: number) => void;

  constructor(rive: RiveRuntime, w: number, h: number, paint: (d: Draw, w: number, h: number, t: number) => void) {
    this.canvas = document.createElement('canvas');
    this.canvas.width = w;
    this.canvas.height = h;
    this.renderer = rive.makeRenderer(this.canvas);
    this.draw = new Draw(rive, this.renderer);
    this.paint = paint;
    this.texture = new THREE.CanvasTexture(this.canvas);
    this.texture.colorSpace = THREE.SRGBColorSpace;
    this.texture.anisotropy = 4;
  }

  /** draws the next frame (Rive flushes at the end of its animation frame; WebGL picks it up next frame) */
  update(t: number) {
    this.renderer.clear();
    this.paint(this.draw, this.canvas.width, this.canvas.height, t);
    this.renderer.flush?.();
    this.texture.needsUpdate = true;
  }
}
