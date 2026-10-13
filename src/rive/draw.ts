import type { RiveRuntime, WrappedRenderer } from './runtime';
import type { RenderPaint } from '@rive-app/canvas-advanced';

/**
 * The canvas2d renderer's transform() takes six numbers (xx, xy, yx, yy, tx, ty),
 * unlike the typings which declare a Mat2D.
 */
export function applyTransform(r: WrappedRenderer, xx: number, xy: number, yx: number, yy: number, tx: number, ty: number) {
  (r as unknown as { transform: (...a: number[]) => void }).transform(xx, xy, yx, yy, tx, ty);
}

/** The runtime's path type: typings call it reset() but 2.44 exposes rewind(). */
export interface RenderPath {
  rewind(): void;
  moveTo(x: number, y: number): void;
  lineTo(x: number, y: number): void;
  cubicTo(ox: number, oy: number, ix: number, iy: number, x: number, y: number): void;
  close(): void;
}

/** ARGB color helper: hex '#rrggbb' + alpha 0..1 → 0xAARRGGBB */
export function argb(hex: string | number, alpha = 1): number {
  const rgb = typeof hex === 'number' ? hex : parseInt(hex.slice(1), 16);
  const a = Math.max(0, Math.min(255, Math.round(alpha * 255)));
  return ((a << 24) >>> 0) + (rgb & 0xffffff);
}

export function mixHex(a: string, b: string, t: number): string {
  const pa = parseInt(a.slice(1), 16), pb = parseInt(b.slice(1), 16);
  const r = Math.round(((pa >> 16) & 255) * (1 - t) + ((pb >> 16) & 255) * t);
  const g = Math.round(((pa >> 8) & 255) * (1 - t) + ((pb >> 8) & 255) * t);
  const bl = Math.round((pa & 255) * (1 - t) + (pb & 255) * t);
  return '#' + ((r << 16) | (g << 8) | bl).toString(16).padStart(6, '0');
}

export function shade(hex: string, f: number): string {
  return f >= 0 ? mixHex(hex, '#ffffff', f) : mixHex(hex, '#000000', -f);
}

/**
 * Thin immediate-mode drawing layer on top of the Rive low-level renderer.
 * All game graphics go through Rive RenderPaths / RenderPaints.
 * Supports "batches": many sub-polygons accumulated into one RenderPath and drawn
 * with a single drawPath call (Mode-7 road, curbs, tiles, pixel text...).
 */
export class Draw {
  readonly rive: RiveRuntime;
  readonly r: WrappedRenderer;
  private path: RenderPath;
  private paint: RenderPaint;
  private strokePaint: RenderPaint;
  private batches = new Map<number, RenderPath>();
  private batchUsed = new Set<number>();

  constructor(rive: RiveRuntime, renderer: WrappedRenderer) {
    this.rive = rive;
    this.r = renderer;
    this.path = rive.renderFactory.makeRenderPath() as unknown as RenderPath;
    this.paint = rive.renderFactory.makeRenderPaint();
    this.paint.style(rive.RenderPaintStyle.fill);
    this.strokePaint = rive.renderFactory.makeRenderPaint();
    this.strokePaint.style(rive.RenderPaintStyle.stroke);
    this.strokePaint.join(rive.StrokeJoin.round);
    this.strokePaint.cap(rive.StrokeCap.round);
  }

  save() { this.r.save(); }
  restore() { this.r.restore(); }
  translate(x: number, y: number) { this.r.translate(x, y); }
  rotate(a: number) { this.r.rotate(a); }
  /** Applies an affine transform [xx, xy, yx, yy, tx, ty]. */
  transform(xx: number, xy: number, yx: number, yy: number, tx: number, ty: number) {
    applyTransform(this.r, xx, xy, yx, yy, tx, ty);
  }
  scale(sx: number, sy = sx) { this.transform(sx, 0, 0, sy, 0, 0); }

  clipRect(x: number, y: number, w: number, h: number) {
    const p = this.path;
    p.rewind();
    p.moveTo(x, y); p.lineTo(x + w, y); p.lineTo(x + w, y + h); p.lineTo(x, y + h); p.close();
    this.r.clipPath(p as never);
  }

