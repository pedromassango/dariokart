import type { Draw } from '../rive/draw';
import { argb } from '../rive/draw';
import type { RiveAssets } from '../rive/assets';
import type { Race } from '../game/race';
import type { Kart } from '../game/kart';
import type { Viewport } from '../game/projector';
import { RAINBOW_COLORS } from '../game/tracks';
import { SAMPLE_SPACING } from '../game/track';
import { Cam, View, NEAR, projectPoly, out2d } from './view';
import { buildScene, type Scene3D, type Face } from './scene';
import { wrapAngle } from '../game/util';

/*
 * The Dariokart world renderer. Everything on screen is drawn through the Rive runtime:
 * polygons are Rive RenderPaths filled with Rive RenderPaints, and karts, props, items, clouds,
 * signs, banners and the crowd are Rive artboards (state machines running) placed in 3D.
 */

const sceneCache = new WeakMap<object, Scene3D>();
const view = new View();
const scratch = new Float32Array(64);

function hexRgb(hex: string): [number, number, number] {
  const v = parseInt(hex.slice(1), 16);
  return [(v >> 16) & 255, (v >> 8) & 255, v & 255];
}
function pack(r: number, g: number, b: number, a = 1): number {
  return (((Math.round(a * 255) & 255) << 24) >>> 0) + ((Math.max(0, Math.min(255, r | 0)) << 16) | (Math.max(0, Math.min(255, g | 0)) << 8) | Math.max(0, Math.min(255, b | 0)));
}

// sun light (normalized), from the upper left of the course
const LX = -0.38, LY = -0.48, LZ = 0.79;

interface Drawable { depth: number; draw: () => void }
const list: Drawable[] = [];

// ---------------------------------------------------------------- particles (visual only)
interface Spark { x: number; y: number; z: number; vx: number; vy: number; vz: number; life: number; max: number; color: number; size: number; grow: number }
const sparks: Spark[] = [];
function spark(s: Omit<Spark, 'max'>) { if (sparks.length < 500) sparks.push({ ...s, max: s.life }); }

export function updateEffects(race: Race, dt: number) {
  for (const k of race.karts) {
    const cx = Math.cos(k.heading), cy = Math.sin(k.heading), rx = -cy, ry = cx;
    const bx = k.x - cx * 7, by = k.y - cy * 7;
    if (k.drift !== 0 && k.z <= 0 && Math.random() < dt * 50) {
      const col = k.driftCharge > 1.0 ? (Math.random() < 0.5 ? '#ff7a20' : '#ffd040') : k.driftCharge > 0.5 ? '#50b8ff' : '#ffffff';
      for (const s of [-1, 1]) spark({ x: bx + rx * 4 * s, y: by + ry * 4 * s, z: 0.6, vx: -rx * k.drift * 25 + (Math.random() - 0.5) * 15, vy: -ry * k.drift * 25 + (Math.random() - 0.5) * 15, vz: 18 + Math.random() * 18, life: 0.32, color: argb(col), size: 0.9, grow: 0 });
    }
    if (k.surface === 'offroad' && Math.abs(k.speed) > 30 && k.z <= 0 && Math.random() < dt * 28) {
      spark({ x: bx, y: by, z: 1, vx: (Math.random() - 0.5) * 18, vy: (Math.random() - 0.5) * 18, vz: 10, life: 0.55, color: argb(race.track.def.theme.bandSpeck[1], 0.85), size: 1.6, grow: 4 });
    }
    if (k.boostTimer > 0 && Math.random() < dt * 40) spark({ x: bx, y: by, z: 3, vx: -cx * 30, vy: -cy * 30, vz: 6, life: 0.25, color: argb('#ffb050', 0.9), size: 1.3, grow: 3 });
    if (k.starTimer > 0 && Math.random() < dt * 40) spark({ x: k.x + (Math.random() - 0.5) * 10, y: k.y + (Math.random() - 0.5) * 10, z: 4 + Math.random() * 10, vx: 0, vy: 0, vz: 14, life: 0.4, color: argb(['#ffff60', '#ffffff', '#60ffff'][Math.floor(Math.random() * 3)]), size: 0.9, grow: 0 });
    if (k.spinTimer > 0 && Math.random() < dt * 25) spark({ x: k.x, y: k.y, z: 8, vx: (Math.random() - 0.5) * 40, vy: (Math.random() - 0.5) * 40, vz: 28, life: 0.5, color: argb('#ffffff'), size: 1.1, grow: 1 });
  }
  for (let i = sparks.length - 1; i >= 0; i--) {
    const p = sparks[i];
    p.life -= dt;
    if (p.life <= 0) { sparks.splice(i, 1); continue; }
    p.vz -= 60 * dt;
    p.x += p.vx * dt; p.y += p.vy * dt; p.z = Math.max(0.3, p.z + p.vz * dt);
    p.size += p.grow * dt;
  }
}
export function clearEffects() { sparks.length = 0; }

