import type { TrackDef, PropKind, ObstacleKind } from './tracks';
import { mulberry32 } from './util';

export const SAMPLE_SPACING = 8;

export type Surface = 'road' | 'curb' | 'offroad' | 'wall' | 'fall';

export interface SurfaceInfo {
  surface: Surface;
  index: number; // nearest sample
  lateral: number; // signed distance from centerline (+ = right)
  nx: number; // right-normal of nearest sample
  ny: number;
}

export interface Placed {
  x: number;
  y: number;
}
export interface Deco extends Placed {
  kind: PropKind;
  scale: number;
}
export interface Obstacle extends Placed {
  r: number;
  kind: ObstacleKind;
}
export interface DashPanel extends Placed {
  dirX: number;
  dirY: number;
  index: number;
}

/** Built track geometry from a TrackDef: resampled centerline + derived data. */
export class Track {
  readonly def: TrackDef;
  readonly n: number;
  readonly x: Float32Array;
  readonly y: Float32Array;
  readonly tx: Float32Array; // unit tangent
  readonly ty: Float32Array;
  readonly nx: Float32Array; // unit right normal
  readonly ny: Float32Array;
  readonly halfW: number;
  readonly length: number;
  readonly itemBoxes: Placed[] = [];
  readonly coins: Placed[] = [];
  readonly decos: Deco[] = [];
  readonly obstacles: Obstacle[] = [];
  readonly puddles: (Placed & { r: number })[] = [];
  readonly dashPanels: DashPanel[] = [];
  readonly minX: number; readonly minY: number; readonly maxX: number; readonly maxY: number;
  /** curvature-based recommended speed factor per sample (0.55..1) for AI */
  readonly speedHint: Float32Array;
  /** smoothed racing line lateral offset per sample (-1..1 of half width) */
  readonly racingLine: Float32Array;

  constructor(def: TrackDef) {
    this.def = def;
    this.halfW = def.halfWidth;
    const dense = sampleClosedCatmull(def.points, 24);
    // resample at constant spacing
    const cum: number[] = [0];
    for (let i = 1; i <= dense.length; i++) {
      const a = dense[i - 1], b = dense[i % dense.length];
      cum.push(cum[i - 1] + Math.hypot(b[0] - a[0], b[1] - a[1]));
    }
    const total = cum[cum.length - 1];
    const n = Math.round(total / SAMPLE_SPACING);
    this.n = n;
    this.length = total;
    this.x = new Float32Array(n); this.y = new Float32Array(n);
    this.tx = new Float32Array(n); this.ty = new Float32Array(n);
    this.nx = new Float32Array(n); this.ny = new Float32Array(n);
    // start line in the middle of the first (straight) segment so the grid is aligned
    const startS = cum[12];
    let seg = 0;
    for (let i = 0; i < n; i++) {
      const s = (startS + (i / n) * total) % total;
      if (s < cum[seg]) seg = 0;
      while (cum[seg + 1] < s) seg++;
      const a = dense[seg], b = dense[(seg + 1) % dense.length];
      const t = (s - cum[seg]) / Math.max(1e-6, cum[seg + 1] - cum[seg]);
      this.x[i] = a[0] + (b[0] - a[0]) * t;
      this.y[i] = a[1] + (b[1] - a[1]) * t;
    }
    let minX = 1e9, minY = 1e9, maxX = -1e9, maxY = -1e9;
    for (let i = 0; i < n; i++) {
      const p = (i - 1 + n) % n, q = (i + 1) % n;
      let dx = this.x[q] - this.x[p], dy = this.y[q] - this.y[p];
      const l = Math.hypot(dx, dy) || 1;
      dx /= l; dy /= l;
      this.tx[i] = dx; this.ty[i] = dy;
      // right normal in screen coords (y down): rotate tangent +90deg
      this.nx[i] = -dy; this.ny[i] = dx;
      minX = Math.min(minX, this.x[i]); maxX = Math.max(maxX, this.x[i]);
      minY = Math.min(minY, this.y[i]); maxY = Math.max(maxY, this.y[i]);
    }
    const pad = this.halfW + def.theme.offroadWidth + 40;
    this.minX = minX - pad; this.minY = minY - pad; this.maxX = maxX + pad; this.maxY = maxY + pad;

    // curvature → speed hint + racing line (cut to inside of corners)
    this.speedHint = new Float32Array(n);
    this.racingLine = new Float32Array(n);
    const curv = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      const a = (i - 6 + n) % n, b = (i + 6) % n;
      const cross = this.tx[a] * this.ty[b] - this.ty[a] * this.tx[b];
      const dot = this.tx[a] * this.tx[b] + this.ty[a] * this.ty[b];
      curv[i] = Math.atan2(cross, dot); // + = turning right (clockwise on screen)
    }
    for (let i = 0; i < n; i++) {
      let maxC = 0, sumC = 0;
      for (let k = -2; k <= 14; k++) {
        const c = curv[(i + k + n) % n];
        maxC = Math.max(maxC, Math.abs(c));
      }
      for (let k = -10; k <= 10; k++) sumC += curv[(i + k + n) % n];
      this.speedHint[i] = Math.max(0.6, 1 - maxC * 0.55);
      // inside of the corner: turning right → positive lateral is inside
      this.racingLine[i] = Math.max(-0.6, Math.min(0.6, (sumC / 21) * 2.2));
    }

