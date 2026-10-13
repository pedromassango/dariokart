import type { Track } from '../game/track';
import type { Theme } from '../game/tracks';
import { mulberry32 } from '../game/util';
import { hashStr } from '../game/track';

/**
 * Static 3D geometry for a course, described as polygons ("faces") that the Rive renderer projects,
 * lights, fogs, depth-sorts and fills with Rive paths. Also holds "art quads": 3D rectangles onto which
 * Rive artboards (turn signs, ad boards, the start banner, the crowd) are mapped.
 */
export interface Face {
  pts: Float32Array; // x,y,z triples
  n: number; // vertex count
  nx: number; ny: number; nz: number; // unit normal
  r: number; g: number; b: number;
  cx: number; cy: number; cz: number; rad: number; // bounding sphere
  twoSided: boolean;
  glow: boolean; // unlit (emissive)
  hill?: boolean; // part of a distant hill (the GPU world builds smooth hills instead)
}

/** a distant hill / mountain, kept as parameters so renderers can build their own geometry */
export interface Hill { x: number; y: number; r: number; h: number; color: string; top: string; style: string; z0: number }

export interface ArtQuad {
  artboard: string;
  key: string;
  // top-left, top-right, bottom-left corners in world space (bottom-right is implied)
  tl: [number, number, number]; tr: [number, number, number]; bl: [number, number, number];
  cx: number; cy: number; cz: number;
  nx: number; ny: number; // facing direction (ground plane)
  inputs?: Record<string, number | boolean>;
  mirror?: boolean;
}

export interface Prop {
  kind: string;
  artboard: string;
  x: number; y: number; z: number;
  height: number; // world height
  aspect: number; // width / height of the artboard
  anchor: number; // anchorY within the artboard (1 = bottom)
  bob?: number;
}

export interface Scene3D {
  faces: Face[];
  art: ArtQuad[];
  props: Prop[];
  hills: Hill[];
  clouds: { x: number; y: number; z: number; w: number }[];
}

function rgb(hex: string): [number, number, number] {
  const v = parseInt(hex.slice(1), 16);
  return [(v >> 16) & 255, (v >> 8) & 255, v & 255];
}

class Builder {
  faces: Face[] = [];
  hills: Hill[] = [];
  face(pts: number[], color: string, opts: { twoSided?: boolean; glow?: boolean } = {}) {
    const n = pts.length / 3;
    // Newell normal
    let nx = 0, ny = 0, nz = 0, cx = 0, cy = 0, cz = 0;
    for (let i = 0; i < n; i++) {
      const j = (i + 1) % n;
      const x1 = pts[i * 3], y1 = pts[i * 3 + 1], z1 = pts[i * 3 + 2];
      const x2 = pts[j * 3], y2 = pts[j * 3 + 1], z2 = pts[j * 3 + 2];
      nx += (y1 - y2) * (z1 + z2); ny += (z1 - z2) * (x1 + x2); nz += (x1 - x2) * (y1 + y2);
      cx += x1; cy += y1; cz += z1;
    }
    const l = Math.hypot(nx, ny, nz) || 1;
    cx /= n; cy /= n; cz /= n;
    let rad = 0;
    for (let i = 0; i < n; i++) rad = Math.max(rad, Math.hypot(pts[i * 3] - cx, pts[i * 3 + 1] - cy, pts[i * 3 + 2] - cz));
    const [r, g, b] = rgb(color);
    this.faces.push({ pts: new Float32Array(pts), n, nx: nx / l, ny: ny / l, nz: nz / l, r, g, b, cx, cy, cz, rad, twoSided: !!opts.twoSided, glow: !!opts.glow });
  }