  private clipOutPath: RenderPath | null = null;
  /**
   * Clips to the rectangle (x, y, w, h) minus `holes` (flat x0, y0, x1, y1 rectangles), using an
   * even-odd path. Used to keep vector billboards from covering GPU-rendered karts in front of them.
   */
  clipOut(x: number, y: number, w: number, h: number, holes: ArrayLike<number>, count: number) {
    let p = this.clipOutPath;
    if (!p) {
      p = this.rive.renderFactory.makeRenderPath() as unknown as RenderPath;
      (p as unknown as { fillRule(v: number): void }).fillRule(this.rive.FillRule.evenOdd);
      this.clipOutPath = p;
    }
    p.rewind();
    p.moveTo(x, y); p.lineTo(x + w, y); p.lineTo(x + w, y + h); p.lineTo(x, y + h); p.close();
    for (let i = 0; i < count; i++) {
      const x0 = holes[i * 4], y0 = holes[i * 4 + 1], x1 = holes[i * 4 + 2], y1 = holes[i * 4 + 3];
      p.moveTo(x0, y0); p.lineTo(x1, y0); p.lineTo(x1, y1); p.lineTo(x0, y1); p.close();
    }
    this.r.clipPath(p as never);
  }

  private fillPaint(color: number): RenderPaint {
    const paint = this.paint;
    paint.color(color);
    return paint;
  }

  // ---------- immediate shapes ----------
  rect(x: number, y: number, w: number, h: number, color: number, strokeColor?: number, strokeW = 2) {
    const p = this.path;
    p.rewind();
    p.moveTo(x, y); p.lineTo(x + w, y); p.lineTo(x + w, y + h); p.lineTo(x, y + h); p.close();
    this.r.drawPath(p as never, this.fillPaint(color));
    if (strokeColor !== undefined) this.strokeCurrent(strokeColor, strokeW);
  }

  roundRect(x: number, y: number, w: number, h: number, rad: number, color: number, strokeColor?: number, strokeW = 2) {
    const p = this.path;
    p.rewind();
    addRoundRect(p, x, y, w, h, rad);
    this.r.drawPath(p as never, this.fillPaint(color));
    if (strokeColor !== undefined) this.strokeCurrent(strokeColor, strokeW);
  }

  poly(pts: ArrayLike<number>, color: number, strokeColor?: number, strokeW = 2) {
    if (pts.length < 6) return;
    const p = this.path;
    p.rewind();
    p.moveTo(pts[0], pts[1]);
    for (let i = 2; i < pts.length; i += 2) p.lineTo(pts[i], pts[i + 1]);
    p.close();
    this.r.drawPath(p as never, this.fillPaint(color));
    if (strokeColor !== undefined) this.strokeCurrent(strokeColor, strokeW);
  }

  circle(cx: number, cy: number, rad: number, color: number, strokeColor?: number, strokeW = 2) {
    this.ellipse(cx, cy, rad, rad, color, strokeColor, strokeW);
  }

  ellipse(cx: number, cy: number, rx: number, ry: number, color: number, strokeColor?: number, strokeW = 2) {
    const p = this.path;
    p.rewind();
    addEllipse(p, cx, cy, rx, ry);
    this.r.drawPath(p as never, this.fillPaint(color));
    if (strokeColor !== undefined) this.strokeCurrent(strokeColor, strokeW);
  }

  line(x1: number, y1: number, x2: number, y2: number, color: number, w = 2) {
    const p = this.path;
    p.rewind();
    p.moveTo(x1, y1); p.lineTo(x2, y2);
    this.strokeCurrent(color, w);
  }

  polyline(pts: ArrayLike<number>, color: number, w = 2, closed = false) {
    const p = this.path;
    p.rewind();
    p.moveTo(pts[0], pts[1]);
    for (let i = 2; i < pts.length; i += 2) p.lineTo(pts[i], pts[i + 1]);
    if (closed) p.close();
    this.strokeCurrent(color, w);
  }

  private strokeCurrent(color: number, w: number) {
    const sp = this.strokePaint;
    sp.color(color);
    sp.thickness(w);
    this.r.drawPath(this.path as never, sp);
  }

  /** Vertical linear gradient rectangle (sky etc). stops: [offset, argb][] */
  gradientRect(x: number, y: number, w: number, h: number, stops: [number, number][]) {
    const p = this.path;
    p.rewind();
    p.moveTo(x, y); p.lineTo(x + w, y); p.lineTo(x + w, y + h); p.lineTo(x, y + h); p.close();
    const paint = this.rive.renderFactory.makeRenderPaint();
    paint.style(this.rive.RenderPaintStyle.fill);
    paint.linearGradient(x, y, x, y + h);
    for (const [o, c] of stops) paint.addStop(c, o);
    paint.completeGradient();
    this.r.drawPath(p as never, paint);
    (paint as unknown as { delete?: () => void }).delete?.();
  }

