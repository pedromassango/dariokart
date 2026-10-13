import { MAT, rgb, type MeshWriter } from './meshWriter';
import type { CharacterDef } from '../game/characters';

/**
 * Smooth-shaded 3D models for the GPU world: the kart chassis and one driver per character, built from
 * lofted, lathed and ellipsoid surfaces with per-vertex normals. Local space: +x forward, +y left, z up;
 * the kart's wheels sit on z = 0.
 */

type V3 = [number, number, number];
type Col = string | [number, number, number];

const add = (a: V3, b: V3): V3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const sub = (a: V3, b: V3): V3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const mul = (a: V3, s: number): V3 => [a[0] * s, a[1] * s, a[2] * s];
const dot = (a: V3, b: V3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a: V3, b: V3): V3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const norm = (a: V3): V3 => { const l = Math.hypot(a[0], a[1], a[2]) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };
const col = (c: Col): [number, number, number] => (typeof c === 'string' ? rgb(c) : c);

/** orthonormal frame whose z axis is `n` and whose y axis leans towards world up */
function frameOf(n: V3): [V3, V3, V3] {
  const ez = norm(n);
  let up: V3 = [0, 0, 1];
  if (Math.abs(dot(up, ez)) > 0.95) up = [1, 0, 0];
  const ey = norm(sub(up, mul(ez, dot(up, ez))));
  const ex = cross(ey, ez);
  return [ex, ey, ez];
}

/** frame pitched around y (positive lifts +x) and turned around z */
function turned(yaw: number, pitch = 0): [V3, V3, V3] {
  const cy = Math.cos(yaw), sy = Math.sin(yaw), cp = Math.cos(pitch), sp = Math.sin(pitch);
  return [[cp * cy, cp * sy, sp], [-sy, cy, 0], [-sp * cy, -sp * sy, cp]];
}

/** emits a grid of points with normals as triangles; columns wrap around when `wrap` */
function grid(W: MeshWriter, P: V3[][], N: V3[][], c: Col, mat: number, wrap = true) {
  const color = col(c);
  const rows = P.length, cols = P[0].length;
  const v = (i: number, j: number) => { const p = P[i][j], n = N[i][j]; W.vertex(p[0], p[1], p[2], n[0], n[1], n[2], color, mat); };
  for (let i = 0; i < rows - 1; i++) {
    for (let j = 0; j < (wrap ? cols : cols - 1); j++) {
      const k = (j + 1) % cols;
      v(i, j); v(i + 1, j); v(i + 1, k);
      v(i, j); v(i + 1, k); v(i, k);
    }
  }
}

/** ellipsoid (optionally only the latitudes between lat0 and lat1, in radians) with smooth normals */
function ellipsoid(W: MeshWriter, c: V3, r: V3, color: Col, mat: number = MAT.lit, o: { frame?: [V3, V3, V3]; lat0?: number; lat1?: number; rings?: number; segs?: number } = {}) {
  const [ex, ey, ez] = o.frame ?? [[1, 0, 0], [0, 1, 0], [0, 0, 1]];
  const rings = o.rings ?? 10, segs = o.segs ?? 18;
  const l0 = o.lat0 ?? -Math.PI / 2, l1 = o.lat1 ?? Math.PI / 2;
  const P: V3[][] = [], N: V3[][] = [];
  for (let i = 0; i <= rings; i++) {
    const t = l0 + (l1 - l0) * (i / rings);
    const pr: V3[] = [], nr: V3[] = [];
    for (let j = 0; j < segs; j++) {
      const f = (j / segs) * Math.PI * 2;
      const s: V3 = [Math.cos(t) * Math.cos(f), Math.cos(t) * Math.sin(f), Math.sin(t)];
      pr.push(add(c, add(add(mul(ex, s[0] * r[0]), mul(ey, s[1] * r[1])), mul(ez, s[2] * r[2]))));
      nr.push(norm(add(add(mul(ex, s[0] / r[0]), mul(ey, s[1] / r[1])), mul(ez, s[2] / r[2]))));
    }
    P.push(pr); N.push(nr);
  }
  grid(W, P, N, color, mat);
}

/** sphere-swept segment from a (radius ra) to b (radius rb): arms, legs, horns, pipes */
function capsule(W: MeshWriter, a: V3, b: V3, ra: number, rb: number, color: Col, mat: number = MAT.lit, segs = 12) {
  const d = norm(sub(b, a));
  const [u, v] = frameOf(d);
  const P: V3[][] = [], N: V3[][] = [];
  const half = 5;
  for (let i = 0; i <= half * 2 + 1; i++) {
    const end = i > half;
    const t = end ? ((i - half - 1) / half) * (Math.PI / 2) : -Math.PI / 2 + (i / half) * (Math.PI / 2);
    const c = end ? b : a, r = end ? rb : ra;
    const pr: V3[] = [], nr: V3[] = [];
    for (let j = 0; j < segs; j++) {
      const f = (j / segs) * Math.PI * 2;
      const n = add(mul(d, Math.sin(t)), mul(add(mul(u, Math.cos(f)), mul(v, Math.sin(f))), Math.cos(t)));
      pr.push(add(c, mul(n, r)));
      nr.push(n);
    }
    P.push(pr); N.push(nr);
  }
  grid(W, P, N, color, mat);
}

