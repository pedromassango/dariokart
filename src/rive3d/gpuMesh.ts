import type { Track } from '../game/track';
import type { Race } from '../game/race';
import type { Kart } from '../game/kart';
import { SAMPLE_SPACING } from '../game/track';
import { buildScene, shadeHex, type Scene3D } from './scene';
import type { Cam } from './view';
import { effectSparks } from './render';

/**
 * Builds the data the Rive AnimaScript GPU renderer (rive/world3d) consumes:
 *  - a static triangle mesh for the course (ground, road, curbs, walls, scenery) plus instanced
 *    low-poly models (karts, item boxes, shells, bananas, coins), packed as base64 vertex bytes;
 *  - a per-frame number string with the camera, lighting and every instance.
 * Vertex layout (20 bytes): position f32x3, normal snorm8x4, colour unorm8x4 (alpha = material id).
 */

// material ids (see World3DShader.wgsl)
export const MAT = { lit: 255, glow: 250, rainbow: 245, sparkle: 246, body: 240, hat: 241, skin: 242, trim: 243, grass: 10, road: 20, water: 30, lava: 35, sand: 40, snow: 50 } as const;
/** instanced models; the last one (shadow) is drawn alpha-blended after everything else */
export const MODEL = { kart: 0, box: 1, banana: 2, shell: 3, coin: 4, thwomp: 5, iceblock: 6, piranha: 7, spark: 8, shadow: 9 } as const;
const MODEL_COUNT = 10;
const UNIFORM_FLOATS = 56;
const NEAR = 1.5;
const FAR = 9000;

const RAINBOW = ['#ff4040', '#ff9a2a', '#ffe840', '#40e060', '#40b0ff', '#a060ff'];

function rgb(hex: string): [number, number, number] {
  const v = parseInt(hex.slice(1), 16);
  return [(v >> 16) & 255, (v >> 8) & 255, v & 255];
}

class MeshWriter {
  private buf = new ArrayBuffer(1 << 20);
  private dv = new DataView(this.buf);
  count = 0;

  private ensure(bytes: number) {
    if (this.count * 20 + bytes <= this.buf.byteLength) return;
    const next = new ArrayBuffer(Math.max(this.buf.byteLength * 2, this.count * 20 + bytes));
    new Uint8Array(next).set(new Uint8Array(this.buf));
    this.buf = next;
    this.dv = new DataView(next);
  }

  vertex(x: number, y: number, z: number, nx: number, ny: number, nz: number, c: [number, number, number], mat: number) {
    this.ensure(20);
    const o = this.count * 20;
    const dv = this.dv;
    dv.setFloat32(o, x, true); dv.setFloat32(o + 4, y, true); dv.setFloat32(o + 8, z, true);
    dv.setInt8(o + 12, Math.round(nx * 127)); dv.setInt8(o + 13, Math.round(ny * 127)); dv.setInt8(o + 14, Math.round(nz * 127)); dv.setInt8(o + 15, 0);
    dv.setUint8(o + 16, c[0]); dv.setUint8(o + 17, c[1]); dv.setUint8(o + 18, c[2]); dv.setUint8(o + 19, mat);
    this.count++;
  }

  /** convex polygon (flat x,y,z list) as a triangle fan with its Newell normal */
  poly(pts: ArrayLike<number>, color: string | [number, number, number], mat: number = MAT.lit) {
    const n = pts.length / 3;
    if (n < 3) return;
    let nx = 0, ny = 0, nz = 0;
    for (let i = 0; i < n; i++) {
      const j = (i + 1) % n;
      const x1 = pts[i * 3], y1 = pts[i * 3 + 1], z1 = pts[i * 3 + 2];
      const x2 = pts[j * 3], y2 = pts[j * 3 + 1], z2 = pts[j * 3 + 2];
      nx += (y1 - y2) * (z1 + z2); ny += (z1 - z2) * (x1 + x2); nz += (x1 - x2) * (y1 + y2);
    }
    const l = Math.hypot(nx, ny, nz) || 1;
    nx /= l; ny /= l; nz /= l;
    const c = typeof color === 'string' ? rgb(color) : color;
    for (let i = 1; i < n - 1; i++) {
      for (const k of [0, i, i + 1]) this.vertex(pts[k * 3], pts[k * 3 + 1], pts[k * 3 + 2], nx, ny, nz, c, mat);
    }
  }

  /** ground-plane quad at height z (corners in order) */
  quad(x0: number, y0: number, x1: number, y1: number, x2: number, y2: number, x3: number, y3: number, z: number, color: string | [number, number, number], mat: number = MAT.lit) {
    this.poly([x0, y0, z, x1, y1, z, x2, y2, z, x3, y3, z], color, mat);
  }