  // ---------- batches ----------
  /** Get (and lazily reset) a batched path for a color for this frame. */
  batch(color: number): RenderPath {
    let p = this.batches.get(color);
    if (!p) {
      p = this.rive.renderFactory.makeRenderPath() as unknown as RenderPath;
      this.batches.set(color, p);
    }
    if (!this.batchUsed.has(color)) {
      p.rewind();
      this.batchUsed.add(color);
    }
    return p;
  }

  batchPoly(color: number, pts: ArrayLike<number>, n = pts.length) {
    if (n < 6) return;
    const p = this.batch(color);
    p.moveTo(pts[0], pts[1]);
    for (let i = 2; i < n; i += 2) p.lineTo(pts[i], pts[i + 1]);
    p.close();
  }

  batchRect(color: number, x: number, y: number, w: number, h: number) {
    const p = this.batch(color);
    p.moveTo(x, y); p.lineTo(x + w, y); p.lineTo(x + w, y + h); p.lineTo(x, y + h); p.close();
  }

  /** Draws all pending batches in insertion order of `order` (or any order) and clears them. */
  flushBatches(order?: number[]) {
    const colors = order ?? Array.from(this.batchUsed);
    for (const c of colors) {
      if (!this.batchUsed.has(c)) continue;
      const p = this.batches.get(c)!;
      this.r.drawPath(p as never, this.fillPaint(c));
      this.batchUsed.delete(c);
    }
  }

  // ---------- pixel font ----------
  /**
   * Draws SNES-style bitmap text using batched Rive rect paths.
   * size = pixel size of one font dot. align: 0 left, 0.5 center, 1 right.
   */
  text(str: string, x: number, y: number, size: number, color: number, opts: { align?: number; shadow?: number; outline?: number; tall?: number } = {}) {
    const s = str.toUpperCase();
    const w = textWidth(s, size);
    const ox = x - w * (opts.align ?? 0);
    const t = opts.tall ?? 1;
    if (opts.outline !== undefined) {
      for (const [dx, dy] of OUTLINE_OFFS) this.glyphs(s, ox + dx * size, y + dy * size, size, opts.outline, t);
      this.flushBatches([opts.outline]);
    }
    if (opts.shadow !== undefined) {
      this.glyphs(s, ox + size, y + size, size, opts.shadow, t);
      this.flushBatches([opts.shadow]);
    }
    this.glyphs(s, ox, y, size, color, t);
    this.flushBatches([color]);
  }

  private glyphs(s: string, x: number, y: number, size: number, color: number, tall = 1) {
    let cx = x;
    for (const ch of s) {
      const g = FONT[ch];
      if (g) {
        for (let row = 0; row < 7; row++) {
          const bits = g[row];
          if (!bits) continue;
          // merge horizontal runs into single rects
          let col = 0;
          while (col < 5) {
            if (bits & (16 >> col)) {
              let end = col;
              while (end + 1 < 5 && bits & (16 >> (end + 1))) end++;
              this.batchRect(color, cx + col * size, y + row * size * tall, (end - col + 1) * size, size * tall);
              col = end + 1;
            } else col++;
          }
        }
      }
      cx += 6 * size;
    }
  }
}

const OUTLINE_OFFS = [[-1, 0], [1, 0], [0, -1], [0, 1], [-1, -1], [1, 1], [-1, 1], [1, -1], [1, 2], [0, 2], [2, 1]];

export function textWidth(s: string, size: number) {
  return Math.max(0, s.length * 6 - 1) * size;
}

const K = 0.5522847498;
export function addEllipse(p: RenderPath, cx: number, cy: number, rx: number, ry: number) {
  p.moveTo(cx + rx, cy);
  p.cubicTo(cx + rx, cy + ry * K, cx + rx * K, cy + ry, cx, cy + ry);
  p.cubicTo(cx - rx * K, cy + ry, cx - rx, cy + ry * K, cx - rx, cy);
  p.cubicTo(cx - rx, cy - ry * K, cx - rx * K, cy - ry, cx, cy - ry);
  p.cubicTo(cx + rx * K, cy - ry, cx + rx, cy - ry * K, cx + rx, cy);
  p.close();
}