/** cone from a base centre along `dir` (spikes, horns, crown points) */
function cone(W: MeshWriter, base: V3, dir: V3, r: number, h: number, color: Col, mat: number = MAT.lit, segs = 10) {
  const d = norm(dir);
  const [u, v] = frameOf(d);
  const tip = add(base, mul(d, h));
  const P: V3[][] = [[], []], N: V3[][] = [[], []];
  for (let j = 0; j < segs; j++) {
    const f = (j / segs) * Math.PI * 2;
    const radial = add(mul(u, Math.cos(f)), mul(v, Math.sin(f)));
    const n = norm(add(mul(radial, h), mul(d, r)));
    P[0].push(add(base, mul(radial, r))); N[0].push(n);
    P[1].push(tip); N[1].push(n);
  }
  grid(W, P, N, color, mat);
}

/** surface of revolution around an axis through `c`; profile = [radius, offset along axis] pairs */
function lathe(W: MeshWriter, c: V3, axis: V3, profile: [number, number][], color: Col, mat: number = MAT.lit, segs = 20) {
  const d = norm(axis);
  const [u, v] = frameOf(d);
  const P: V3[][] = [], N: V3[][] = [];
  for (let i = 0; i < profile.length; i++) {
    const [r, o] = profile[i];
    const [rp, op] = profile[Math.max(0, i - 1)], [rn, on] = profile[Math.min(profile.length - 1, i + 1)];
    // profile tangent (dr, do) → normal (do, -dr) in the (radial, axis) plane
    const dr = rn - rp, dO = on - op;
    const pr: V3[] = [], nr: V3[] = [];
    for (let j = 0; j < segs; j++) {
      const f = (j / segs) * Math.PI * 2;
      const radial = add(mul(u, Math.cos(f)), mul(v, Math.sin(f)));
      pr.push(add(add(c, mul(radial, r)), mul(d, o)));
      nr.push(norm(add(mul(radial, dO), mul(d, -dr))));
    }
    P.push(pr); N.push(nr);
  }
  grid(W, P, N, color, mat);
}

/** rounded-box loft along x: superellipse cross sections (x, half width, bottom z, top z) */
function loft(W: MeshWriter, sections: [number, number, number, number][], color: Col, mat: number, e = 3.2, segs = 24) {
  const P: V3[][] = [];
  const pw = 2 / e;
  for (const [x, w, zb, zt] of sections) {
    const zc = (zb + zt) / 2, hz = (zt - zb) / 2;
    const row: V3[] = [];
    for (let j = 0; j < segs; j++) {
      const f = (j / segs) * Math.PI * 2, cf = Math.cos(f), sf = Math.sin(f);
      row.push([x, Math.sign(cf) * Math.pow(Math.abs(cf), pw) * w, zc + Math.sign(sf) * Math.pow(Math.abs(sf), pw) * hz]);
    }
    P.push(row);
  }
  // normals from the surface's two tangents, pointed away from the section centre
  const rows = P.length, N: V3[][] = [];
  for (let i = 0; i < rows; i++) {
    const nr: V3[] = [];
    const [, , zb, zt] = sections[i];
    for (let j = 0; j < segs; j++) {
      const ta = sub(P[Math.min(rows - 1, i + 1)][j], P[Math.max(0, i - 1)][j]);
      const tb = sub(P[i][(j + 1) % segs], P[i][(j + segs - 1) % segs]);
      let n = norm(cross(ta, tb));
      const out = sub(P[i][j], [P[i][j][0], 0, (zb + zt) / 2]);
      if (dot(n, out) < 0) n = mul(n, -1);
      nr.push(n);
    }
    N.push(nr);
  }
  grid(W, P, N, color, mat);
  // end caps
  for (const [i, s] of [[0, -1], [rows - 1, 1]] as [number, number][]) {
    const ring = P[i];
    const cz = (sections[i][2] + sections[i][3]) / 2;
    const cc: V3 = [sections[i][0], 0, cz];
    const n: V3 = [s, 0, 0];
    const c3 = col(color);
    for (let j = 0; j < segs; j++) {
      const a = ring[j], b = ring[(j + 1) % segs];
      for (const p of [cc, a, b]) W.vertex(p[0], p[1], p[2], n[0], n[1], n[2], c3, mat);
    }
  }
}

/** a feature (eye, spot, nose…) sitting on an ellipsoid's surface in direction `dir` */
function onSurface(W: MeshWriter, c: V3, r: V3, dir: V3, size: V3, color: Col, mat: number = MAT.lit, sink = 0.35, segs = 14) {
  const s = norm(dir);
  const t = 1 / Math.hypot(s[0] / r[0], s[1] / r[1], s[2] / r[2]);
  const p = add(c, mul(s, t));
  const n = norm([p[0] - c[0], p[1] - c[1], p[2] - c[2]].map((v, k) => v / (r[k] * r[k])) as V3);
  const f = frameOf(n);
  ellipsoid(W, sub(p, mul(n, size[2] * sink)), size, color, mat, { frame: f, rings: 6, segs });
  return { p, n };
}