    const rnd = mulberry32(hashStr(def.id));
    // item box rows (4 across)
    for (const f of def.itemRows) {
      const i = Math.floor(f * n) % n;
      for (const lat of [-0.6, -0.2, 0.2, 0.6]) {
        this.itemBoxes.push(this.pointAt(i, lat * this.halfW));
      }
    }
    // coins: little lines of 3-4 along the track
    const coinGroups = 9;
    for (let g = 0; g < coinGroups; g++) {
      const start = Math.floor(((g + 0.5 + rnd() * 0.4) / coinGroups) * n);
      const lat = (rnd() * 1.4 - 0.7) * this.halfW;
      for (let k = 0; k < 4; k++) this.coins.push(this.pointAt((start + k * 2) % n, lat));
    }
    for (const [f, lat, kind] of def.obstacles ?? []) {
      const i = Math.floor(f * n) % n;
      const p = this.pointAt(i, lat * this.halfW);
      this.obstacles.push({ ...p, r: kind === 'iceblock' ? 8 : kind === 'piranha' ? 5 : 7, kind });
    }
    for (const [f, lat, r] of def.puddles ?? []) {
      const i = Math.floor(f * n) % n;
      this.puddles.push({ ...this.pointAt(i, lat * this.halfW), r });
    }
    for (const [f, lat] of def.dash ?? []) {
      const i = Math.floor(f * n) % n;
      const p = this.pointAt(i, lat * this.halfW);
      this.dashPanels.push({ ...p, dirX: this.tx[i], dirY: this.ty[i], index: i });
    }
    // decorations outside the drivable area
    const props = def.theme.props;
    const off = this.halfW + def.theme.curbWidth + def.theme.offroadWidth;
    const inLake = (x: number, y: number) => (def.lakes ?? []).some((l) => pointInPoly(x, y, l.points));
    for (let i = 0; i < n; i += 4) {
      for (const side of [-1, 1]) {
        if (rnd() < 0.4) continue;
        const kind = props[Math.floor(rnd() * props.length)];
        // lamps/flags line the barrier; boos hover close to the planks; scenery sits further out
        const near = kind === 'lamp' || kind === 'flag';
        const dist = near ? off + 8 + rnd() * 4 : kind === 'boo' ? off + 14 + rnd() * 30 : kind === 'deadtree' ? off + 55 + rnd() * 120 : off + 18 + rnd() * 100;
        if (near && i % 12 !== 0) continue;
        const p = this.pointAt(i, side * dist);
        const s = this.query(p.x, p.y);
        if (Math.abs(s.lateral) < off + 6) continue; // keep clear of every part of the course
        if (inLake(p.x, p.y) && kind !== 'boo') continue;
        this.decos.push({ ...p, kind, scale: near ? 1 : 0.8 + rnd() * 0.6 });
      }
    }
  }

  pointAt(i: number, lateral: number): Placed {
    i = ((i % this.n) + this.n) % this.n;
    return { x: this.x[i] + this.nx[i] * lateral, y: this.y[i] + this.ny[i] * lateral };
  }

  /** Global nearest-centerline query for surface classification. */
  query(px: number, py: number, out?: SurfaceInfo): SurfaceInfo {
    let best = 1e18, bi = 0;
    const xs = this.x, ys = this.y;
    for (let i = 0; i < this.n; i++) {
      const dx = px - xs[i], dy = py - ys[i];
      const d = dx * dx + dy * dy;
      if (d < best) { best = d; bi = i; }
    }
    return this.classify(px, py, bi, out);
  }

  /** Local nearest search around a hint index (for progress tracking). */
  nearestLocal(px: number, py: number, hint: number, range = 24): number {
    let best = 1e18, bi = hint;
    for (let k = -range; k <= range; k++) {
      const i = (hint + k + this.n) % this.n;
      const dx = px - this.x[i], dy = py - this.y[i];
      const d = dx * dx + dy * dy;
      if (d < best) { best = d; bi = i; }
    }
    return bi;
  }

  /** Fractional progress along sample i (projects onto segment i→i+1). */
  fractional(px: number, py: number, i: number): number {
    const dx = px - this.x[i], dy = py - this.y[i];
    const t = (dx * this.tx[i] + dy * this.ty[i]) / SAMPLE_SPACING;
    return i + Math.max(-0.5, Math.min(0.99, t));
  }

  classify(px: number, py: number, i: number, out?: SurfaceInfo): SurfaceInfo {
    const lat = (px - this.x[i]) * this.nx[i] + (py - this.y[i]) * this.ny[i];
    const a = Math.abs(lat);
    const th = this.def.theme;
    let surface: Surface;
    if (a <= this.halfW) surface = 'road';
    else if (a <= this.halfW + th.curbWidth) surface = 'curb';
    else if (a <= this.halfW + th.curbWidth + th.offroadWidth) surface = 'offroad';
    // guard rails (Boo Hollow, Prism Road) block like walls; elsewhere the edge is a drop
    else surface = th.walls === 'rail' ? 'wall' : th.edge;
    const o = out ?? ({} as SurfaceInfo);
    o.surface = surface; o.index = i; o.lateral = lat; o.nx = this.nx[i]; o.ny = this.ny[i];
    return o;
  }

  /** start grid slot position/heading (slot 0 = pole). */
  gridSlot(slot: number): { x: number; y: number; heading: number; index: number } {
    const row = Math.floor(slot / 2);
    const col = slot % 2;
    const back = 3 + row * 3; // samples behind start line
    const i = (this.n - back) % this.n;
    const lat = (col === 0 ? -0.4 : 0.4) * this.halfW;
    const p = this.pointAt(i, lat);
    // staggered like SMK
    const stagger = col === 1 ? -SAMPLE_SPACING * 0.75 : 0;
    return {
      x: p.x + this.tx[i] * stagger,
      y: p.y + this.ty[i] * stagger,
      heading: Math.atan2(this.ty[i], this.tx[i]),
      index: i,
    };
  }
}