  /** axis-aligned (in local model space) box: centre, half extents */
  box(cx: number, cy: number, cz: number, hx: number, hy: number, hz: number, color: string, mat: number = MAT.lit, top?: string) {
    const x0 = cx - hx, x1 = cx + hx, y0 = cy - hy, y1 = cy + hy, z0 = cz - hz, z1 = cz + hz;
    this.poly([x0, y0, z1, x1, y0, z1, x1, y1, z1, x0, y1, z1], top ?? color, mat);
    this.poly([x0, y0, z0, x0, y1, z0, x1, y1, z0, x1, y0, z0], color, mat);
    this.poly([x0, y0, z0, x1, y0, z0, x1, y0, z1, x0, y0, z1], color, mat);
    this.poly([x0, y1, z0, x0, y1, z1, x1, y1, z1, x1, y1, z0], color, mat);
    this.poly([x1, y0, z0, x1, y1, z0, x1, y1, z1, x1, y0, z1], color, mat);
    this.poly([x0, y0, z0, x0, y0, z1, x0, y1, z1, x0, y1, z0], color, mat);
  }

  /** cylinder along an axis ('x' | 'y' | 'z') */
  cylinder(cx: number, cy: number, cz: number, r: number, half: number, axis: 'x' | 'y' | 'z', sides: number, color: string, mat: number = MAT.lit, cap?: string) {
    const ring = (s: number) => Array.from({ length: sides }, (_, i) => {
      const a = (i / sides) * Math.PI * 2, u = Math.cos(a) * r, v = Math.sin(a) * r;
      return axis === 'z' ? [cx + u, cy + v, cz + s] : axis === 'y' ? [cx + u, cy + s, cz + v] : [cx + s, cy + u, cz + v];
    });
    const a = ring(-half), b = ring(half);
    for (let i = 0; i < sides; i++) {
      const j = (i + 1) % sides;
      this.poly([...a[i], ...a[j], ...b[j], ...b[i]], color, mat);
    }
    this.poly(b.flat(), cap ?? color, mat);
    this.poly(a.slice().reverse().flat(), cap ?? color, mat);
  }

  /** low-poly sphere (UV) */
  sphere(cx: number, cy: number, cz: number, r: number, color: string, mat: number = MAT.lit, rz = r, rings = 6, segs = 10) {
    for (let i = 0; i < rings; i++) {
      const t0 = (i / rings) * Math.PI - Math.PI / 2, t1 = ((i + 1) / rings) * Math.PI - Math.PI / 2;
      for (let j = 0; j < segs; j++) {
        const p0 = (j / segs) * Math.PI * 2, p1 = ((j + 1) / segs) * Math.PI * 2;
        const pt = (t: number, p: number) => [cx + Math.cos(t) * Math.cos(p) * r, cy + Math.cos(t) * Math.sin(p) * r, cz + Math.sin(t) * rz];
        const a = pt(t0, p0), b = pt(t0, p1), c = pt(t1, p1), d = pt(t1, p0);
        // smooth normals: use the radial direction per vertex
        const c3 = typeof color === 'string' ? rgb(color) : color;
        const emit = (q: number[]) => { const nx = q[0] - cx, ny = q[1] - cy, nz = (q[2] - cz) * (r / rz); const l = Math.hypot(nx, ny, nz) || 1; this.vertex(q[0], q[1], q[2], nx / l, ny / l, nz / l, c3, mat); };
        if (i > 0) { emit(a); emit(b); emit(c); }
        if (i < rings - 1) { emit(a); emit(c); emit(d); }
      }
    }
  }

  bytes(): Uint8Array { return new Uint8Array(this.buf, 0, this.count * 20); }
}

function toBase64(bytes: Uint8Array): string {
  let s = '';
  const CH = 0x8000;
  for (let i = 0; i < bytes.length; i += CH) s += String.fromCharCode.apply(null, bytes.subarray(i, i + CH) as unknown as number[]);
  return btoa(s);
}