// ------------------------------------------------------------------ kart
export function buildKart(W: MeshWriter) {
  const dark = '#26262c', tyre = '#1d1d21', metal = '#c8ccd6', white = '#ffffff';
  // tub: a rounded body in the kart colour, low nose rising to the seat and engine
  loft(W, [
    [8.1, 0.9, 1.5, 2.2], [7.5, 1.9, 1.2, 2.7], [6.2, 2.6, 1.1, 3.0], [4.2, 3.0, 1.0, 3.2], [1.6, 3.3, 1.0, 3.4],
    [-1.2, 3.6, 1.0, 3.7], [-3.6, 3.7, 1.1, 4.3], [-5.8, 3.4, 1.3, 4.3], [-6.8, 2.6, 1.6, 3.9], [-7.2, 1.6, 2.0, 3.4],
  ], white, MAT.body, 3.4);
  // under-tray and side skirts
  loft(W, [[6.5, 2.2, 0.75, 1.3], [-6.4, 3.9, 0.75, 1.5]], dark, MAT.lit, 4);
  for (const s of [-1, 1]) {
    ellipsoid(W, [-0.2, s * 3.95, 2.3], [3.4, 0.75, 0.95], white, MAT.trim, { segs: 16, rings: 8 });
    ellipsoid(W, [-0.2, s * 4.05, 2.35], [2.2, 0.55, 0.45], '#ffffff', MAT.gloss, { segs: 12, rings: 6 });
  }
  // front bumper and a nose badge
  capsule(W, [8.3, -3.2, 1.7], [8.3, 3.2, 1.7], 0.55, 0.55, white, MAT.trim);
  ellipsoid(W, [7.9, 0, 2.55], [0.25, 0.75, 0.75], '#ffffff', MAT.gloss, { frame: turned(0, -0.5), segs: 14, rings: 6 });
  // seat
  ellipsoid(W, [-3.0, 0, 5.6], [0.8, 2.2, 2.2], dark, MAT.lit, { segs: 16, rings: 8 });
  // engine block, exhausts and rear wing
  ellipsoid(W, [-5.6, 0, 4.7], [1.4, 2.0, 1.0], metal, MAT.gloss, { segs: 16, rings: 8 });
  for (const s of [-1.3, 1.3]) {
    lathe(W, [-7.0, s, 3.4], [-1, 0, 0.18], [[0, 0.8], [0.4, 0.8], [0.46, 0.6], [0.42, -1.2], [0, -1.2]], '#7c808c', MAT.gloss, 12);
    ellipsoid(W, [-7.82, s, 3.55], [0.05, 0.32, 0.32], '#141416', MAT.lit, { segs: 10, rings: 4 });
  }
  for (const s of [-1.8, 1.8]) capsule(W, [-6.0, s, 4.2], [-6.5, s, 6.1], 0.25, 0.25, dark);
  loft(W, [[-5.6, 4.2, 6.0, 6.2], [-6.3, 4.4, 6.0, 6.55], [-7.3, 4.4, 6.1, 6.45]], white, MAT.trim, 5, 16);
  for (const s of [-1, 1]) ellipsoid(W, [-6.4, s * 4.45, 5.9], [1.1, 0.14, 0.85], white, MAT.trim, { segs: 12, rings: 6 });
  // wheels: lathed tyres with tread shoulders, coloured hubs and chrome caps
  for (const [x, y, r, w] of [[4.7, 3.8, 1.85, 0.95], [4.7, -3.8, 1.85, 0.95], [-4.0, 4.25, 2.4, 1.3], [-4.0, -4.25, 2.4, 1.3]] as [number, number, number, number][]) {
    const s = Math.sign(y), c: V3 = [x, y, r], ax: V3 = [0, s, 0];
    lathe(W, c, ax, [[r * 0.55, -w], [r * 0.88, -w], [r * 0.98, -w * 0.82], [r, -w * 0.45], [r, w * 0.45], [r * 0.98, w * 0.82], [r * 0.88, w], [r * 0.55, w]], tyre, MAT.lit, 22);
    lathe(W, c, ax, [[0, w * 1.02], [r * 0.56, w * 1.0], [r * 0.6, w * 0.7]], white, MAT.trim, 16);
    lathe(W, add(c, [0, s * w * 1.02, 0]), ax, [[0, 0.32], [0.3, 0.25], [0.45, 0]], metal, MAT.gloss, 10);
  }
  // steering column + wheel
  capsule(W, [2.6, 0, 3.6], [1.6, 0, 5.1], 0.22, 0.22, dark);
  lathe(W, [1.45, 0, 5.3], [1, 0, 0.55], [[0.95, -0.12], [1.15, 0], [0.95, 0.12], [0.75, 0], [0.95, -0.12]], dark, MAT.lit, 16);
}

// ------------------------------------------------------------------ drivers
interface Pose {
  shoulderZ: number; torso: V3; torsoR: V3; head: V3; headR: V3;
}

const BASE: Pose = { shoulderZ: 7.5, torso: [-1.7, 0, 6.2], torsoR: [1.55, 2.0, 1.95], head: [-0.9, 0, 10.0], headR: [2.45, 2.45, 2.35] };