export function hashStr(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
}

function sampleClosedCatmull(pts: [number, number][], perSeg: number): [number, number][] {
  const out: [number, number][] = [];
  const n = pts.length;
  for (let i = 0; i < n; i++) {
    const p0 = pts[(i - 1 + n) % n], p1 = pts[i], p2 = pts[(i + 1) % n], p3 = pts[(i + 2) % n];
    for (let k = 0; k < perSeg; k++) {
      const t = k / perSeg;
      out.push(centripetal(p0, p1, p2, p3, t));
    }
  }
  return out;
}

// centripetal Catmull-Rom avoids cusps/self-intersection on uneven spacing
function centripetal(p0: number[], p1: number[], p2: number[], p3: number[], t: number): [number, number] {
  const alpha = 0.5;
  const td = (a: number[], b: number[]) => Math.pow(Math.hypot(b[0] - a[0], b[1] - a[1]) || 1e-4, alpha);
  const t0 = 0, t1 = t0 + td(p0, p1), t2 = t1 + td(p1, p2), t3 = t2 + td(p2, p3);
  const tt = t1 + (t2 - t1) * t;
  const lerp = (a: number[], b: number[], ta: number, tb: number) => {
    const w = (tt - ta) / (tb - ta);
    return [a[0] + (b[0] - a[0]) * w, a[1] + (b[1] - a[1]) * w];
  };
  const a1 = lerp(p0, p1, t0, t1), a2 = lerp(p1, p2, t1, t2), a3 = lerp(p2, p3, t2, t3);
  const b1 = lerp(a1, a2, t0, t2), b2 = lerp(a2, a3, t1, t3);
  const c = lerp(b1, b2, t1, t2);
  return [c[0], c[1]];
}

export function pointInPoly(x: number, y: number, pts: [number, number][]): boolean {
  let inside = false;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const [xi, yi] = pts[i], [xj, yj] = pts[j];
    if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}