// ---------------------------------------------------------------- ground helpers
/** projects and batches a ground (z = 0) quad */
function gquad(d: Draw, color: number, x0: number, y0: number, x1: number, y1: number, x2: number, y2: number, x3: number, y3: number, z = 0) {
  scratch[0] = x0; scratch[1] = y0; scratch[2] = z;
  scratch[3] = x1; scratch[4] = y1; scratch[5] = z;
  scratch[6] = x2; scratch[7] = y2; scratch[8] = z;
  scratch[9] = x3; scratch[10] = y3; scratch[11] = z;
  const m = projectPoly(view, scratch, 4);
  if (m >= 3) d.batchPoly(color, out2d, m * 2);
}

function speck(d: Draw, color: number, x: number, y: number, h: number) {
  if (!view.project(x, y, 0.05)) return;
  if (view.sx < -6 || view.sx > view.w + 6) return;
  const w = Math.max(1, h * 2 * view.scale);
  const hh = Math.max(1, w * Math.max(0.25, Math.sin(Math.atan2(view.pz, view.depth))));
  d.batchRect(color, view.sx - w / 2, view.sy - hh / 2, w, hh);
}

function hash2(a: number, b: number): number {
  let h = Math.imul(a, 374761393) + Math.imul(b, 668265263);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

function visibleSample(race: Race, i: number, margin: number, far: number) {
  const tr = race.track;
  view.toCam(tr.x[i], tr.y[i], 0);
  if (view.oz < -margin || view.oz > far) return false;
  return Math.abs(view.ox) <= Math.max(view.oz, 0) * (view.cx / view.focal) * 1.3 + margin;
}

function drawGround(d: Draw, race: Race, time: number, focus: Kart | null) {
  const tr = race.track, th = tr.def.theme;
  const n = tr.n, hw = tr.halfW, cw = th.curbWidth;
  const fall = th.edge === 'fall';
  const bandW = fall ? th.offroadWidth : 46;
  const far = th.fogFar;
  const hy = view.horizonY();

  // base ground below the horizon
  d.rect(0, Math.max(0, hy), view.w, view.h - Math.max(0, hy), argb(th.ground));

  // ground speckle texture near the camera (grass / sand / water / lava / snow)
  const g0 = argb(th.groundSpeck[0]), g1 = argb(th.groundSpeck[1]);
  const anim = th.groundAnim ? time * (th.groundAnim === 'water' ? 6 : 2.5) : 0;
  for (const [f0, f1, C, size] of [[0, 140, 6, 0.8], [140, 380, 16, 1.8]] as [number, number, number, number][]) {
    const midF = (f0 + f1) / 2;
    const ccx = view.px + view.fx / Math.hypot(view.fx, view.fy) * midF, ccy = view.py + view.fy / Math.hypot(view.fx, view.fy) * midF;
    const R = Math.hypot((f1 - f0) / 2, f1 * 0.95);
    const x0 = Math.floor((ccx - R) / C), x1 = Math.floor((ccx + R) / C);
    const y0 = Math.floor((ccy - R) / C), y1 = Math.floor((ccy + R) / C);
    for (let gy = y0; gy <= y1; gy++) for (let gx = x0; gx <= x1; gx++) {
      const h = hash2(gx * (C === 6 ? 1 : 7), gy * (C === 6 ? 1 : 13));
      if (h > 0.4) continue;
      const x = (gx + hash2(gy, gx)) * C + Math.sin(anim + gy) * (anim ? 2 : 0), y = (gy + hash2(gx + 9, gy + 3)) * C;
      view.toCam(x, y, 0);
      if (view.oz < f0 || view.oz > f1) continue;
      speck(d, h < 0.2 ? g0 : g1, x, y, size);
    }
  }
  d.flushBatches([g0, g1]);

  // lakes / ponds
  for (const l of tr.def.lakes ?? []) {
    const pts: number[] = [];
    for (const [x, y] of l.points) pts.push(x, y, 0.02);
    const m = projectPoly(view, pts, l.points.length);
    if (m >= 3) {
      d.poly(out2d.subarray(0, m * 2), argb(l.color));
    }
  }

  const vis = new Uint8Array(n);
  for (let i = 0; i < n; i++) vis[i] = visibleSample(race, i, hw + bandW + 40, far) ? 1 : 0;

  // shoulders
  const band = argb(th.band);
  if (bandW > 0) {
    const a = hw + cw + bandW;
    for (let i = 0; i < n; i++) {
      if (!vis[i]) continue;
      const j = (i + 1) % n;
      gquad(d, band, tr.x[i] - tr.nx[i] * a, tr.y[i] - tr.ny[i] * a, tr.x[j] - tr.nx[j] * a + tr.tx[j], tr.y[j] - tr.ny[j] * a + tr.ty[j], tr.x[j] + tr.nx[j] * a + tr.tx[j], tr.y[j] + tr.ny[j] * a + tr.ty[j], tr.x[i] + tr.nx[i] * a, tr.y[i] + tr.ny[i] * a, 0.01);
    }
    d.flushBatches([band]);
    const b0 = argb(th.bandSpeck[0]), b1 = argb(th.bandSpeck[1]);
    for (let i = 0; i < n; i++) {
      if (!vis[i]) continue;
      view.toCam(tr.x[i], tr.y[i], 0);
      if (view.oz > 260) continue;
      const cnt = view.oz < 110 ? 8 : 3;
      for (let k = 0; k < cnt; k++) {
        const side = k & 1 ? 1 : -1;
        const lat = side * (hw + cw + 1.5 + hash2(i, k) * (bandW - 3));
        const al = hash2(k + 31, i) * SAMPLE_SPACING;
        speck(d, hash2(i, k + 7) < 0.5 ? b0 : b1, tr.x[i] + tr.nx[i] * lat + tr.tx[i] * al, tr.y[i] + tr.ny[i] * lat + tr.ty[i] * al, view.oz < 110 ? 0.7 : 1.5);
      }
    }
    d.flushBatches([b0, b1]);
  }

  // road surface
  const road = argb(th.road), road2 = argb(shadeRgb(th.road, -0.07));
  const rainbow = RAINBOW_COLORS.map((c) => argb(c));
  const order: number[] = th.roadStyle === 'rainbow' ? rainbow : [road, road2];
  const ex = 0.7;
  for (let i = 0; i < n; i++) {
    if (!vis[i]) continue;
    const j = (i + 1) % n;
    const col = th.roadStyle === 'rainbow' ? rainbow[Math.floor(i / 2) % rainbow.length]
      : th.roadStyle === 'planks' || th.roadStyle === 'ice' ? ((i & 1) ? road2 : road)
        : (Math.floor(i / 4) & 1) ? road2 : road;
    gquad(d, col, tr.x[i] - tr.nx[i] * hw, tr.y[i] - tr.ny[i] * hw, tr.x[j] - tr.nx[j] * hw + tr.tx[j] * ex, tr.y[j] - tr.ny[j] * hw + tr.ty[j] * ex, tr.x[j] + tr.nx[j] * hw + tr.tx[j] * ex, tr.y[j] + tr.ny[j] * hw + tr.ty[j] * ex, tr.x[i] + tr.nx[i] * hw, tr.y[i] + tr.ny[i] * hw, 0.02);
  }
  d.flushBatches(order);

  // road texture
  const rs0 = argb(th.roadSpeck[0]), rs1 = argb(th.roadSpeck[1]);
  const mortar = argb(shadeRgb(th.road, -0.32));
  if (th.roadStyle !== 'rainbow') {
    for (let i = 0; i < n; i++) {
      if (!vis[i]) continue;
      view.toCam(tr.x[i], tr.y[i], 0);
      if (view.oz > 300) continue;
      const cnt = view.oz < 110 ? 10 : 4;
      for (let k = 0; k < cnt; k++) {
        const lat = (hash2(i, k) * 2 - 1) * (hw - 2);
        const al = hash2(k + 17, i) * SAMPLE_SPACING;
        speck(d, hash2(i, k + 3) < 0.5 ? rs0 : rs1, tr.x[i] + tr.nx[i] * lat + tr.tx[i] * al, tr.y[i] + tr.ny[i] * lat + tr.ty[i] * al, view.oz < 110 ? 0.6 : 1.3);
      }
    }
  }
  if (th.roadStyle === 'bricks' || th.roadStyle === 'planks') {
    for (let i = 0; i < n; i++) {
      if (!vis[i]) continue;
      view.toCam(tr.x[i], tr.y[i], 0);
      if (view.oz > 600) continue;
      const tx = tr.tx[i], ty = tr.ty[i], nx = tr.nx[i], ny = tr.ny[i], x = tr.x[i], y = tr.y[i];
      const w = th.roadStyle === 'planks' ? 1.0 : 0.7;
      gquad(d, mortar, x - nx * hw, y - ny * hw, x - nx * hw + tx * w, y - ny * hw + ty * w, x + nx * hw + tx * w, y + ny * hw + ty * w, x + nx * hw, y + ny * hw, 0.03);
      if (th.roadStyle === 'bricks') {
        const off = (i & 1) ? 0 : 6;
        for (let l = -hw + off; l < hw; l += 12) gquad(d, mortar, x + nx * l, y + ny * l, x + nx * (l + 0.7), y + ny * (l + 0.7), x + nx * (l + 0.7) + tx * SAMPLE_SPACING, y + ny * (l + 0.7) + ty * SAMPLE_SPACING, x + nx * l + tx * SAMPLE_SPACING, y + ny * l + ty * SAMPLE_SPACING, 0.03);
      }
    }
  }
  // mud puddles
  const mud = argb(shadeRgb(th.road, -0.35));
  for (const p of tr.puddles) {
    const pts: number[] = [];
    for (let a = 0; a < 10; a++) { const t = (a / 10) * Math.PI * 2; pts.push(p.x + Math.cos(t) * p.r * (1 + 0.15 * Math.sin(t * 3)), p.y + Math.sin(t) * p.r, 0.04); }
    const m = projectPoly(view, pts, 10);
    if (m >= 3) d.batchPoly(mud, out2d, m * 2);
  }
  d.flushBatches([rs0, rs1, mortar, mud]);

  // painted lines: MK8-style solid edge lines + centre dashes
  const line = th.edgeLine ? argb(th.edgeLine) : 0;
  if (th.edgeLine) {
    for (let i = 0; i < n; i++) {
      if (!vis[i]) continue;
      const j = (i + 1) % n;
      for (const s of [-1, 1]) {
        const a = (hw - 1.4) * s, b = (hw - 3.2) * s;
        gquad(d, line, tr.x[i] + tr.nx[i] * a, tr.y[i] + tr.ny[i] * a, tr.x[j] + tr.nx[j] * a + tr.tx[j] * ex, tr.y[j] + tr.ny[j] * a + tr.ty[j] * ex, tr.x[j] + tr.nx[j] * b + tr.tx[j] * ex, tr.y[j] + tr.ny[j] * b + tr.ty[j] * ex, tr.x[i] + tr.nx[i] * b, tr.y[i] + tr.ny[i] * b, 0.05);
      }
      if (th.centerDashes && (i % 6) < 3) {
        gquad(d, line, tr.x[i] - tr.nx[i] * 0.8, tr.y[i] - tr.ny[i] * 0.8, tr.x[j] - tr.nx[j] * 0.8, tr.y[j] - tr.ny[j] * 0.8, tr.x[j] + tr.nx[j] * 0.8, tr.y[j] + tr.ny[j] * 0.8, tr.x[i] + tr.nx[i] * 0.8, tr.y[i] + tr.ny[i] * 0.8, 0.05);
      }
    }
    d.flushBatches([line]);
  }

  // curbs
  const curbCols = th.curbColors.map((c) => argb(c));
  for (let i = 0; i < n; i++) {
    if (!vis[i]) continue;
    const j = (i + 1) % n;
    const cc = curbCols[Math.floor(i / 1) % curbCols.length];
    const o = hw + cw;
    gquad(d, cc, tr.x[i] - tr.nx[i] * hw, tr.y[i] - tr.ny[i] * hw, tr.x[j] - tr.nx[j] * hw + tr.tx[j] * ex, tr.y[j] - tr.ny[j] * hw + tr.ty[j] * ex, tr.x[j] - tr.nx[j] * o + tr.tx[j] * ex, tr.y[j] - tr.ny[j] * o + tr.ty[j] * ex, tr.x[i] - tr.nx[i] * o, tr.y[i] - tr.ny[i] * o, 0.06);
    gquad(d, cc, tr.x[i] + tr.nx[i] * hw, tr.y[i] + tr.ny[i] * hw, tr.x[j] + tr.nx[j] * hw + tr.tx[j] * ex, tr.y[j] + tr.ny[j] * hw + tr.ty[j] * ex, tr.x[j] + tr.nx[j] * o + tr.tx[j] * ex, tr.y[j] + tr.ny[j] * o + tr.ty[j] * ex, tr.x[i] + tr.nx[i] * o, tr.y[i] + tr.ny[i] * o, 0.06);
  }
  d.flushBatches(curbCols);

  // start line checkerboard
  {
    const cols = 14, rows = 2, sz = (hw * 2) / cols;
    const black = argb(th.startB), white = argb(th.startA);
    const bx = tr.x[0], by = tr.y[0], tx = tr.tx[0], ty = tr.ty[0], nx = tr.nx[0], ny = tr.ny[0];
    for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
      const col = (r + c) & 1 ? black : white;
      const l0 = -hw + c * sz, l1 = l0 + sz, t0 = r * sz - sz, t1 = t0 + sz;
      gquad(d, col, bx + tx * t0 + nx * l0, by + ty * t0 + ny * l0, bx + tx * t0 + nx * l1, by + ty * t0 + ny * l1, bx + tx * t1 + nx * l1, by + ty * t1 + ny * l1, bx + tx * t1 + nx * l0, by + ty * t1 + ny * l0, 0.07);
    }
    for (let s = 0; s < 8; s++) {
      const g = tr.gridSlot(s);
      const gx = -Math.sin(g.heading), gy = Math.cos(g.heading), hx = Math.cos(g.heading), hy2 = Math.sin(g.heading);
      const fx = g.x + hx * 8, fy = g.y + hy2 * 8;
      gquad(d, white, fx - gx * 7, fy - gy * 7, fx + gx * 7, fy + gy * 7, fx + gx * 7 - hx * 1.4, fy + gy * 7 - hy2 * 1.4, fx - gx * 7 - hx * 1.4, fy - gy * 7 - hy2 * 1.4, 0.07);
    }
    d.flushBatches([white, black]);
  }

  // dash (boost) panels
  const dA = argb('#ffd020'), dB = argb('#ff6010');
  const pulse = Math.floor(time * 8) % 3;
  for (const p of tr.dashPanels) {
    const tx = p.dirX, ty = p.dirY, nx = -ty, ny = tx;
    gquad(d, argb('#30302c'), p.x - tx * 10 - nx * 11, p.y - ty * 10 - ny * 11, p.x + tx * 10 - nx * 11, p.y + ty * 10 - ny * 11, p.x + tx * 10 + nx * 11, p.y + ty * 10 + ny * 11, p.x - tx * 10 + nx * 11, p.y - ty * 10 + ny * 11, 0.08);
    d.flushBatches([argb('#30302c')]);
    for (let k = 0; k < 3; k++) {
      const col = k === pulse ? dA : dB;
      const o = (k - 1) * 6, bx = p.x + tx * o, by = p.y + ty * o;
      gquad(d, col, bx - nx * 9 - tx * 3, by - ny * 9 - ty * 3, bx + tx * 2, by + ty * 2, bx + tx * 5, by + ty * 5, bx - nx * 9, by - ny * 9, 0.09);
      gquad(d, col, bx + nx * 9 - tx * 3, by + ny * 9 - ty * 3, bx + tx * 2, by + ty * 2, bx + tx * 5, by + ty * 5, bx + nx * 9, by + ny * 9, 0.09);
    }
  }
  d.flushBatches([dB, dA]);

  // soft ground shadows under karts / boxes
  const sh = argb('#000000', 0.28);
  const shadow = (x: number, y: number, rx: number, ry: number, h: number) => {
    const pts: number[] = [];
    const c = Math.cos(h), s = Math.sin(h);
    for (let a = 0; a < 10; a++) { const t = (a / 10) * Math.PI * 2; const lx = Math.cos(t) * rx, ly = Math.sin(t) * ry; pts.push(x + lx * c - ly * s, y + lx * s + ly * c, 0.1); }
    const m = projectPoly(view, pts, 10);
    if (m >= 3) d.batchPoly(sh, out2d, m * 2);
  };
  let fd = 0;
  if (focus) { view.toCam(focus.x, focus.y, 0); fd = view.oz; }
  for (const k of race.karts) {
    if (k.fallTimer > 0) continue;
    view.toCam(k.x, k.y, 0);
    // same rule as the sprites: karts hidden near the lens cast no (huge) shadow either
    if (k !== focus && (view.oz < 20 || (focus && view.oz < fd - 2))) continue;
    shadow(k.x, k.y, 8 * k.scale, 5.5 * k.scale, k.heading);
  }
  tr.itemBoxes.forEach((b, i) => { if (race.boxVisible(i)) shadow(b.x, b.y, 4.5, 4.5, 0); });
  d.flushBatches([sh]);
}