// ------------------------------------------------------------------ course
function buildCourse(W: MeshWriter, tr: Track, scene: Scene3D) {
  const th = tr.def.theme, id = tr.def.id;
  const n = tr.n, hw = tr.halfW, cw = th.curbWidth;
  const fall = th.edge === 'fall';
  const bandW = fall ? th.offroadWidth : 46;
  const cx = (tr.minX + tr.maxX) / 2, cy = (tr.minY + tr.maxY) / 2;

  // the world floor (grass / sand / snow, or water / lava / void below a floating course)
  const R = 12000;
  if (id !== 'rainbow') {
    const floorZ = !fall ? -0.05 : id === 'castle' ? -16 : id === 'ghost' ? -60 : -3;
    const mat = th.groundAnim === 'water' ? MAT.water : th.groundAnim === 'lava' ? MAT.lava : id === 'ice' ? MAT.snow : fall ? MAT.lit : id === 'choco' || id === 'beach' ? MAT.sand : MAT.grass;
    // a grid of tiles keeps the floor precise near the camera
    const T = 1500;
    for (let gx = -R; gx < R; gx += T) for (let gy = -R; gy < R; gy += T) {
      W.quad(cx + gx, cy + gy, cx + gx + T, cy + gy, cx + gx + T, cy + gy + T, cx + gx, cy + gy + T, floorZ, th.ground, mat);
    }
  }
  for (const l of tr.def.lakes ?? []) {
    const pts: number[] = [];
    for (const [x, y] of l.points) pts.push(x, y, 0.02);
    W.poly(pts, l.color, MAT.water);
  }

  const ex = 0.7;
  const strip = (i: number, a: number, b: number, z: number, color: string | [number, number, number], mat: number) => {
    const j = (i + 1) % n;
    W.quad(
      tr.x[i] + tr.nx[i] * a, tr.y[i] + tr.ny[i] * a,
      tr.x[j] + tr.nx[j] * a + tr.tx[j] * ex, tr.y[j] + tr.ny[j] * a + tr.ty[j] * ex,
      tr.x[j] + tr.nx[j] * b + tr.tx[j] * ex, tr.y[j] + tr.ny[j] * b + tr.ty[j] * ex,
      tr.x[i] + tr.nx[i] * b, tr.y[i] + tr.ny[i] * b, z, color, mat);
  };

  // shoulders
  const bandMat = th.groundAnim ? MAT.sand : id === 'ice' ? MAT.snow : id === 'plains' || id === 'circuit' ? MAT.grass : MAT.sand;
  const a = hw + cw + bandW;
  for (let i = 0; i < n; i++) {
    strip(i, -a, -(hw + cw) + 0.5, fall ? 0 : 0.02, th.band, bandMat);
    strip(i, hw + cw - 0.5, a, fall ? 0 : 0.02, th.band, bandMat);
  }
  // road
  const road2 = shadeHex(th.road, -0.07);
  for (let i = 0; i < n; i++) {
    let col = th.road;
    let mat: number = id === 'ice' ? MAT.snow : MAT.road;
    if (th.roadStyle === 'rainbow') { col = RAINBOW[Math.floor(i / 2) % RAINBOW.length]; mat = MAT.glow; }
    else if (th.roadStyle === 'planks' || th.roadStyle === 'ice') col = (i & 1) ? road2 : th.road;
    else col = (Math.floor(i / 4) & 1) ? road2 : th.road;
    strip(i, -hw, hw, 0.06, col, mat);
  }
  // planks / bricks mortar
  if (th.roadStyle === 'bricks' || th.roadStyle === 'planks') {
    const mortar = shadeHex(th.road, -0.32);
    const w = th.roadStyle === 'planks' ? 1.0 : 0.7;
    for (let i = 0; i < n; i++) {
      const tx = tr.tx[i], ty = tr.ty[i], nx = tr.nx[i], ny = tr.ny[i], x = tr.x[i], y = tr.y[i];
      W.quad(x - nx * hw, y - ny * hw, x - nx * hw + tx * w, y - ny * hw + ty * w, x + nx * hw + tx * w, y + ny * hw + ty * w, x + nx * hw, y + ny * hw, 0.09, mortar);
      if (th.roadStyle === 'bricks') {
        const off = (i & 1) ? 0 : 6;
        for (let l = -hw + off; l < hw; l += 12) W.quad(x + nx * l, y + ny * l, x + nx * (l + 0.7), y + ny * (l + 0.7), x + nx * (l + 0.7) + tx * SAMPLE_SPACING, y + ny * (l + 0.7) + ty * SAMPLE_SPACING, x + nx * l + tx * SAMPLE_SPACING, y + ny * l + ty * SAMPLE_SPACING, 0.09, mortar);
      }
    }
  }
  // mud puddles
  for (const p of tr.puddles) {
    const pts: number[] = [];
    for (let k = 0; k < 14; k++) { const t = (k / 14) * Math.PI * 2; pts.push(p.x + Math.cos(t) * p.r * (1 + 0.15 * Math.sin(t * 3)), p.y + Math.sin(t) * p.r, 0.1); }
    W.poly(pts, shadeHex(th.road, -0.35), MAT.water);
  }
  // painted lines
  if (th.edgeLine) {
    for (let i = 0; i < n; i++) {
      strip(i, -(hw - 1.4), -(hw - 3.2), 0.12, th.edgeLine, MAT.lit);
      strip(i, hw - 3.2, hw - 1.4, 0.12, th.edgeLine, MAT.lit);
      if (th.centerDashes && (i % 6) < 3) strip(i, -0.8, 0.8, 0.12, th.edgeLine, MAT.lit);
    }
  }
  // raised curbs: a sloped strip on each side, alternating colours
  for (let i = 0; i < n; i++) {
    const col = th.curbColors[i % th.curbColors.length];
    const j = (i + 1) % n;
    for (const s of [-1, 1]) {
      const i0 = hw * s, i1 = (hw + cw) * s;
      const p = (k: number, l: number, z: number, e: number) => [tr.x[k] + tr.nx[k] * l + tr.tx[k] * e, tr.y[k] + tr.ny[k] * l + tr.ty[k] * e, z];
      const h = 0.7;
      // inner slope up, flat top
      const mid = (hw + cw * 0.45) * s;
      W.poly([...p(i, i0, 0.08, 0), ...p(j, i0, 0.08, ex), ...p(j, mid, h, ex), ...p(i, mid, h, 0)], col);
      W.poly([...p(i, mid, h, 0), ...p(j, mid, h, ex), ...p(j, i1, h * 0.6, ex), ...p(i, i1, h * 0.6, 0)], col);
    }
  }
  // start line checkerboard + grid marks
  {
    const cols = 14, rows = 2, sz = (hw * 2) / cols;
    const bx = tr.x[0], by = tr.y[0], tx = tr.tx[0], ty = tr.ty[0], nx = tr.nx[0], ny = tr.ny[0];
    for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
      const col = (r + c) & 1 ? th.startB : th.startA;
      const l0 = -hw + c * sz, l1 = l0 + sz, t0 = r * sz - sz, t1 = t0 + sz;
      W.quad(bx + tx * t0 + nx * l0, by + ty * t0 + ny * l0, bx + tx * t0 + nx * l1, by + ty * t0 + ny * l1, bx + tx * t1 + nx * l1, by + ty * t1 + ny * l1, bx + tx * t1 + nx * l0, by + ty * t1 + ny * l0, 0.14, col);
    }
    for (let s = 0; s < 8; s++) {
      const g = tr.gridSlot(s);
      const gx = -Math.sin(g.heading), gy = Math.cos(g.heading), hx = Math.cos(g.heading), hy2 = Math.sin(g.heading);
      const fx = g.x + hx * 8, fy = g.y + hy2 * 8;
      W.quad(fx - gx * 7, fy - gy * 7, fx + gx * 7, fy + gy * 7, fx + gx * 7 - hx * 1.4, fy + gy * 7 - hy2 * 1.4, fx - gx * 7 - hx * 1.4, fy - gy * 7 - hy2 * 1.4, 0.14, th.startA);
    }
  }
  // dash panels (glowing chevrons)
  for (const p of tr.dashPanels) {
    const tx = p.dirX, ty = p.dirY, nx = -ty, ny = tx;
    W.quad(p.x - tx * 10 - nx * 11, p.y - ty * 10 - ny * 11, p.x + tx * 10 - nx * 11, p.y + ty * 10 - ny * 11, p.x + tx * 10 + nx * 11, p.y + ty * 10 + ny * 11, p.x - tx * 10 + nx * 11, p.y - ty * 10 + ny * 11, 0.14, '#30302c');
    for (let k = 0; k < 3; k++) {
      const col = k === 1 ? '#ffd020' : '#ff6010';
      const o = (k - 1) * 6, bx = p.x + tx * o, by = p.y + ty * o;
      W.quad(bx - nx * 9 - tx * 3, by - ny * 9 - ty * 3, bx + tx * 2, by + ty * 2, bx + tx * 5, by + ty * 5, bx - nx * 9, by - ny * 9, 0.18, col, MAT.glow);
      W.quad(bx + nx * 9 - tx * 3, by + ny * 9 - ty * 3, bx + tx * 2, by + ty * 2, bx + tx * 5, by + ty * 5, bx + nx * 9, by + ny * 9, 0.18, col, MAT.glow);
    }
  }
  // walls, pipes, slabs, gate, signs' frames, grandstand, hills… (the face list shared with the vector renderer)
  for (const f of scene.faces) W.poly(f.pts, [f.r, f.g, f.b], f.glow ? MAT.glow : MAT.lit);
  // item box pedestals are not drawn in SMK; nothing else is static
}