function eyes(W: MeshWriter, head: V3, r: V3, iris: Col, o: { spread?: number; up?: number; w?: number; h?: number; lids?: Col } = {}) {
  const spread = o.spread ?? 0.36, up = o.up ?? 0.22, w = o.w ?? 0.5, h = o.h ?? 0.78;
  for (const s of [-1, 1]) {
    const dir: V3 = [1, s * spread, up];
    onSurface(W, head, r, dir, [w, h, 0.32], '#ffffff', MAT.eye, 0.45);
    onSurface(W, head, [r[0] + 0.12, r[1] + 0.12, r[2] + 0.12], [1, s * spread * 0.95, up - 0.02], [w * 0.62, h * 0.66, 0.2], iris, MAT.eye, 0.5, 12);
    onSurface(W, head, [r[0] + 0.2, r[1] + 0.2, r[2] + 0.2], [1, s * spread * 0.95, up - 0.02], [w * 0.32, h * 0.38, 0.12], '#101018', MAT.eye, 0.5, 10);
    onSurface(W, head, [r[0] + 0.26, r[1] + 0.26, r[2] + 0.26], [1, s * spread * 0.8, up + 0.1], [w * 0.15, h * 0.15, 0.06], '#ffffff', MAT.glow, 0.5, 8);
    if (o.lids) onSurface(W, head, r, [1, s * spread, up + 0.32], [w * 1.05, 0.28, 0.3], o.lids, MAT.lit, 0.45);
  }
}

/** arms from the shoulders to the steering wheel, with gloves or hands */
function arms(W: MeshWriter, sleeve: Col, hand: Col, z: number, o: { r?: number; width?: number; upper?: Col; glove?: number } = {}) {
  const r = o.r ?? 0.55, width = o.width ?? 2.05;
  for (const s of [-1, 1]) {
    const sh: V3 = [-1.4, s * width, z], el: V3 = [-0.2, s * (width + 0.25), z - 1.3], wr: V3 = [1.05, s * 1.05, 5.75];
    capsule(W, sh, el, r * 1.15, r, o.upper ?? sleeve);
    capsule(W, el, wr, r, r * 0.9, sleeve);
    ellipsoid(W, add(wr, [0.35, s * -0.05, 0.05]), [0.62 * (o.glove ?? 1), 0.55 * (o.glove ?? 1), 0.58 * (o.glove ?? 1)], hand, MAT.lit, { segs: 12, rings: 7 });
  }
}

function legs(W: MeshWriter, trousers: Col, shoe: Col, o: { r?: number } = {}) {
  const r = o.r ?? 0.62;
  for (const s of [-1, 1]) {
    capsule(W, [-1.2, s * 1.0, 4.5], [1.6, s * 1.05, 4.1], r, r * 0.9, trousers);
    capsule(W, [1.6, s * 1.05, 4.1], [3.8, s * 1.0, 3.4], r * 0.9, r * 0.8, trousers);
    ellipsoid(W, [4.3, s * 1.0, 3.35], [0.95, 0.6, 0.55], shoe, MAT.gloss, { segs: 12, rings: 6 });
  }
}

/** plumber cap: dome, brim and a white emblem with the letter disc */
function cap(W: MeshWriter, head: V3, r: V3, c: string, emblem: string) {
  ellipsoid(W, add(head, [-0.2, 0, 0.9]), [r[0] * 1.06, r[1] * 1.07, r[2] * 0.85], c, MAT.gloss, { lat0: 0.0, rings: 8, segs: 22 });
  // puffy crown above the band
  ellipsoid(W, add(head, [0.0, 0, 1.6]), [r[0] * 1.0, r[1] * 1.02, r[2] * 0.6], c, MAT.gloss, { lat0: -0.2, rings: 7, segs: 22 });
  ellipsoid(W, add(head, [r[0] * 0.85, 0, 1.0]), [1.6, r[1] * 0.92, 0.2], c, MAT.gloss, { frame: turned(0, -0.16), rings: 5, segs: 20 });
  onSurface(W, add(head, [0.0, 0, 1.6]), [r[0] * 1.0, r[1] * 1.02, r[2] * 0.6], [1, 0, 0.5], [0.85, 0.85, 0.16], '#ffffff', MAT.lit, 0.4);
  onSurface(W, add(head, [0.0, 0, 1.6]), [r[0] * 1.0 + 0.1, r[1] * 1.02 + 0.1, r[2] * 0.6 + 0.1], [1, 0, 0.5], [0.5, 0.5, 0.1], emblem, MAT.lit, 0.4);
}