function shadeRgb(hex: string, f: number): string {
  const [r, g, b] = hexRgb(hex);
  const t = f >= 0 ? 255 : 0, k = Math.abs(f);
  const m = (c: number) => Math.round(c + (t - c) * k);
  return '#' + ((m(r) << 16) | (m(g) << 8) | m(b)).toString(16).padStart(6, '0');
}

// ---------------------------------------------------------------- sky
function drawSky(d: Draw, assets: RiveAssets, race: Race, scene: Scene3D, time: number) {
  const th = race.track.def.theme;
  const hy = view.horizonY();
  d.gradientRect(0, 0, view.w, Math.max(1, hy + 2), [[0, argb(th.skyTop)], [1, argb(th.skyHorizon)]]);
  const id = race.track.def.id;
  if (id === 'rainbow' || id === 'ghost') {
    // star field fixed to the heading
    const yaw = Math.atan2(view.fy, view.fx);
    for (let i = 0; i < 140; i++) {
      const u = hash2(i, 7), v = hash2(i, 11);
      let x = ((u * Math.PI * 2 - yaw) / (Math.PI * 2)) * view.w * 3;
      x = ((x % (view.w * 3)) + view.w * 3) % (view.w * 3);
      if (x > view.w) continue;
      const tw = 0.4 + 0.6 * Math.abs(Math.sin(time * 2 + i));
      d.rect(x, v * hy * 0.95, i % 9 === 0 ? 2.5 : 1.5, i % 9 === 0 ? 2.5 : 1.5, argb('#ffffff', id === 'ghost' ? tw * 0.5 : tw));
    }
  }
  if (id === 'ghost' || id === 'rainbow') {
    // moon / planet
    if (view.project(view.px + 4000, view.py - 3000, 1500)) d.circle(view.sx, view.sy, id === 'ghost' ? 34 : 60, argb(id === 'ghost' ? '#fff4c8' : '#b060ff'));
    if (id === 'rainbow' && view.project(view.px + 4000, view.py - 3000, 1500)) d.ellipse(view.sx, view.sy, 100, 14, argb('#ffd060', 0.85));
  }
  // clouds (Rive) — far away, drawn behind everything
  for (const c of scene.clouds) {
    if (!view.project(c.x, c.y, c.z)) continue;
    const w = c.w * view.scale;
    if (view.sx < -w || view.sx > view.w + w) continue;
    assets.draw(d, 'cloud', 'Cloud', view.sx, view.sy, w, { anchorY: 0.5 });
  }
}