// ------------------------------------------------------------------ models (local space: +x forward, z up)
function buildKart(W: MeshWriter) {
  const dark = '#24242a', tyre = '#1c1c20', metal = '#c4c8d4', white = '#ffffff';
  // floor pan
  W.box(0, 0, 1.5, 6.6, 3.2, 0.35, dark);
  // tapered hull in the kart colour: wide and tall at the back, low and narrow at the nose
  const hull = (x0: number, x1: number, w0: number, w1: number, zb: number, t0: number, t1: number, mat: number) => {
    const P = [
      [x0, -w0, zb], [x1, -w1, zb], [x1, w1, zb], [x0, w0, zb],
      [x0, -w0 * 0.86, t0], [x1, -w1 * 0.8, t1], [x1, w1 * 0.8, t1], [x0, w0 * 0.86, t0],
    ];
    const q = (a: number, b: number, c: number, d: number) => W.poly([...P[a], ...P[b], ...P[c], ...P[d]], white, mat);
    q(4, 5, 6, 7); q(0, 3, 2, 1); q(0, 1, 5, 4); q(3, 7, 6, 2); q(1, 2, 6, 5); q(0, 4, 7, 3);
  };
  hull(-6.4, -1.0, 3.7, 3.4, 1.8, 4.4, 3.6, MAT.body);   // rear body around the seat
  hull(-1.0, 4.4, 3.4, 2.4, 1.8, 3.6, 2.9, MAT.body);    // mid body
  hull(4.4, 7.0, 2.4, 1.6, 1.6, 2.9, 2.0, MAT.body);     // nose cone
  // side pods
  for (const s of [-1, 1]) W.box(-0.6, s * 3.9, 2.4, 2.6, 0.6, 0.7, white, MAT.trim);
  // front bumper + rear wing on struts
  W.box(7.2, 0, 1.9, 0.5, 3.6, 0.45, white, MAT.trim);
  for (const s of [-1.8, 1.8]) W.box(-6.0, s, 5.0, 0.3, 0.3, 1.0, dark);
  W.box(-6.4, 0, 6.1, 0.9, 4.2, 0.28, white, MAT.trim);
  for (const s of [-1, 1]) W.box(-6.4, s * 4.3, 5.7, 1.0, 0.12, 0.7, white, MAT.trim);
  // seat back + engine + exhausts
  W.box(-2.6, 0, 4.9, 0.6, 2.0, 1.6, dark);
  W.box(-5.3, 0, 4.7, 1.1, 1.8, 0.9, metal);
  for (const s of [-1.3, 1.3]) W.cylinder(-7.0, s, 3.3, 0.55, 0.7, 'x', 10, metal, MAT.lit, '#3a3a40');
  // wheels: fat tyres with coloured hubs
  for (const [x, y, r, w] of [[4.6, 3.9, 1.9, 0.95], [4.6, -3.9, 1.9, 0.95], [-4.0, 4.3, 2.45, 1.35], [-4.0, -4.3, 2.45, 1.35]] as [number, number, number, number][]) {
    W.cylinder(x, y, r, r, w, 'y', 16, tyre, MAT.lit, '#3a3a42');
    W.cylinder(x, y + Math.sign(y) * (w + 0.02), r, r * 0.5, 0.06, 'y', 12, white, MAT.trim);
    W.cylinder(x, y + Math.sign(y) * (w + 0.09), r, r * 0.18, 0.05, 'y', 8, metal);
  }
  // steering column + wheel
  W.box(1.6, 0, 4.2, 0.25, 0.25, 0.9, dark);
  W.cylinder(1.3, 0, 5.2, 1.0, 0.12, 'x', 12, dark);
  // driver: overalls (trim), shirt/arms (hat colour like SMK), gloves, head, cap with emblem
  W.box(-1.4, 0, 5.8, 1.4, 1.9, 1.5, white, MAT.trim);
  W.box(-1.2, 0, 7.6, 1.2, 1.7, 0.8, white, MAT.hat);
  for (const s of [-1, 1]) {
    W.box(0.0, s * 1.75, 6.5, 1.5, 0.48, 0.48, white, MAT.hat);
    W.sphere(1.3, s * 0.9, 5.4, 0.55, '#ffffff', MAT.lit, 0.55, 3, 6);
  }
  W.sphere(-1.0, 0, 9.8, 2.05, white, MAT.skin, 2.0, 6, 14);
  W.sphere(0.95, 0, 9.4, 0.62, white, MAT.skin, 0.52, 4, 8);   // nose
  W.box(0.75, 0, 8.7, 0.25, 1.0, 0.22, '#3a2416');              // moustache
  W.sphere(-1.1, 0, 10.8, 2.2, white, MAT.hat, 1.35, 5, 14);   // cap dome
  W.box(1.0, 0, 10.35, 1.4, 1.95, 0.16, white, MAT.hat);        // cap brim
  W.cylinder(0.85, 0, 11.4, 0.7, 0.05, 'x', 12, '#ffffff');     // cap emblem
  for (const s of [-0.75, 0.75]) {
    W.box(0.92, s, 10.0, 0.06, 0.32, 0.5, '#ffffff');
    W.box(0.97, s, 9.95, 0.06, 0.16, 0.3, '#1a1a40');
  }
}