  /** axis-free box from a center point, a ground direction (dx,dy), length along it, width, height */
  box(x: number, y: number, z0: number, dx: number, dy: number, len: number, wid: number, hgt: number, top: string, side: string, end = side) {
    const l = Math.hypot(dx, dy) || 1;
    const ux = dx / l, uy = dy / l, vx = -uy, vy = ux;
    const hl = len / 2, hw = wid / 2, z1 = z0 + hgt;
    const c = (a: number, b: number) => [x + ux * a + vx * b, y + uy * a + vy * b];
    const [p0, p1, p2, p3] = [c(-hl, -hw), c(hl, -hw), c(hl, hw), c(-hl, hw)];
    // winding chosen so normals point outward (y-down map space is mirrored, Newell handles it)
    this.face([p0[0], p0[1], z1, p1[0], p1[1], z1, p2[0], p2[1], z1, p3[0], p3[1], z1], top);
    this.face([p0[0], p0[1], z0, p1[0], p1[1], z0, p1[0], p1[1], z1, p0[0], p0[1], z1], side);
    this.face([p1[0], p1[1], z0, p2[0], p2[1], z0, p2[0], p2[1], z1, p1[0], p1[1], z1], end);
    this.face([p2[0], p2[1], z0, p3[0], p3[1], z0, p3[0], p3[1], z1, p2[0], p2[1], z1], side);
    this.face([p3[0], p3[1], z0, p0[0], p0[1], z0, p0[0], p0[1], z1, p3[0], p3[1], z1], end);
  }

  /** n-sided prism (pipes, pillars) */
  prism(x: number, y: number, z0: number, r: number, hgt: number, sides: number, top: string, side: string, side2 = side) {
    const z1 = z0 + hgt;
    const ring = (rr: number, z: number) => Array.from({ length: sides }, (_, i) => { const a = (i / sides) * Math.PI * 2; return [x + Math.cos(a) * rr, y + Math.sin(a) * rr, z]; });
    const lo = ring(r, z0), hi = ring(r, z1);
    for (let i = 0; i < sides; i++) {
      const j = (i + 1) % sides;
      this.face([...lo[i], ...lo[j], ...hi[j], ...hi[i]], i % 2 ? side : side2);
    }
    this.face(hi.flat(), top);
  }

  /** dome-like hill: cone fan with a ring of facets */
  hill(x: number, y: number, r: number, h: number, color: string, topColor: string, style: string, z0 = 0) {
    this.hills.push({ x, y, r, h, color, top: topColor, style, z0 });
    const first = this.faces.length;
    this.hillFaces(x, y, r, h, color, topColor, style, z0);
    for (let i = first; i < this.faces.length; i++) this.faces[i].hill = true;
  }

  private hillFaces(x: number, y: number, r: number, h: number, color: string, topColor: string, style: string, z0: number) {
    const sides = 9;
    if (style === 'mesa') {
      const ring = (rr: number, z: number) => Array.from({ length: sides }, (_, i) => { const a = (i / sides) * Math.PI * 2 + r; return [x + Math.cos(a) * rr, y + Math.sin(a) * rr, z]; });
      const lo = ring(r, z0), hi = ring(r * 0.72, z0 + h);
      for (let i = 0; i < sides; i++) { const j = (i + 1) % sides; this.face([...lo[i], ...lo[j], ...hi[j], ...hi[i]], color); }
      this.face(hi.flat(), topColor);
      return;
    }
    const peak = [x, y, z0 + h];
    const midR = style === 'jagged' || style === 'snow' ? r * 0.45 : r * 0.75, midH = style === 'jagged' || style === 'snow' ? h * 0.55 : h * 0.6;
    const lo = Array.from({ length: sides }, (_, i) => { const a = (i / sides) * Math.PI * 2; return [x + Math.cos(a) * r, y + Math.sin(a) * r, z0]; });
    const mid = Array.from({ length: sides }, (_, i) => { const a = ((i + 0.5) / sides) * Math.PI * 2; return [x + Math.cos(a) * midR, y + Math.sin(a) * midR, z0 + midH]; });
    for (let i = 0; i < sides; i++) {
      const j = (i + 1) % sides;
      this.face([...lo[i], ...lo[j], ...mid[i]], color);
      this.face([...lo[j], ...mid[j], ...mid[i]], color);
      this.face([...mid[i], ...mid[j], ...peak], topColor);
    }
  }
}