// ---------------------------------------------------------------- solids
function addFaces(d: Draw, scene: Scene3D, fogRgb: [number, number, number], fogNear: number, fogFar: number) {
  for (const f of scene.faces) {
    view.toCam(f.cx, f.cy, f.cz);
    const depth = view.oz;
    if (depth + f.rad < NEAR || depth - f.rad > fogFar) continue;
    // camera too close to (or inside) a wall/prop: skip it instead of filling the screen
    if (depth - f.rad < 7 && Math.hypot(view.px - f.cx, view.py - f.cy, view.pz - f.cz) < f.rad + 9) continue;
    // frustum (horizontal) cull
    if (Math.abs(view.ox) - f.rad > Math.max(depth, NEAR) * (view.cx / view.focal) * 1.15) continue;
    // back-face cull
    const vx = view.px - f.cx, vy = view.py - f.cy, vz = view.pz - f.cz;
    const facing = vx * f.nx + vy * f.ny + vz * f.nz;
    if (!f.twoSided && facing < 0) continue;
    list.push({ depth, draw: () => drawFace(d, f, depth, fogRgb, fogNear, fogFar, facing < 0) });
  }
}

function drawFace(d: Draw, f: Face, depth: number, fog: [number, number, number], fogNear: number, fogFar: number, flipped: boolean) {
  const m = projectPoly(view, f.pts, f.n);
  if (m < 3) return;
  let k = 1;
  if (!f.glow) {
    const nx = flipped ? -f.nx : f.nx, ny = flipped ? -f.ny : f.ny, nz = flipped ? -f.nz : f.nz;
    const dot = nx * LX + ny * LY + nz * LZ;
    k = 0.68 + 0.42 * Math.max(0, dot);
  }
  const t = Math.max(0, Math.min(1, (depth - fogNear) / (fogFar - fogNear)));
  const r = f.r * k * (1 - t) + fog[0] * t, g = f.g * k * (1 - t) + fog[1] * t, b = f.b * k * (1 - t) + fog[2] * t;
  d.poly(out2d.subarray(0, m * 2), pack(r, g, b));
}