function buildThwomp(W: MeshWriter) {
  // stone block (front = +x) with spikes, a scowling face and teeth
  const stone = '#9aa0ae', dark = '#5a5f6c';
  W.box(0, 0, 10, 8, 9, 10, stone, MAT.lit, '#b4b9c6');
  const spike = (x: number, y: number, z: number, nx: number, ny: number, nz: number) => {
    const s = 1.6, t = [x + nx * 2.4, y + ny * 2.4, z + nz * 2.4];
    const u = nx ? [0, 1, 0] : [1, 0, 0], v = nz ? [0, 1, 0] : [0, 0, 1];
    const c = (a: number, b: number) => [x + (u[0] * a + v[0] * b) * s, y + (u[1] * a + v[1] * b) * s, z + (u[2] * a + v[2] * b) * s];
    const q = [c(-1, -1), c(1, -1), c(1, 1), c(-1, 1)];
    for (let i = 0; i < 4; i++) W.poly([...q[i], ...q[(i + 1) % 4], ...t], dark);
  };
  for (const y of [-5, 0, 5]) for (const z of [4, 16]) spike(-8, y, z, -1, 0, 0);
  for (const s of [-1, 1]) for (const x of [-4, 4]) for (const z of [5, 15]) spike(x, s * 9, z, 0, s, 0);
  for (const x of [-4, 4]) for (const y of [-4.5, 4.5]) spike(x, y, 20, 0, 0, 1);
  // face
  for (const s of [-1, 1]) {
    W.box(8.05, s * 3.2, 13, 0.1, 1.9, 2.0, '#ffffff');
    W.box(8.15, s * 3.0, 12.6, 0.1, 0.8, 1.0, '#1a1a24');
    W.poly([8.2, s * 1.2, 15.6, 8.2, s * 5.2, 16.8, 8.2, s * 5.2, 15.8, 8.2, s * 1.2, 14.8], '#3a3e48');
  }
  W.box(8.05, 0, 6.6, 0.1, 5.4, 1.9, '#2a1a1a');
  for (let i = -2; i <= 2; i++) W.poly([8.15, i * 2 - 0.8, 8.4, 8.15, i * 2 + 0.8, 8.4, 8.15, i * 2, 6.6], '#ffffff');
}