function plumber(W: MeshWriter, ch: CharacterDef, tall: number) {
  const shirt = ch.hat, overalls = ch.trim, skin = ch.skin, hair = '#4a2a14';
  const head: V3 = [BASE.head[0], 0, BASE.head[2] + tall], hr = BASE.headR;
  legs(W, overalls, '#6a3a1a');
  // overalls (lower) and shirt (upper) with straps and gold buttons
  ellipsoid(W, [-1.7, 0, 5.4], [1.65, 2.05, 1.5], overalls, MAT.lit);
  ellipsoid(W, [-1.75, 0, 6.6 + tall * 0.5], [1.5, 1.95, 1.55 + tall * 0.3], shirt, MAT.lit);
  for (const s of [-1, 1]) {
    capsule(W, [-0.4, s * 0.9, 5.6], [-0.9, s * 1.1, 7.6 + tall * 0.5], 0.3, 0.3, overalls);
    capsule(W, [-2.6, s * 0.9, 5.6], [-2.3, s * 1.1, 7.6 + tall * 0.5], 0.3, 0.3, overalls);
    ellipsoid(W, [-0.2, s * 0.9, 6.25], [0.2, 0.32, 0.32], '#ffd23f', MAT.gloss, { segs: 10, rings: 5 });
  }
  arms(W, shirt, '#ffffff', BASE.shoulderZ + tall * 0.6, { glove: 1.1 });
  // head, ears, hair, nose, moustache, eyes, cap
  ellipsoid(W, head, hr, skin, MAT.lit);
  for (const s of [-1, 1]) ellipsoid(W, add(head, [-0.2, s * hr[1] * 0.98, -0.1]), [0.5, 0.3, 0.7], skin, MAT.lit, { segs: 10, rings: 6 });
  ellipsoid(W, add(head, [-1.0, 0, -0.55]), [1.7, hr[1] * 0.98, 1.5], hair, MAT.lit, { segs: 18 });
  for (const s of [-1, 1]) ellipsoid(W, add(head, [0.1, s * hr[1] * 0.88, -0.25]), [0.8, 0.45, 0.9], hair, MAT.lit, { segs: 10, rings: 6 });
  ellipsoid(W, add(head, [hr[0] * 0.98, 0, -0.45]), [0.95, 0.85, 0.8], shadeSkin(skin), MAT.lit, { segs: 14 });
  for (const s of [-1, 1]) {
    ellipsoid(W, add(head, [hr[0] * 0.86, s * 0.75, -1.15]), [0.5, 0.85, 0.42], '#2a1608', MAT.lit, { frame: turned(s * 0.35, 0.15), segs: 12, rings: 6 });
  }
  eyes(W, head, hr, '#2a5ad8', { up: 0.1, spread: 0.32, w: 0.44, h: 0.74 });
  for (const s of [-1, 1]) onSurface(W, head, hr, [1, s * 0.33, 0.44], [0.5, 0.14, 0.12], '#2a1608', MAT.lit, 0.3);
  cap(W, head, hr, ch.hat, ch.hat);
}

function shadeSkin(hex: string): string {
  const [r, g, b] = rgb(hex);
  const m = (v: number) => Math.max(0, Math.min(255, Math.round(v * 1.04 + 4)));
  return '#' + ((m(r) << 16) | (m(g) << 8) | m(b * 0.96)).toString(16).padStart(6, '0');
}

function princess(W: MeshWriter, ch: CharacterDef) {
  const dress = ch.color, hair = ch.hat, skin = ch.skin;
  const head = BASE.head, hr: V3 = [2.3, 2.3, 2.3];
  legs(W, dress, dress);
  // dress with a puffy skirt over the seat, bodice, puffy sleeves, brooch
  ellipsoid(W, [-1.6, 0, 5.0], [2.3, 2.7, 1.6], dress, MAT.lit, { segs: 22 });
  ellipsoid(W, [-1.7, 0, 6.6], [1.35, 1.7, 1.7], dress, MAT.lit);
  ellipsoid(W, [-0.4, 0, 7.2], [0.25, 0.45, 0.45], '#3a8ae0', MAT.gloss, { segs: 10, rings: 5 });
  for (const s of [-1, 1]) ellipsoid(W, [-1.45, s * 2.0, 7.7], [0.85, 0.75, 0.75], dress, MAT.lit, { segs: 14, rings: 7 });
  arms(W, '#ffffff', '#ffffff', 7.4, { r: 0.42, width: 2.1, upper: skin });
  // head, long blonde hair, bangs, crown with jewels, earrings
  ellipsoid(W, head, hr, skin, MAT.lit);
  ellipsoid(W, add(head, [-0.75, 0, 0.35]), [2.1, 2.55, 2.5], hair, MAT.gloss, { segs: 22 });
  ellipsoid(W, add(head, [-1.9, 0, -1.6]), [1.35, 2.5, 2.7], hair, MAT.gloss, { segs: 18 });
  for (const s of [-1, 1]) {
    ellipsoid(W, add(head, [-0.6, s * 2.0, -1.4]), [0.9, 0.7, 2.1], hair, MAT.gloss, { segs: 12 });
    ellipsoid(W, add(head, [0.95, s * 1.15, 1.35]), [1.0, 1.25, 0.6], hair, MAT.gloss, { frame: turned(s * 0.5, -0.35), segs: 14, rings: 6 });
    ellipsoid(W, add(head, [0.0, s * 2.35, -1.0]), [0.25, 0.25, 0.35], '#3a8ae0', MAT.gloss, { segs: 8, rings: 5 });
  }
  lathe(W, add(head, [0.1, 0, 2.3]), [0.2, 0, 1], [[1.0, 0], [1.05, 0.6], [0.95, 1.0]], '#ffd23f', MAT.gloss, 18);
  for (let k = 0; k < 5; k++) {
    const a = (k / 5) * Math.PI * 2;
    cone(W, add(head, [0.1 + Math.cos(a) * 0.95 + 0.2, Math.sin(a) * 0.95, 3.2]), [0.15, 0, 1], 0.3, 0.75, '#ffd23f', MAT.gloss, 8);
  }
  onSurface(W, add(head, [0.1, 0, 2.6]), [1.05, 1.05, 0.5], [1, 0, 0], [0.3, 0.3, 0.2], '#e02a5a', MAT.gloss);
  eyes(W, head, hr, '#3a7ae0', { spread: 0.36, up: 0.12, w: 0.46, h: 0.78 });
  for (const s of [-1, 1]) onSurface(W, head, hr, [1, s * 0.4, 0.5], [0.42, 0.1, 0.08], '#8a6020', MAT.lit, 0.3);
  onSurface(W, head, hr, [1, 0, -0.1], [0.32, 0.3, 0.3], skin, MAT.lit, 0.3);
  onSurface(W, head, hr, [1, 0, -0.42], [0.42, 0.14, 0.12], '#e0507a', MAT.lit, 0.4);
}