// ---------------------------------------------------------------- sprites
function sprite(d: Draw, assets: RiveAssets, key: string, artboard: string, x: number, y: number, z: number, worldW: number, anchor: number, opts: { inputs?: Record<string, number | boolean>; flipX?: boolean; height?: number } = {}) {
  if (!view.project(x, y, z)) return false;
  const w = worldW * view.scale;
  if (w < 1.2 || view.sx < -w * 2 || view.sx > view.w + w * 2) return true;
  return assets.draw(d, key, artboard, view.sx, view.sy, w, { anchorY: anchor, inputs: opts.inputs, flipX: opts.flipX, height: opts.height ? opts.height * view.scale : undefined });
}

function drawKart(d: Draw, assets: RiveAssets, k: Kart, time: number) {
  if (k.invulnTimer > 0 && Math.floor(time * 20) % 2 === 0) return;
  if (k.starTimer > 0 && Math.floor(time * 24) % 3 === 0) return;
  const facing = k.heading + k.spinAngle + k.drift * 0.35;
  const toCam = Math.atan2(view.py - k.y, view.px - k.x);
  const rel = wrapAngle(facing - toCam);
  const v = Math.round((Math.PI - Math.abs(rel)) / (Math.PI / 4));
  const flipX = v !== 0 && v !== 4 && rel > 0;
  const size = 16 * k.scale;
  sprite(d, assets, 'kart_' + k.id, 'Kart_' + k.char.id, k.x, k.y, k.z, size, 92 / 96, {
    flipX, height: k.squishTimer > 0 ? size * 0.35 : undefined,
    inputs: { view: v, steer: v === 0 ? Math.max(-1, Math.min(1, k.steerVis)) : 0, boost: k.boostTimer > 0 || k.starTimer > 0 },
  });
}