function buildIceBlock(W: MeshWriter) {
  // glossy translucent-looking ice cube (unit half size; scaled per instance)
  W.box(0, 0, 1, 1, 1, 1, '#bfe8ff', MAT.snow, '#e6f7ff');
  for (const s of [-1, 1]) W.box(0.3 * s, 1.01, 1.2, 0.18, 0.01, 0.6, '#ffffff', MAT.glow);
}

function buildPiranha(W: MeshWriter) {
  W.cylinder(0, 0, 3, 0.6, 3, 'z', 8, '#2f9a3a');
  for (const s of [-1, 1]) W.poly([0, 0, 2.4, 3.6 * s, 0.8, 3.4, 4.2 * s, -0.4, 2.2, 0.8 * s, 0, 1.6], '#3cb84a');
  W.sphere(0, 0, 8.6, 3.4, '#e02a20', MAT.lit, 3.0, 6, 12);
  for (const [a, z] of [[0.3, 10.6], [1.6, 9.4], [2.6, 10.8], [3.6, 9.0], [4.6, 10.4], [5.6, 9.6]] as [number, number][]) {
    W.sphere(Math.cos(a) * 3.0, Math.sin(a) * 3.0, z, 0.55, '#ffffff', MAT.lit, 0.5, 3, 6);
  }
  W.box(2.9, 0, 8.2, 0.5, 2.4, 0.5, '#ffffff');                  // lips / teeth
  W.box(3.1, 0, 8.2, 0.3, 2.0, 0.2, '#5a0a0a');
}

function buildSpark(W: MeshWriter) {
  // octahedron, coloured per instance and unlit (glowing)
  const P = [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]];
  const F = [[0, 2, 4], [2, 1, 4], [1, 3, 4], [3, 0, 4], [2, 0, 5], [1, 2, 5], [3, 1, 5], [0, 3, 5]];
  for (const f of F) W.poly(f.flatMap((i) => P[i]), '#ffffff', MAT.sparkle);
}

function buildShadow(W: MeshWriter) {
  // a flat quad whose uv rides in the colour channels; fs_shadow turns it into a soft ellipse
  const c = (u: number, v: number): [number, number, number] => [u * 255, v * 255, 0];
  const x = 8.5, y = 6.0, z = 0.3;
  W.vertex(-x, -y, z, 0, 0, 1, c(0, 0), MAT.lit); W.vertex(x, -y, z, 0, 0, 1, c(1, 0), MAT.lit); W.vertex(x, y, z, 0, 0, 1, c(1, 1), MAT.lit);
  W.vertex(-x, -y, z, 0, 0, 1, c(0, 0), MAT.lit); W.vertex(x, y, z, 0, 0, 1, c(1, 1), MAT.lit); W.vertex(-x, y, z, 0, 0, 1, c(0, 1), MAT.lit);
}

function buildBox(W: MeshWriter) {
  const s = 3.6;
  W.box(0, 0, 0, s, s, s, '#ffffff', MAT.rainbow);
  // "?" made of blocks on both faces
  const q = '#ffffff';
  for (const f of [-1, 1]) {
    const x = f * (s + 0.02);
    for (const [y, z, hy, hz] of [[0, 1.6, 1.2, 0.35], [1.1, 1.0, 0.35, 0.6], [0.4, 0.2, 0.35, 0.45], [0, -0.5, 0.35, 0.3], [0, -1.7, 0.4, 0.4]] as [number, number, number, number][]) {
      W.box(x, y * f, z, 0.08, hy, hz, q, MAT.glow);
    }
  }
}