export function buildScene(tr: Track): Scene3D {
  const th: Theme = tr.def.theme;
  const B = new Builder();
  const art: ArtQuad[] = [];
  const props: Prop[] = [];
  const rnd = mulberry32(hashStr(tr.def.id + 'scene'));
  const n = tr.n, hw = tr.halfW, cw = th.curbWidth;
  const lim = hw + cw + th.offroadWidth;
  const onCourse = (x: number, y: number, margin: number) => Math.abs(tr.query(x, y).lateral) < margin;

  // ---------------------------------------------------------------- barriers
  if (th.walls === 'blocks') {
    // MK8 retro-circuit style: chunky coloured blocks along the outer edge
    for (let i = 0; i < n; i += 2) {
      for (const s of [-1, 1]) {
        const x = tr.x[i] + tr.nx[i] * lim * s, y = tr.y[i] + tr.ny[i] * lim * s;
        if (onCourse(x, y, lim - 4)) continue;
        const col = th.wallColors[(i / 2) % th.wallColors.length];
        B.box(x, y, 0, tr.tx[i], tr.ty[i], 16.5, 4, 4.5, shadeHex(col, 0.18), col, shadeHex(col, -0.15));
      }
    }
  } else if (th.walls === 'castle') {
    for (let i = 0; i < n; i += 3) {
      for (const s of [-1, 1]) {
        const off = hw + cw + 4;
        const x = tr.x[i] + tr.nx[i] * off * s, y = tr.y[i] + tr.ny[i] * off * s;
        if (onCourse(x, y, off - 3)) continue;
        const col = th.wallColors[(i / 3) % th.wallColors.length];
        B.box(x, y, -14, tr.tx[i], tr.ty[i], 24.5, 6, (i / 3) % 2 ? 19 : 22, shadeHex(col, 0.12), col);
      }
    }
  } else if (th.walls === 'fence' || th.walls === 'rail') {
    const off = th.walls === 'rail' ? hw + cw + 1 : lim;
    const col = th.wallColors[0];
    for (let i = 0; i < n; i += 4) {
      const j = (i + 4) % n;
      for (const s of [-1, 1]) {
        const ax = tr.x[i] + tr.nx[i] * off * s, ay = tr.y[i] + tr.ny[i] * off * s;
        const bx = tr.x[j] + tr.nx[j] * off * s, by = tr.y[j] + tr.ny[j] * off * s;
        if (onCourse(ax, ay, off - 3)) continue;
        B.box(ax, ay, 0, tr.tx[i], tr.ty[i], 1.2, 1.2, 5, col, shadeHex(col, -0.2));
        for (const z of th.walls === 'rail' ? [3.6] : [2.2, 4.2]) {
          B.face([ax, ay, z, bx, by, z, bx, by, z + 0.9, ax, ay, z + 0.9], tr.def.id === 'rainbow' ? '#ffffff' : col, { twoSided: true, glow: tr.def.id === 'rainbow' });
        }
      }
    }
  }

  // course slab sides over the void / lava / water
  if (th.edge === 'fall') {
    const outer = hw + cw + th.offroadWidth;
    const col = tr.def.id === 'rainbow' ? '#9a6aff' : tr.def.id === 'ghost' ? '#5a3e24' : tr.def.id === 'beach' ? '#d8c080' : '#57505e';
    const depth = tr.def.id === 'castle' ? -16 : tr.def.id === 'ghost' ? -6 : -3;
    for (let i = 0; i < n; i += 2) {
      const j = (i + 2) % n;
      for (const s of [-1, 1]) {
        const ax = tr.x[i] + tr.nx[i] * outer * s, ay = tr.y[i] + tr.ny[i] * outer * s;
        const bx = tr.x[j] + tr.nx[j] * outer * s, by = tr.y[j] + tr.ny[j] * outer * s;
        if (s > 0) B.face([ax, ay, 0, bx, by, 0, bx, by, depth, ax, ay, depth], col, { glow: tr.def.id === 'rainbow' });
        else B.face([bx, by, 0, ax, ay, 0, ax, ay, depth, bx, by, depth], col, { glow: tr.def.id === 'rainbow' });
      }
    }
    if (tr.def.id === 'ghost') {
      // support posts under the boardwalk
      for (let i = 0; i < n; i += 8) for (const s of [-1, 1]) {
        const x = tr.x[i] + tr.nx[i] * outer * 0.85 * s, y = tr.y[i] + tr.ny[i] * outer * 0.85 * s;
        B.box(x, y, -60, tr.tx[i], tr.ty[i], 2, 2, 60, '#4a3220', '#3a2616');
      }
    }
  }

  // ---------------------------------------------------------------- obstacles (3D ones)
  for (const o of tr.obstacles) {
    if (o.kind === 'pipe') {
      B.prism(o.x, o.y, 0, o.r, 13, 10, '#0a3a10', '#2cb83c', '#22a032');
      B.prism(o.x, o.y, 13, o.r * 1.22, 4, 10, '#0a3a10', '#36c846', '#2cb83c');
    }
  }

  // ---------------------------------------------------------------- start gate (Rive banner)
  {
    const i = 0;
    const gw = hw + cw + 6;
    const tx = tr.tx[i], ty = tr.ty[i], nx = tr.nx[i], ny = tr.ny[i];
    for (const s of [-1, 1]) B.box(tr.x[i] + nx * gw * s, tr.y[i] + ny * gw * s, 0, tx, ty, 2.6, 2.6, 30, '#e8e8f0', '#c8c8d4');
    B.box(tr.x[i], tr.y[i], 24, tx, ty, 2, gw * 2 + 4, 9, '#9a1010', '#b81818');
    for (const f of [-1, 1]) {
      const ox = tr.x[i] - tx * 1.05 * f, oy = tr.y[i] - ty * 1.05 * f;
      const L = (gw + 1) * f; // mirror so the banner reads correctly from both sides
      art.push({ artboard: 'Banner', key: 'banner' + f, tl: [ox - nx * L, oy - ny * L, 32.6], tr: [ox + nx * L, oy + ny * L, 32.6], bl: [ox - nx * L, oy - ny * L, 24.4], cx: ox, cy: oy, cz: 28, nx: -tx * f, ny: -ty * f });
    }
  }

  // ---------------------------------------------------------------- turn signs at sharp corners (Rive)
  if (th.turnSigns) {
    const turnAt = (i: number) => {
      const a = (i - 6 + n) % n, b = (i + 6) % n;
      return Math.atan2(tr.tx[a] * tr.ty[b] - tr.ty[a] * tr.tx[b], tr.tx[a] * tr.tx[b] + tr.ty[a] * tr.ty[b]);
    };
    const corners: { i: number; dir: number }[] = [];
    for (let i = 0; i < n; i++) {
      const c = turnAt(i);
      if (Math.abs(c) < 0.55) continue;
      if (Math.abs(c) < Math.abs(turnAt((i + 1) % n)) || Math.abs(c) < Math.abs(turnAt((i - 1 + n) % n))) continue;
      if (corners.some((k) => Math.min(Math.abs(k.i - i), n - Math.abs(k.i - i)) < 28)) continue;
      corners.push({ i, dir: Math.sign(c) });
    }
    for (const c of corners) {
      const i = (c.i - 4 + n) % n;
      const side = -c.dir;
      const off = th.edge === 'wall' ? Math.min(lim - 4, hw + cw + 22) : hw + cw + 4;
      const x = tr.x[i] + tr.nx[i] * off * side, y = tr.y[i] + tr.ny[i] * off * side;
      // board faces incoming drivers (normal = -tangent); width along the normal
      const fx = -tr.tx[i], fy = -tr.ty[i];
      const wx = -fy, wy = fx; // board "right" as seen by the approaching driver
      const W = 13, z0 = 8, z1 = 21;
      for (const p of [-9, 9]) B.box(x + wx * p, y + wy * p, 0, fx, fy, 1, 1, z0 + 1, '#d0d0d8', '#b0b0bc');
      B.box(x - fx * 0.7, y - fy * 0.7, z0 - 0.5, fx, fy, 0.8, W * 2 + 1, z1 - z0 + 1, '#2a2a34', '#3a3a44');
      art.push({ artboard: 'TurnSign', key: 'turn', tl: [x - wx * W, y - wy * W, z1], tr: [x + wx * W, y + wy * W, z1], bl: [x - wx * W, y - wy * W, z0], cx: x, cy: y, cz: (z0 + z1) / 2, nx: fx, ny: fy, inputs: { dir: c.dir }, mirror: c.dir < 0 });
    }
  }

  // ---------------------------------------------------------------- grandstand with Rive crowd + ad boards
  if (th.grandstand) {
    const i = 10;
    const side = -1;
    const off = lim + 14;
    const x0 = tr.x[i] + tr.nx[i] * off * side, y0 = tr.y[i] + tr.ny[i] * off * side;
    const ox = tr.nx[i] * side, oy = tr.ny[i] * side; // pointing away from the track
    const len = 130;
    for (let r = 0; r < 4; r++) {
      B.box(x0 + ox * (r * 6), y0 + oy * (r * 6), 0, tr.tx[i], tr.ty[i], len, 6, 5 + r * 5, '#d8dce8', '#b8bcc8');
    }
    B.box(x0 + ox * 12, y0 + oy * 12, 34, tr.tx[i], tr.ty[i], len + 8, 30, 2, '#e02424', '#b81818');
    for (const p of [-len / 2, 0, len / 2]) B.box(x0 + ox * 24 + tr.tx[i] * p, y0 + oy * 24 + tr.ty[i] * p, 0, 1, 0, 1.6, 1.6, 34, '#c8ccd8', '#a8acb8');
    // crowd rows (Rive) laid on the stepped stand, facing the track
    const L = len / 2 - 2;
    for (let r = 0; r < 2; r++) {
      const bx = x0 + ox * (3 + r * 12) - ox * 3, by = y0 + oy * (3 + r * 12) - oy * 3;
      const zb = 5 + r * 10, zt = zb + 13;
      art.push({ artboard: 'Crowd', key: 'crowd', tl: [bx - tr.tx[i] * L * side + ox * 5, by - tr.ty[i] * L * side + oy * 5, zt], tr: [bx + tr.tx[i] * L * side + ox * 5, by + tr.ty[i] * L * side + oy * 5, zt], bl: [bx - tr.tx[i] * L * side, by - tr.ty[i] * L * side, zb], cx: bx, cy: by, cz: (zb + zt) / 2, nx: -ox, ny: -oy });
    }
  }
  if (th.adBoards) {
    let k = 0;
    for (let i = 30; i < n; i += 38) {
      const s = k % 2 ? 1 : -1;
      const off = lim + 6;
      const x = tr.x[i] + tr.nx[i] * off * s, y = tr.y[i] + tr.ny[i] * off * s;
      if (onCourse(x, y, off - 4)) { k++; continue; }
      const fx = -tr.nx[i] * s, fy = -tr.ny[i] * s; // faces the track
      const wx = tr.tx[i] * -s, wy = tr.ty[i] * -s;
      const W = 17, z0 = 6, z1 = 18.5;
      for (const p of [-12, 12]) B.box(x + wx * p, y + wy * p, 0, 1, 0, 1, 1, z0 + 0.5, '#7a7a86', '#5a5a66');
      B.box(x - fx * 0.6, y - fy * 0.6, z0 - 0.4, fx, fy, 0.7, W * 2 + 1, z1 - z0 + 0.8, '#30303a', '#40404a');
      art.push({ artboard: 'AdBoard_' + ((k % 4) + 1), key: 'ad' + (k % 4), tl: [x - wx * W, y - wy * W, z1], tr: [x + wx * W, y + wy * W, z1], bl: [x - wx * W, y - wy * W, z0], cx: x, cy: y, cz: (z0 + z1) / 2, nx: fx, ny: fy });
      k++;
    }
  }

  // ---------------------------------------------------------------- scenery props (Rive billboards)
  const PROP: Record<string, [string, number, number, number]> = {
    // kind: [artboard, world height, aspect (w/h), anchorY]
    tree: ['Tree', 36, 64 / 96, 0.98], bush: ['Bush', 12, 64 / 40, 0.96], palm: ['Palm', 50, 64 / 112, 0.98],
    deadtree: ['DeadTree', 90, 64 / 96, 0.98], cactus: ['Cactus', 30, 64 / 112, 0.98], lamp: ['Lamp', 60, 64 / 200, 0.99],
    flag: ['Flag', 34, 64 / 160, 0.99], boo: ['Boo', 14, 1, 0.5], penguin: ['Penguin', 9, 64 / 80, 0.97], mole: ['Mole', 8, 1, 0.96],
    star: ['Item_star', 10, 1, 0.5], lavarock: ['', 0, 1, 1],
  };
  for (const d of tr.decos) {
    if (d.kind === 'lavarock') {
      B.prism(d.x, d.y, -6, 7 * d.scale, 5 * d.scale, 6, '#4a2a22', '#2a1612', '#3a201a');
      continue;
    }
    const [artboard, h, aspect, anchor] = PROP[d.kind];
    const z = d.kind === 'deadtree' && tr.def.id === 'ghost' ? -55 : d.kind === 'boo' ? 8 + rnd() * 8 : d.kind === 'star' ? 40 + rnd() * 60 : 0;
    props.push({ kind: d.kind, artboard, x: d.x, y: d.y, z, height: h * d.scale, aspect, anchor, bob: d.kind === 'boo' || d.kind === 'star' ? rnd() * 6 : undefined });
  }

  // ---------------------------------------------------------------- distant hills / mountains
  if (th.hills !== 'none') {
    const cx = (tr.minX + tr.maxX) / 2, cy = (tr.minY + tr.maxY) / 2;
    const R = Math.max(tr.maxX - tr.minX, tr.maxY - tr.minY) * 0.5 + 260;
    const count = 22;
    for (let i = 0; i < count; i++) {
      const a = (i / count) * Math.PI * 2 + rnd() * 0.12;
      const rr = R + rnd() * 420;
      const size = 140 + rnd() * 160;
      const h = th.hills === 'mesa' ? 60 + rnd() * 80 : th.hills === 'jagged' ? 160 + rnd() * 180 : th.hills === 'snow' ? 180 + rnd() * 200 : th.hills === 'island' ? 30 + rnd() * 50 : 70 + rnd() * 90;
      const hx = cx + Math.cos(a) * rr, hy = cy + Math.sin(a) * rr;
      if (onCourse(hx, hy, hw + size)) continue;
      B.hill(hx, hy, size, h, th.hillColor, th.hillTop, th.hills, th.hills === 'island' ? -2 : 0);
    }
  }
  if (tr.def.id === 'ghost') {
    // haunted mansion silhouette far away
    const mx = tr.maxX + 420, my = tr.minY - 120;
    B.box(mx, my, -60, 1, 0.3, 160, 90, 170, '#241638', '#1a0f2a');
    B.box(mx - 40, my + 10, 110, 1, 0.3, 40, 40, 60, '#241638', '#1a0f2a');
  }

  // ---------------------------------------------------------------- clouds (Rive) on a sky ring
  const clouds: Scene3D['clouds'] = [];
  if (['circuit', 'plains', 'beach', 'choco', 'ice'].includes(tr.def.id)) {
    const cx = (tr.minX + tr.maxX) / 2, cy = (tr.minY + tr.maxY) / 2;
    for (let i = 0; i < 16; i++) {
      const a = rnd() * Math.PI * 2, rr = 1400 + rnd() * 900;
      clouds.push({ x: cx + Math.cos(a) * rr, y: cy + Math.sin(a) * rr, z: 260 + rnd() * 260, w: 260 + rnd() * 260 });
    }
  }
  return { faces: B.faces, art, props, hills: B.hills, clouds };
}

export function shadeHex(hex: string, f: number): string {
  const [r, g, b] = rgb(hex);
  const t = f >= 0 ? 255 : 0, k = Math.abs(f);
  const m = (c: number) => Math.round(c + (t - c) * k);
  return '#' + ((m(r) << 16) | (m(g) << 8) | m(b)).toString(16).padStart(6, '0');
}