function dino(W: MeshWriter, ch: CharacterDef) {
  const green = ch.color, belly = '#f4f4ec', saddle = ch.trim;
  const head: V3 = [-0.7, 0, 10.1], hr: V3 = [2.0, 2.1, 2.3];
  legs(W, green, '#f07a20', { r: 0.7 });
  ellipsoid(W, [-1.8, 0, 6.0], [1.8, 2.05, 2.1], green, MAT.lit);
  ellipsoid(W, [-0.75, 0, 5.9], [0.9, 1.5, 1.7], belly, MAT.lit);
  // saddle with white rim on the back
  ellipsoid(W, [-3.3, 0, 6.6], [0.9, 1.9, 1.3], saddle, MAT.gloss, { frame: turned(0, 0.35) });
  ellipsoid(W, [-3.25, 0, 6.6], [0.75, 2.0, 1.45], '#ffffff', MAT.lit, { frame: turned(0, 0.35), lat0: -0.25, lat1: 0.25 });
  arms(W, green, green, 7.4, { r: 0.55 });
  // head with the big round snout, nostrils, tall eyes on top, back spikes
  ellipsoid(W, head, hr, green, MAT.lit);
  ellipsoid(W, add(head, [2.0, 0, -0.55]), [2.05, 1.85, 1.45], green, MAT.lit, { segs: 22 });
  ellipsoid(W, add(head, [1.35, 0, -1.25]), [1.6, 1.6, 0.9], belly, MAT.lit, { segs: 20 });
  for (const s of [-1, 1]) onSurface(W, add(head, [2.0, 0, -0.55]), [2.05, 1.85, 1.45], [1, s * 0.3, 0.75], [0.22, 0.28, 0.16], '#1a3a10', MAT.lit, 0.5);
  for (const s of [-1, 1]) {
    const e: V3 = add(head, [0.6, s * 0.75, 2.0]);
    ellipsoid(W, e, [0.75, 0.68, 1.0], '#ffffff', MAT.eye, { segs: 16 });
    ellipsoid(W, add(e, [0.55, s * 0.05, -0.05]), [0.3, 0.32, 0.55], '#141418', MAT.eye, { segs: 12, rings: 6 });
    ellipsoid(W, add(e, [0.78, s * 0.0, 0.18]), [0.08, 0.12, 0.14], '#ffffff', MAT.glow, { segs: 8, rings: 4 });
  }
  for (let k = 0; k < 3; k++) cone(W, add(head, [-1.4 - k * 0.55, 0, 1.4 - k * 1.0]), [-1, 0, 0.8 - k * 0.4], 0.55, 1.0, '#e8402a', MAT.gloss, 10);
  for (const s of [-1, 1]) ellipsoid(W, add(head, [0.4, s * 1.9, -1.2]), [0.5, 0.25, 0.4], '#f07a90', MAT.lit, { segs: 10, rings: 5 });
}