function buildBanana(W: MeshWriter) {
  const y = '#ffd83a', tip = '#5a3a10';
  for (let i = 0; i < 6; i++) {
    const a0 = -1.0 + i * 0.4, a1 = a0 + 0.4;
    const p = (a: number, r: number, z: number) => [Math.sin(a) * 4, Math.cos(a) * 1.5 - 1.5, z + r];
    const A = p(a0, 0, 1.4), B = p(a1, 0, 1.4);
    W.box((A[0] + B[0]) / 2, (A[1] + B[1]) / 2, 1.4 + Math.abs(i - 2.5) * 0.25, 0.9, 0.9, 0.9, y);
  }
  W.box(4.2, -1.2, 2.4, 0.4, 0.4, 0.6, tip);
}

function buildShell(W: MeshWriter) {
  W.sphere(0, 0, 2.4, 3.2, '#ffffff', MAT.body, 2.4, 5, 12);
  W.cylinder(0, 0, 1.2, 3.4, 0.5, 'z', 14, '#f4f4f4');
  W.cylinder(0, 0, 0.6, 2.9, 0.4, 'z', 14, '#e8d080');
}

function buildCoin(W: MeshWriter) {
  W.cylinder(0, 0, 3.4, 3.0, 0.45, 'y', 14, '#ffc820', MAT.lit, '#ffe060');
  W.box(0, 0, 3.4, 0.6, 0.55, 1.6, '#e0a000');
}

export interface GpuMesh { header: string; data: string; text: string; vertices: number }

const meshCache = new WeakMap<Track, GpuMesh>();

export function buildGpuMesh(tr: Track, scene?: Scene3D): GpuMesh {
  const cached = meshCache.get(tr);
  if (cached) return cached;
  const W = new MeshWriter();
  buildCourse(W, tr, scene ?? buildScene(tr));
  const counts = [W.count];
  for (const build of [buildKart, buildBox, buildBanana, buildShell, buildCoin, buildThwomp, buildIceBlock, buildPiranha, buildSpark, buildShadow]) {
    const before = W.count;
    build(W);
    counts.push(W.count - before);
  }
  const header = counts.join(',');
  const data = toBase64(W.bytes());
  const m = { header, data, text: header + ';' + data, vertices: W.count };
  meshCache.set(tr, m);
  return m;
}

// ------------------------------------------------------------------ per-frame data
function packColor(hex: string): number {
  return parseInt(hex.slice(1), 16);
}

function f(v: number): string {
  // compact, parseable numbers
  if (Number.isInteger(v)) return String(v);
  return v.toFixed(3);
}

export interface FrameOpts { focus: Kart | null; time: number; aspect: number }