/** Rive artboard mapped onto a 3D rectangle (affine; accurate for small/medium on-screen quads) */
function drawArt(d: Draw, assets: RiveAssets, a: Scene3D['art'][number]) {
  // facing test: only the front side shows art
  if ((view.px - a.cx) * a.nx + (view.py - a.cy) * a.ny < 0) return;
  const [l, r, b] = a.mirror ? [a.tr, a.tl, [a.tr[0] + (a.bl[0] - a.tl[0]), a.tr[1] + (a.bl[1] - a.tl[1]), a.bl[2]] as [number, number, number]] : [a.tl, a.tr, a.bl];
  if (!view.project(l[0], l[1], l[2])) return; const x0 = view.sx, y0 = view.sy;
  if (!view.project(r[0], r[1], r[2])) return; const x1 = view.sx, y1 = view.sy;
  if (!view.project(b[0], b[1], b[2])) return; const x2 = view.sx, y2 = view.sy;
  if (a.inputs) assets.setInputs(a.key, a.artboard, a.inputs);
  assets.drawAffine(d, a.key, a.artboard, x0, y0, x1, y1, x2, y2);
}

export interface RenderOpts { focus: Kart | null; time: number; nameTags: boolean }

/** Renders one player's view of the race, entirely with Rive. */
export function renderWorld(d: Draw, assets: RiveAssets, race: Race, cam: Cam, vp: Viewport, opts: RenderOpts) {
  let scene = sceneCache.get(race.track);
  if (!scene) { scene = buildScene(race.track); sceneCache.set(race.track, scene); }
  const th = race.track.def.theme;
  const time = opts.time;
  view.setup(cam, vp.w, vp.h);
  d.save();
  d.translate(vp.x, vp.y);
  d.clipRect(0, 0, vp.w, vp.h);

  drawSky(d, assets, race, scene, time);
  drawGround(d, race, time, opts.focus);

  // horizon haze (aerial perspective for far ground)
  const hy = view.horizonY();
  const fogC = hexRgb(th.fog);
  d.gradientRect(0, hy - 2, vp.w, Math.max(4, vp.h * 0.08), [[0, pack(fogC[0], fogC[1], fogC[2], 0.9)], [1, pack(fogC[0], fogC[1], fogC[2], 0)]]);

  list.length = 0;
  addFaces(d, scene, fogC, th.fogNear, th.fogFar);

  const tr = race.track;
  const pushAt = (x: number, y: number, z: number, fn: () => void, maxD = th.fogFar, minD = 9) => {
    view.toCam(x, y, z);
    if (view.oz < minD || view.oz > maxD) return; // nothing pops up right in front of the lens
    if (Math.abs(view.ox) > view.oz * (view.cx / view.focal) * 1.3 + 40) return;
    list.push({ depth: view.oz, draw: fn });
  };
  for (const a of scene.art) pushAt(a.cx, a.cy, a.cz, () => drawArt(d, assets, a));
  for (const p of scene.props) {
    const z = p.z + (p.bob !== undefined ? Math.sin(time * 1.6 + p.bob) * 2.5 : 0);
    pushAt(p.x, p.y, z, () => sprite(d, assets, 'prop_' + p.kind, p.artboard, p.x, p.y, z, p.height * p.aspect, p.anchor), 1300);
  }
  tr.obstacles.forEach((o, i) => {
    if (o.kind === 'thwomp') {
      const lift = Math.max(0, Math.sin(time * 1.3 + i * 2)) * 12;
      pushAt(o.x, o.y, lift, () => sprite(d, assets, 'thwomp' + i, 'Thwomp', o.x, o.y, lift, 20, 0.98, { inputs: { slam: lift < 3 } }));
    } else if (o.kind === 'iceblock') {
      pushAt(o.x, o.y, 0, () => sprite(d, assets, 'iceblock', 'IceBlock', o.x, o.y, 0, o.r * 2.3, 0.97));
    } else if (o.kind === 'piranha') {
      pushAt(o.x, o.y, 0, () => sprite(d, assets, 'piranha', 'Piranha', o.x, o.y, 0, 13, 0.98));
    }
  });
  tr.itemBoxes.forEach((b, i) => {
    if (!race.boxVisible(i)) return;
    const z = 5 + Math.sin(time * 2.5 + i) * 0.9;
    pushAt(b.x, b.y, z, () => sprite(d, assets, 'itembox', 'ItemBox', b.x, b.y, z, 10, 0.5), 900);
  });
  tr.coins.forEach((c, i) => {
    if (!race.coinVisible(i)) return;
    pushAt(c.x, c.y, 0, () => sprite(d, assets, 'coin', 'Item_coin', c.x, c.y, 0.5, 7, 0.95), 700);
  });
  for (const e of race.items) {
    const name = e.type === 'banana' ? 'Item_banana' : e.type === 'greenShell' ? 'Item_greenShell' : 'Item_redShell';
    pushAt(e.x, e.y, e.z, () => sprite(d, assets, 'trk_' + e.type, name, e.x, e.y, e.z, 9, 0.95));
  }
  let focusDepth = 0;
  if (opts.focus) { view.toCam(opts.focus.x, opts.focus.y, 0); focusDepth = view.oz; }
  for (const k of race.karts) {
    view.toCam(k.x, k.y, 0);
    // karts squeezed between the camera and your kart would cover the screen
    if (k !== opts.focus && (view.oz < 20 || (opts.focus && view.oz < focusDepth - 2))) continue;
    pushAt(k.x, k.y, k.z, () => drawKart(d, assets, k, time), 1500, NEAR);
    if (k.fallTimer > 0 && k.fallTimer < 1.3) pushAt(k.x, k.y, 16 + k.z, () => sprite(d, assets, 'ref_rescue_' + k.id, 'Referee', k.x, k.y, 6 + k.z, 26, 1));
  }
  for (const p of sparks) {
    pushAt(p.x, p.y, p.z, () => {
      if (!view.project(p.x, p.y, p.z)) return;
      const r = Math.max(1, p.size * view.scale);
      d.circle(view.sx, view.sy, r, p.color);
    }, 600);
  }

  list.sort((a, b) => b.depth - a.depth);
  for (const it of list) it.draw();
  d.restore();
}