function koopaKing(W: MeshWriter, ch: CharacterDef) {
  const skin = '#e8b830', belly = '#f4dc9a', shell = ch.trim, mane = ch.hat;
  const head: V3 = [-0.4, 0, 10.7], hr: V3 = [2.5, 2.6, 2.3];
  legs(W, skin, skin, { r: 0.85 });
  ellipsoid(W, [-1.8, 0, 6.6], [2.1, 2.6, 2.5], skin, MAT.lit);
  ellipsoid(W, [-0.4, 0, 6.3], [1.1, 1.9, 2.1], belly, MAT.lit);
  for (let k = 0; k < 4; k++) ellipsoid(W, [0.55, 0, 5.0 + k * 0.85], [0.18, 1.6 - Math.abs(k - 1.5) * 0.3, 0.12], '#c89a50', MAT.lit, { segs: 10, rings: 4 });
  // spiked shell
  const sc: V3 = [-3.7, 0, 7.2], sr: V3 = [1.6, 3.0, 3.1];
  ellipsoid(W, sc, sr, shell, MAT.gloss, { segs: 22 });
  ellipsoid(W, add(sc, [0.6, 0, 0]), [1.2, 3.25, 3.35], '#f4f0e0', MAT.lit, { segs: 22, frame: turned(0, 0), lat0: -1.5, lat1: 1.5 });
  for (const [y, z] of [[0, 1.6], [-1.6, 0.6], [1.6, 0.6], [0, -1.0], [-1.4, -1.6], [1.4, -1.6]] as [number, number][]) {
    const { p, n } = onSurface(W, sc, sr, [-1, y / 3, z / 3], [0.7, 0.7, 0.2], '#f4f0e0', MAT.lit, 0.3);
    cone(W, sub(p, mul(n, 0.1)), n, 0.5, 1.2, '#f4f0e0', MAT.gloss, 8);
  }
  arms(W, skin, skin, 8.0, { r: 0.75, width: 2.5, glove: 1.25 });
  for (const s of [-1, 1]) {
    lathe(W, [-0.2, s * 2.65, 6.8], [1, -s * 0.3, -0.9], [[0.85, -0.3], [0.9, 0], [0.85, 0.3]], '#222228', MAT.gloss, 12);
    for (let k = 0; k < 4; k++) {
      const a = (k / 4) * Math.PI * 2;
      cone(W, [-1.4 + Math.cos(a) * 0.1, s * (2.4 + 0.75) + Math.cos(a) * 0.7 * s, 7.6 + Math.sin(a) * 0.7], [0, s * Math.cos(a), Math.sin(a)], 0.22, 0.55, '#f4f0e0', MAT.gloss, 6);
    }
  }
  // head: brow, snout, horns, red mane, fangs
  ellipsoid(W, head, hr, skin, MAT.lit);
  ellipsoid(W, add(head, [1.85, 0, -0.75]), [1.6, 1.85, 1.25], belly, MAT.lit, { segs: 20 });
  for (const s of [-1, 1]) {
    onSurface(W, add(head, [1.85, 0, -0.75]), [1.6, 1.85, 1.25], [1, s * 0.35, 0.6], [0.25, 0.3, 0.2], '#3a2a10', MAT.lit, 0.5);
    cone(W, add(head, [0.5, s * 1.4, 1.7]), [-0.1, s * 0.7, 1], 0.55, 2.0, '#f4f0e0', MAT.gloss, 10);
    cone(W, add(head, [2.7, s * 0.7, -1.4]), [0.1, 0, 1], 0.18, 0.5, '#ffffff', MAT.gloss, 6);
    ellipsoid(W, add(head, [1.5, s * 0.85, 1.25]), [0.8, 0.5, 0.25], mane, MAT.lit, { frame: turned(s * 0.3, -0.25), segs: 10, rings: 5 });
  }
  eyes(W, head, hr, '#d02020', { spread: 0.33, up: 0.25, w: 0.42, h: 0.6, lids: skin });
  for (const [x, y, z, rr] of [[-0.8, 0, 2.1, 1.3], [-1.9, 0, 1.2, 1.4], [-2.4, 0, -0.2, 1.2], [-1.4, 1.2, 1.6, 0.9], [-1.4, -1.2, 1.6, 0.9], [-2.1, 1.2, 0.3, 0.9], [-2.1, -1.2, 0.3, 0.9]] as [number, number, number, number][]) {
    ellipsoid(W, add(head, [x, y, z]), [rr, rr * 0.9, rr * 0.8], mane, MAT.lit, { segs: 12, rings: 6 });
  }
}

function ape(W: MeshWriter, ch: CharacterDef) {
  const fur = ch.color, face = ch.skin, tie = ch.trim;
  const head: V3 = [-0.6, 0, 10.4], hr: V3 = [2.4, 2.5, 2.3];
  legs(W, fur, fur, { r: 0.85 });
  ellipsoid(W, [-1.9, 0, 6.6], [2.0, 2.6, 2.5], fur, MAT.lit);
  ellipsoid(W, [-0.5, 0, 6.6], [0.9, 1.8, 1.8], shadeSkin(face), MAT.lit);
  // tie with yellow letter disc
  ellipsoid(W, [0.25, 0, 7.6], [0.25, 0.65, 0.5], tie, MAT.lit, { segs: 10, rings: 5 });
  ellipsoid(W, [0.35, 0, 6.2], [0.3, 0.75, 1.5], tie, MAT.lit, { segs: 12, rings: 6 });
  arms(W, fur, face, 8.2, { r: 0.85, width: 2.55, glove: 1.35 });
  ellipsoid(W, head, hr, fur, MAT.lit);
  ellipsoid(W, add(head, [1.35, 0, -0.5]), [1.6, 2.0, 1.9], face, MAT.lit, { segs: 20 });
  ellipsoid(W, add(head, [2.1, 0, -1.05]), [1.25, 1.65, 1.05], face, MAT.lit, { segs: 18 });
  for (const s of [-1, 1]) {
    onSurface(W, add(head, [2.1, 0, -1.05]), [1.25, 1.65, 1.05], [1, s * 0.35, 0.5], [0.2, 0.32, 0.16], '#3a2010', MAT.lit, 0.5);
    ellipsoid(W, add(head, [-0.1, s * 2.5, 0.0]), [0.75, 0.35, 0.95], face, MAT.lit, { segs: 12, rings: 6 });
  }
  ellipsoid(W, add(head, [1.65, 0, 0.75]), [0.75, 2.0, 0.5], fur, MAT.lit, { segs: 16, rings: 6 });
  eyes(W, head, [hr[0] + 0.05, hr[1], hr[2]], '#3a2010', { spread: 0.3, up: 0.2, w: 0.45, h: 0.6 });
  for (let k = 0; k < 3; k++) ellipsoid(W, add(head, [0.2 - k * 0.3, (k - 1) * 0.5, 2.3]), [0.6, 0.35, 0.7], fur, MAT.lit, { frame: turned(0, -0.6), segs: 10, rings: 5 });
}