export function addRoundRect(p: RenderPath, x: number, y: number, w: number, h: number, r: number) {
  r = Math.min(r, w / 2, h / 2);
  p.moveTo(x + r, y);
  p.lineTo(x + w - r, y);
  p.cubicTo(x + w - r * (1 - K), y, x + w, y + r * (1 - K), x + w, y + r);
  p.lineTo(x + w, y + h - r);
  p.cubicTo(x + w, y + h - r * (1 - K), x + w - r * (1 - K), y + h, x + w - r, y + h);
  p.lineTo(x + r, y + h);
  p.cubicTo(x + r * (1 - K), y + h, x, y + h - r * (1 - K), x, y + h - r);
  p.lineTo(x, y + r);
  p.cubicTo(x, y + r * (1 - K), x + r * (1 - K), y, x + r, y);
  p.close();
}

// 5x7 bitmap font. Each row is 5 bits (MSB = leftmost column).
const FONT: Record<string, number[]> = (() => {
  const raw: Record<string, string> = {
    A: '01110 10001 10001 11111 10001 10001 10001',
    B: '11110 10001 10001 11110 10001 10001 11110',
    C: '01110 10001 10000 10000 10000 10001 01110',
    D: '11110 10001 10001 10001 10001 10001 11110',
    E: '11111 10000 10000 11110 10000 10000 11111',
    F: '11111 10000 10000 11110 10000 10000 10000',
    G: '01110 10001 10000 10111 10001 10001 01111',
    H: '10001 10001 10001 11111 10001 10001 10001',
    I: '01110 00100 00100 00100 00100 00100 01110',
    J: '00111 00010 00010 00010 00010 10010 01100',
    K: '10001 10010 10100 11000 10100 10010 10001',
    L: '10000 10000 10000 10000 10000 10000 11111',
    M: '10001 11011 10101 10101 10001 10001 10001',
    N: '10001 10001 11001 10101 10011 10001 10001',
    O: '01110 10001 10001 10001 10001 10001 01110',
    P: '11110 10001 10001 11110 10000 10000 10000',
    Q: '01110 10001 10001 10001 10101 10010 01101',
    R: '11110 10001 10001 11110 10100 10010 10001',
    S: '01111 10000 10000 01110 00001 00001 11110',
    T: '11111 00100 00100 00100 00100 00100 00100',
    U: '10001 10001 10001 10001 10001 10001 01110',
    V: '10001 10001 10001 10001 10001 01010 00100',
    W: '10001 10001 10001 10101 10101 10101 01010',
    X: '10001 10001 01010 00100 01010 10001 10001',
    Y: '10001 10001 01010 00100 00100 00100 00100',
    Z: '11111 00001 00010 00100 01000 10000 11111',
    '0': '01110 10001 10011 10101 11001 10001 01110',
    '1': '00100 01100 00100 00100 00100 00100 01110',
    '2': '01110 10001 00001 00010 00100 01000 11111',
    '3': '11111 00010 00100 00010 00001 10001 01110',
    '4': '00010 00110 01010 10010 11111 00010 00010',
    '5': '11111 10000 11110 00001 00001 10001 01110',
    '6': '00110 01000 10000 11110 10001 10001 01110',
    '7': '11111 00001 00010 00100 01000 01000 01000',
    '8': '01110 10001 10001 01110 10001 10001 01110',
    '9': '01110 10001 10001 01111 00001 00010 01100',
    ':': '00000 01100 01100 00000 01100 01100 00000',
    "'": '01100 01100 00100 01000 00000 00000 00000',
    '"': '01010 01010 01010 00000 00000 00000 00000',
    '.': '00000 00000 00000 00000 00000 01100 01100',
    ',': '00000 00000 00000 00000 01100 00100 01000',
    '!': '00100 00100 00100 00100 00100 00000 00100',
    '?': '01110 10001 00001 00010 00100 00000 00100',
    '-': '00000 00000 00000 11111 00000 00000 00000',
    '+': '00000 00100 00100 11111 00100 00100 00000',
    '/': '00001 00010 00010 00100 01000 01000 10000',
    'x': '00000 10001 01010 00100 01010 10001 00000',
    '*': '00000 10101 01110 11111 01110 10101 00000',
    '#': '01010 11111 01010 01010 01010 11111 01010',
    '<': '00010 00100 01000 10000 01000 00100 00010',
    '>': '01000 00100 00010 00001 00010 00100 01000',
    '(': '00010 00100 01000 01000 01000 00100 00010',
    ')': '01000 00100 00010 00010 00010 00100 01000',
    ' ': '00000 00000 00000 00000 00000 00000 00000',
  };
  const out: Record<string, number[]> = {};
  for (const k in raw) out[k] = raw[k].split(' ').map((r) => parseInt(r, 2));
  return out;
})();