/** Uniforms + instances for one camera, as the comma separated string world3d.as parses. */
export function packFrame(race: Race, cam: Cam, opts: FrameOpts, flipY = 1): string {
  const th = race.track.def.theme, id = race.track.def.id;
  const cyw = Math.cos(cam.yaw), syw = Math.sin(cam.yaw), cp = Math.cos(cam.pitch), sp = Math.sin(cam.pitch);
  const fx = cyw * cp, fy = syw * cp, fz = -sp;
  const rx = -syw, ry = cyw, rz = 0;
  const ux = cyw * sp, uy = syw * sp, uz = cp;
  const tanH = Math.tan(cam.fov / 2);
  const sx = 1 / (tanH * opts.aspect), sy = 1 / tanH;
  const A = FAR / (FAR - NEAR), B = -NEAR * FAR / (FAR - NEAR);
  const px = cam.x, py = cam.y, pz = cam.z;
  // view rows (camera space ox, oy, oz) from world: ox = r·(p - c), oy = u·(p - c), oz = f·(p - c)
  const tx = -(rx * px + ry * py + rz * pz), ty = -(ux * px + uy * py + uz * pz), tz = -(fx * px + fy * py + fz * pz);
  // clip = [sx*ox, sy*oy, A*oz + B, oz]; WGSL mat4x4 is column major
  const m = [
    sx * rx, sy * ux, A * fx, fx,
    sx * ry, sy * uy, A * fy, fy,
    sx * rz, sy * uz, A * fz, fz,
    sx * tx, sy * ty, A * tz + B, tz,
  ];
  const fogC = rgb(th.fog), top = rgb(th.skyTop), hor = rgb(th.skyHorizon);
  const night = id === 'ghost' || id === 'rainbow';
  const clouds = ['circuit', 'plains', 'beach', 'choco', 'ice'].includes(id) ? 1 : 0;
  // sun high behind-left (matches the vector renderer's light)
  const L = [-0.38, -0.48, 0.79];
  const u: number[] = [
    ...m,
    px, py, pz, opts.time,
    fogC[0] / 255, fogC[1] / 255, fogC[2] / 255, th.fogNear,
    th.fogFar, flipY, tanH, opts.aspect,
    fx, fy, fz, 0,
    rx, ry, rz, 0,
    ux, uy, uz, 0,
    top[0] / 255, top[1] / 255, top[2] / 255, night ? 1 : 0,
    hor[0] / 255, hor[1] / 255, hor[2] / 255, clouds,
    L[0], L[1], L[2], night ? 0 : 1,
    night ? 0.55 : 0.58, night ? 0.35 : 0.42, 0, 0,
  ];
  if (u.length !== UNIFORM_FLOATS) throw new Error('uniform layout');
  const parts: string[] = u.map(f);

  const groups: number[][] = Array.from({ length: MODEL_COUNT }, () => []);
  const push = (model: number, v: number[]) => groups[model].push(...v);
  const time = opts.time;
  // karts
  for (const k of race.karts) {
    if (k.invulnTimer > 0 && Math.floor(time * 20) % 2 === 0) continue;
    const c = rgb(k.char.color);
    const facing = k.heading + k.spinAngle + k.drift * 0.35;
    const flash = k.starTimer > 0 ? 0.5 + 0.5 * Math.sin(time * 30) : 0;
    const roll = -(k.steerVis || 0) * 0.06 + (k.drift ? -k.drift * 0.08 : 0);
    const pitch = k.z > 0.5 ? -0.12 : 0;
    if (k.fallTimer <= 0 && k.z > -2) push(MODEL.shadow, [k.x, k.y, 0, facing, k.scale, 1, 0, 0, 1, 1, 1, 0, 0, 0, 0, 0]);
    push(MODEL.kart, [k.x, k.y, k.z, facing, 0.9 * k.scale, k.squishTimer > 0 ? 0.35 : 1, roll, flash,
      c[0] / 255, c[1] / 255, c[2] / 255, pitch,
      packColor(k.char.hat), packColor(k.char.skin), packColor(k.char.trim), 0]);
  }
  // item boxes
  const tr = race.track;
  tr.itemBoxes.forEach((b, i) => {
    if (!race.boxVisible(i)) return;
    const z = 5 + Math.sin(time * 2.5 + i) * 0.9;
    push(MODEL.box, [b.x, b.y, z, time * 1.4 + i, 1, 1, 0.35, 0, 1, 1, 1, 0.3, 0, 0, 0, 0]);
    push(MODEL.shadow, [b.x, b.y, 0, 0, 0.55, 1, 0, 0, 1, 1, 1, 0, 0, 0, 0, 0]);
  });
  tr.coins.forEach((c, i) => {
    if (!race.coinVisible(i)) return;
    push(MODEL.coin, [c.x, c.y, 0.5 + Math.sin(time * 3 + i) * 0.4, time * 3 + i, 0.65, 1, 0, 0, 1, 1, 1, 0, 0, 0, 0, 0]);
  });
  for (const e of race.items) {
    if (e.type === 'banana') push(MODEL.banana, [e.x, e.y, e.z, Math.atan2(e.vy, e.vx) || 0, 1.1, 1, 0, 0, 1, 1, 1, 0, 0, 0, 0, 0]);
    else {
      const c = e.type === 'greenShell' ? [0.2, 0.75, 0.25] : [0.9, 0.12, 0.1];
      push(MODEL.shell, [e.x, e.y, e.z, time * 9, 1.1, 1, 0, 0, c[0], c[1], c[2], 0, 0, 0, 0, 0]);
    }
  }
  tr.obstacles.forEach((o, i) => {
    const face = Math.atan2(cam.y - o.y, cam.x - o.x);
    if (o.kind === 'thwomp') {
      const lift = Math.max(0, Math.sin(time * 1.3 + i * 2)) * 12;
      push(MODEL.thwomp, [o.x, o.y, lift, face, 0.95, 1, 0, 0, 1, 1, 1, 0, 0, 0, 0, 0]);
      push(MODEL.shadow, [o.x, o.y, 0, face, 1.3 - lift * 0.03, 1, 0, 0, 1, 1, 1, 0, 0, 0, 0, 0]);
    } else if (o.kind === 'iceblock') {
      push(MODEL.iceblock, [o.x, o.y, 0, i * 0.7, o.r * 1.15, 1, 0, 0, 1, 1, 1, 0, 0, 0, 0, 0]);
    } else if (o.kind === 'piranha') {
      const bite = Math.sin(time * 3 + i) * 0.25;
      push(MODEL.piranha, [o.x, o.y, 0, face + Math.sin(time * 0.9 + i) * 0.4, 1.25, 1, bite, 0, 1, 1, 1, 0, 0, 0, 0, 0]);
    }
  });
  for (const p of effectSparks()) {
    const c = p.color;
    const s = p.size * 0.55 * Math.min(1, (p.life / p.max) * 2.5);
    push(MODEL.spark, [p.x, p.y, p.z, time * 7, s, 1, 0.6, 0, ((c >> 16) & 255) / 255, ((c >> 8) & 255) / 255, (c & 255) / 255, 0, 0, 0, 0, 0]);
  }
  for (const g of groups) {
    parts.push(String(g.length / 16));
    for (const v of g) parts.push(f(v));
  }
  return parts.join(',');
}