function mushroom(W: MeshWriter, ch: CharacterDef) {
  const vest = ch.color, trim = '#ffd23f', skin = ch.skin;
  const head: V3 = [-0.7, 0, 9.3], hr: V3 = [1.95, 1.95, 1.9];
  legs(W, '#ffffff', '#7a4a20', { r: 0.6 });
  ellipsoid(W, [-1.7, 0, 5.9], [1.4, 1.75, 1.75], '#ffffff', MAT.lit);
  // open vest with gold piping
  for (const s of [-1, 1]) {
    ellipsoid(W, [-1.8, s * 0.85, 6.2], [1.45, 1.0, 1.75], vest, MAT.lit, { frame: turned(0, 0), segs: 16 });
    capsule(W, [-0.45, s * 0.55, 4.8], [-0.6, s * 0.75, 7.4], 0.12, 0.12, trim);
  }
  arms(W, '#ffffff', skin, 7.2, { r: 0.45, width: 1.85 });
  ellipsoid(W, head, hr, skin, MAT.lit);
  eyes(W, head, hr, '#141418', { spread: 0.3, up: 0.05, w: 0.38, h: 0.85 });
  onSurface(W, head, hr, [1, 0, -0.5], [0.45, 0.14, 0.12], '#a02030', MAT.lit, 0.4);
  // the huge white cap with coloured spots
  const cc: V3 = add(head, [-0.15, 0, 1.55]), cr: V3 = [3.4, 3.5, 2.6];
  ellipsoid(W, cc, cr, '#ffffff', MAT.gloss, { lat0: -0.12, segs: 26, rings: 12 });
  ellipsoid(W, add(cc, [0, 0, -0.25]), [cr[0] * 0.99, cr[1] * 0.99, 0.35], '#f2ead8', MAT.lit, { segs: 26, rings: 6 });
  for (const d of [[0.2, 0, 1], [1, 0, 0.35], [-1, 0, 0.3], [0, 1, 0.3], [0, -1, 0.3], [0.6, 0.75, 0.7], [0.6, -0.75, 0.7], [-0.7, 0.7, 0.7], [-0.7, -0.7, 0.7]] as V3[]) {
    onSurface(W, cc, cr, d, [1.05, 1.05, 0.22], vest, MAT.gloss, 0.35);
  }
}

function turtle(W: MeshWriter, ch: CharacterDef) {
  const skin = ch.color, shell = ch.trim, belly = '#f4e8b8';
  const head: V3 = [-0.4, 0, 10.2], hr: V3 = [2.0, 1.95, 2.25];
  legs(W, skin, '#a05a20', { r: 0.6 });
  ellipsoid(W, [-1.7, 0, 6.0], [1.5, 1.85, 1.9], skin, MAT.lit);
  ellipsoid(W, [-0.55, 0, 6.0], [0.75, 1.5, 1.7], belly, MAT.lit);
  for (let k = 0; k < 3; k++) ellipsoid(W, [0.18, 0, 4.9 + k * 1.0], [0.1, 1.2, 0.08], '#c8b070', MAT.lit, { segs: 8, rings: 4 });
  // green shell with a white rim and plate lines
  const sc: V3 = [-3.3, 0, 6.6], sr: V3 = [1.5, 2.45, 2.55];
  ellipsoid(W, sc, sr, shell, MAT.gloss, { segs: 22 });
  ellipsoid(W, add(sc, [0.45, 0, 0]), [1.05, 2.7, 2.8], '#ffffff', MAT.lit, { segs: 22, lat0: -1.5, lat1: 1.5 });
  for (const d of [[-1, 0, 0.6], [-1, 0.7, -0.1], [-1, -0.7, -0.1], [-1, 0, -0.8]] as V3[]) onSurface(W, sc, sr, d, [0.85, 0.85, 0.15], shadeShell(shell), MAT.gloss, 0.3);
  arms(W, skin, '#ffffff', 7.3, { r: 0.48, width: 1.95 });
  // head with the rounded beak, big eyes
  ellipsoid(W, head, hr, skin, MAT.lit);
  ellipsoid(W, add(head, [1.45, 0, -0.75]), [1.3, 1.35, 1.0], skin, MAT.lit, { segs: 18 });
  for (const s of [-1, 1]) onSurface(W, add(head, [1.45, 0, -0.75]), [1.3, 1.35, 1.0], [1, s * 0.25, 0.35], [0.12, 0.16, 0.1], '#3a3010', MAT.lit, 0.5);
  for (const s of [-1, 1]) {
    const e: V3 = add(head, [1.45, s * 0.72, 0.85]);
    ellipsoid(W, e, [0.75, 0.7, 1.1], '#ffffff', MAT.eye, { segs: 16 });
    ellipsoid(W, add(e, [0.55, -s * 0.05, -0.05]), [0.3, 0.3, 0.6], '#141418', MAT.eye, { segs: 12, rings: 6 });
    ellipsoid(W, add(e, [0.8, 0, 0.2]), [0.07, 0.12, 0.14], '#ffffff', MAT.glow, { segs: 8, rings: 4 });
  }
}

function shadeShell(hex: string): string {
  const [r, g, b] = rgb(hex);
  return '#' + ((Math.round(r * 0.75) << 16) | (Math.round(g * 0.75) << 8) | Math.round(b * 0.75)).toString(16).padStart(6, '0');
}

/** the driver model for a character (colours baked in, so each character is its own GPU model) */
export function buildDriver(W: MeshWriter, ch: CharacterDef) {
  switch (ch.id) {
    case 'dario': return plumber(W, ch, 0);
    case 'luigio': return plumber(W, ch, 0.6);
    case 'pearl': return princess(W, ch);
    case 'yoshio': return dino(W, ch);
    case 'bowzer': return koopaKing(W, ch);
    case 'donkeyjr': return ape(W, ch);
    case 'toadie': return mushroom(W, ch);
    case 'koopo': return turtle(W, ch);
  }
}