/** chase camera that follows a kart (MK8-style: low, behind, slight look-down) */
export class ChaseCam extends Cam {
  private heading = 0;
  private init = false;
  private hx = 0; private hy = 0; private hz = 0;
  boost = 0;

  follow(k: Kart, dt: number, intro: number | null) {
    const target = k.heading + (k.drift !== 0 ? k.drift * 0.2 : 0);
    if (!this.init) { this.heading = target; this.init = true; }
    else this.heading = wrapAngle(this.heading + wrapAngle(target - this.heading) * Math.min(1, dt * 6));
    let h = this.heading, dist = 36 - this.boost * 4, height = 13, pitch = 0.2;
    if (intro !== null) {
      const e = 1 - Math.pow(1 - Math.min(1, intro), 3);
      h = this.heading + Math.PI * (1 - e) * 1.15;
      dist = 36 + 55 * (1 - e);
      height = 13 + 26 * (1 - e);
      pitch = 0.2 + 0.16 * (1 - e);
    }
    const kz = Math.max(-25, k.z);
    const wx = k.x - Math.cos(h) * dist, wy = k.y - Math.sin(h) * dist, wz = kz * 0.6 + height;
    if (!(k.fallTimer > 1.3 && this.hx !== 0)) {
      const a = intro !== null || this.hx === 0 ? 1 : Math.min(1, dt * 10);
      this.hx += (wx - this.hx) * a; this.hy += (wy - this.hy) * a; this.hz += (wz - this.hz) * a;
    }
    this.x = this.hx; this.y = this.hy; this.z = this.hz;
    // aim at a point slightly ahead of the kart
    const lx = k.x + Math.cos(h) * 10, ly = k.y + Math.sin(h) * 10;
    this.yaw = Math.atan2(ly - this.y, lx - this.x);
    this.pitch = pitch;
    this.fov = 1.05 + this.boost * 0.12;
  }
}
