// Parametric drivers for the rotating kart sprites.
//
// Each character is described as a head (ellipse) + a set of features placed on
// an imaginary sphere by azimuth `a` (degrees, 0 = nose/front, +90 = character's
// right) and elevation `e` (fraction of R, +down). The facing angle `phi` is the
// direction the character faces on screen: 0 = away from camera, 90 = to the
// right, 180 = toward the camera. A feature's screen x = cx + r*R*sin(phi + a)
// and its depth toward the camera = -cos(phi + a).
//  * flat features (eyes, emblems, mouths) are squashed by depth and hidden
//    when facing away;
//  * volumetric features (noses, ears, brims, hair) are always drawn: behind
//    the head when depth < 0, in front otherwise.
import { shape, node, pivot, rect, rectC, ellipse, circle, poly, svg, linear, radial, OUT, ol, alpha, lighten, darken, blob, shine, starPts } from './common.mjs';

const SKIN = '#ffc896';
const deg = Math.PI / 180;

const C = {
  dario: {
    head: { sx: 1, sy: 1, color: SKIN },
    cap: { color: '#e52521', brim: '#b8140f', emblem: { letter: 'D', color: '#e52521' } },
    shirt: '#e52521', overalls: '#2a4bd7', gloves: '#ffffff',
    feats: [
      { k: 'vol', a: 180, e: 0.6, r: 0.8, w: 0.36, h: 0.18, fill: '#5a2e12' }, // nape hair
      { k: 'vol', a: 100, e: 0.12, r: 0.96, w: 0.15, h: 0.22, fill: '#f4b080' }, // ears
      { k: 'vol', a: -100, e: 0.12, r: 0.96, w: 0.15, h: 0.22, fill: '#f4b080' },
      { k: 'eye', a: 32, e: -0.08, w: 0.2, h: 0.3, iris: '#2a6fe0' },
      { k: 'eye', a: -32, e: -0.08, w: 0.2, h: 0.3, iris: '#2a6fe0' },
      { k: 'flat', a: 0, e: 0.62, r: 0.86, w: 0.22, h: 0.12, fill: '#9e1a2a', o: 1.5 }, // mouth
      { k: 'vol', a: 16, e: 0.42, r: 0.98, w: 0.3, h: 0.17, fill: '#3a1f0f', o: 1.5 }, // mustache
      { k: 'vol', a: -16, e: 0.42, r: 0.98, w: 0.3, h: 0.17, fill: '#3a1f0f', o: 1.5 },
      { k: 'vol', a: 0, e: 0.2, r: 1.12, w: 0.32, h: 0.27, fill: SKIN, shine: true }, // nose
    ],
  },
  luigio: {
    head: { sx: 0.92, sy: 1.08, color: SKIN },
    cap: { color: '#2fae3c', brim: '#1c7a28', emblem: { letter: 'L', color: '#2fae3c' } },
    shirt: '#2fae3c', overalls: '#1d2f8a', gloves: '#ffffff',
    feats: [
      { k: 'vol', a: 180, e: 0.65, r: 0.8, w: 0.33, h: 0.18, fill: '#5a2e12' },
      { k: 'vol', a: 100, e: 0.12, r: 0.94, w: 0.14, h: 0.24, fill: '#f4b080' },
      { k: 'vol', a: -100, e: 0.12, r: 0.94, w: 0.14, h: 0.24, fill: '#f4b080' },
      { k: 'eye', a: 32, e: -0.1, w: 0.19, h: 0.32, iris: '#2a6fe0' },
      { k: 'eye', a: -32, e: -0.1, w: 0.19, h: 0.32, iris: '#2a6fe0' },
      { k: 'flat', a: 0, e: 0.66, r: 0.86, w: 0.2, h: 0.11, fill: '#9e1a2a', o: 1.5 },
      { k: 'vol', a: 18, e: 0.44, r: 0.97, w: 0.28, h: 0.13, fill: '#3a1f0f', o: 1.5 },
      { k: 'vol', a: -18, e: 0.44, r: 0.97, w: 0.28, h: 0.13, fill: '#3a1f0f', o: 1.5 },
      { k: 'vol', a: 0, e: 0.2, r: 1.14, w: 0.26, h: 0.3, fill: SKIN, shine: true },
    ],
  },
  pearl: {
    head: { sx: 0.95, sy: 1, color: '#ffd9b8' },
    shirt: '#ff7fc4', gloves: '#ffffff', crown: true,
    hairBack: '#ffd84a',
    feats: [
      { k: 'vol', a: 180, e: 0.35, r: 0.3, w: 1.1, h: 1.2, fill: '#ffd84a' }, // big hair
      { k: 'vol', a: 95, e: 0.45, r: 0.75, w: 0.4, h: 0.85, fill: '#ffd84a' }, // side locks
      { k: 'vol', a: -95, e: 0.45, r: 0.75, w: 0.4, h: 0.85, fill: '#ffd84a' },
      { k: 'eye', a: 32, e: 0.0, w: 0.19, h: 0.28, iris: '#2a6fe0', lash: true },
      { k: 'eye', a: -32, e: 0.0, w: 0.19, h: 0.28, iris: '#2a6fe0', lash: true },
      { k: 'flat', a: 32, e: 0.32, r: 0.95, w: 0.16, h: 0.09, fill: alpha('#ff6fa0', 0.5), o: 0 },
      { k: 'flat', a: -32, e: 0.32, r: 0.95, w: 0.16, h: 0.09, fill: alpha('#ff6fa0', 0.5), o: 0 },
      { k: 'flat', a: 0, e: 0.55, r: 0.92, w: 0.17, h: 0.08, fill: '#ff4f8a', o: 1.5 },
      { k: 'vol', a: 0, e: 0.25, r: 1.0, w: 0.1, h: 0.12, fill: '#ffd9b8' },
      { k: 'cap', a: 0, e: -0.55, r: 0.55, w: 0.95, h: 0.42, fill: '#ffd84a' }, // bangs
    ],
  },
  yoshio: {
    head: { sx: 0.95, sy: 0.95, color: '#6bd13a' },
    shirt: '#6bd13a', gloves: '#ffffff', saddle: '#e52521',
    feats: [
      { k: 'vol', a: 180, e: -0.4, r: 0.95, w: 0.3, h: 0.3, fill: '#e52521', spike: true },
      { k: 'vol', a: 180, e: 0.1, r: 1.0, w: 0.3, h: 0.3, fill: '#e52521', spike: true },
      { k: 'vol', a: 180, e: 0.6, r: 0.95, w: 0.28, h: 0.28, fill: '#e52521', spike: true },
      { k: 'vol', a: 22, e: -0.85, r: 0.55, w: 0.3, h: 0.42, fill: '#6bd13a' }, // eye bumps
      { k: 'vol', a: -22, e: -0.85, r: 0.55, w: 0.3, h: 0.42, fill: '#6bd13a' },
      { k: 'eye', a: 32, e: -0.85, r: 0.75, w: 0.22, h: 0.32, iris: null },
      { k: 'eye', a: -32, e: -0.85, r: 0.75, w: 0.22, h: 0.32, iris: null },
      { k: 'vol', a: 0, e: 0.48, r: 0.6, w: 0.85, h: 0.42, fill: '#ffffff' }, // white jaw
      { k: 'vol', a: 0, e: 0.12, r: 1.0, w: 0.72, h: 0.55, fill: '#6bd13a', shine: true, snout: true }, // snout
      { k: 'flat', a: 10, e: 0.05, r: 1.55, w: 0.07, h: 0.11, fill: OUT, o: 0 },
      { k: 'flat', a: -10, e: 0.05, r: 1.55, w: 0.07, h: 0.11, fill: OUT, o: 0 },
    ],
  },
  bowzer: {
    head: { sx: 1.08, sy: 1, color: '#f2b33d' },
    shirt: '#f2b33d', gloves: '#f2b33d', shell: '#2fae3c', collar: true,
    feats: [
      { k: 'horn', a: 60, e: -0.75, r: 0.85, fill: '#fff4d6' },
      { k: 'horn', a: -60, e: -0.75, r: 0.85, fill: '#fff4d6' },
      { k: 'vol', a: 180, e: -0.5, r: 0.55, w: 0.8, h: 0.6, fill: '#ff5a2a', spiky: true }, // hair
      { k: 'vol', a: 0, e: 0.38, r: 0.85, w: 0.8, h: 0.5, fill: '#ffe7a0', shine: false, snout: true }, // muzzle
      { k: 'flat', a: 12, e: 0.22, r: 1.45, w: 0.07, h: 0.06, fill: OUT, o: 0 },
      { k: 'flat', a: -12, e: 0.22, r: 1.45, w: 0.07, h: 0.06, fill: OUT, o: 0 },
      { k: 'flat', a: 0, e: 0.62, r: 1.25, w: 0.3, h: 0.1, fill: '#7a1a2a', o: 1.5 },
      { k: 'eye', a: 32, e: -0.2, w: 0.18, h: 0.22, iris: '#e52521', brow: '#ff5a2a' },
      { k: 'eye', a: -32, e: -0.2, w: 0.18, h: 0.22, iris: '#e52521', brow: '#ff5a2a' },
      { k: 'vol', a: 0, e: -0.75, r: 0.5, w: 0.75, h: 0.4, fill: '#ff5a2a', spiky: true }, // front hair
    ],
  },
  donkeyjr: {
    head: { sx: 1, sy: 1, color: '#8b5a2b' },
    shirt: '#8b5a2b', tank: '#ffffff', gloves: '#e8b080',
    feats: [
      { k: 'vol', a: 100, e: 0.0, r: 1.0, w: 0.2, h: 0.24, fill: '#8b5a2b', inner: '#e8b080' },
      { k: 'vol', a: -100, e: 0.0, r: 1.0, w: 0.2, h: 0.24, fill: '#8b5a2b', inner: '#e8b080' },
      { k: 'vol', a: 0, e: -0.95, r: 0.15, w: 0.3, h: 0.25, fill: '#7a4a20', tuft: true },
      { k: 'flat', a: 0, e: -0.1, r: 0.92, w: 0.62, h: 0.42, fill: '#e8b080', o: 1.5 }, // face mask
      { k: 'eye', a: 18, e: -0.15, w: 0.15, h: 0.22, iris: '#4a2a10' },
      { k: 'eye', a: -18, e: -0.15, w: 0.15, h: 0.22, iris: '#4a2a10' },
      { k: 'vol', a: 0, e: 0.45, r: 0.85, w: 0.6, h: 0.42, fill: '#e8b080', snout: true }, // muzzle
      { k: 'flat', a: 0, e: 0.62, r: 1.3, w: 0.3, h: 0.1, fill: '#7a1a2a', o: 1.5 },
      { k: 'flat', a: 10, e: 0.36, r: 1.38, w: 0.05, h: 0.06, fill: OUT, o: 0 },
      { k: 'flat', a: -10, e: 0.36, r: 1.38, w: 0.05, h: 0.06, fill: OUT, o: 0 },
    ],
  },
  toadie: {
    head: { sx: 0.95, sy: 0.88, color: '#ffe0bd' },
    shirt: '#ffffff', vest: '#2a6fe0', gloves: '#ffe0bd', mushroom: true,
    feats: [
      { k: 'eye', a: 32, e: 0.22, w: 0.13, h: 0.28, iris: 'black' },
      { k: 'eye', a: -32, e: 0.22, w: 0.13, h: 0.28, iris: 'black' },
      { k: 'flat', a: 35, e: 0.45, r: 0.95, w: 0.16, h: 0.1, fill: alpha('#ff7a7a', 0.5), o: 0 },
      { k: 'flat', a: -35, e: 0.45, r: 0.95, w: 0.16, h: 0.1, fill: alpha('#ff7a7a', 0.5), o: 0 },
      { k: 'flat', a: 0, e: 0.66, r: 0.9, w: 0.2, h: 0.12, fill: '#9e1a2a', o: 1.5 },
    ],
  },
  koopo: {
    head: { sx: 0.9, sy: 1.12, color: '#ffd23f' },
    shirt: '#ffd23f', gloves: '#ffffff', shell: '#2fae3c',
    feats: [
      { k: 'vol', a: 0, e: 0.38, r: 0.82, w: 0.72, h: 0.45, fill: '#ffd23f', shine: true, snout: true }, // snout
      { k: 'flat', a: 10, e: 0.3, r: 1.5, w: 0.06, h: 0.08, fill: OUT, o: 0 },
      { k: 'flat', a: -10, e: 0.3, r: 1.5, w: 0.06, h: 0.08, fill: OUT, o: 0 },
      { k: 'flat', a: 0, e: 0.7, r: 1.0, w: 0.26, h: 0.1, fill: '#9e1a2a', o: 1.5 },
      { k: 'eye', a: 32, e: -0.25, w: 0.2, h: 0.36, iris: null },
      { k: 'eye', a: -32, e: -0.25, w: 0.2, h: 0.36, iris: null },
    ],
  },
};

// ---------------------------------------------------------------- feature renderers
function proj(f, phi, cx, cy, R, sx) {
  const t = (phi + f.a) * deg;
  // snouts/muzzles push forward when seen side-on so profiles read clearly
  const r = (f.r ?? 1) + (f.snout ? 0.4 * Math.abs(Math.sin(t)) : 0);
  return { x: cx + r * R * sx * Math.sin(t), y: cy + (f.e ?? 0) * R, depth: -Math.cos(t), side: Math.sin(t) };
}

function drawEye(f, p, R, phi, prefix) {
  const sq = Math.max(0.68, p.depth);
  const w = f.w * R * sq, h = f.h * R;
  const look = Math.sin(phi * deg) * w * 0.35 + p.side * w * 0.15;
  const kids = [
    blob({}, ellipse(p.x, p.y, w, h), '#ffffff', 1.5),
    shape({}, ellipse(p.x + look, p.y + h * 0.15, w * 0.62, h * 0.66), f.iris && f.iris !== 'black' ? linear(0, p.y - h, 0, p.y + h, [[0, lighten(f.iris, 0.2)], [1, darken(f.iris, 0.3)]]) : OUT),
    shape({}, ellipse(p.x + look, p.y + h * 0.2, w * 0.32, h * 0.38), OUT),
    shine([ellipse(p.x + look - w * 0.2, p.y - h * 0.15, Math.max(0.6, w * 0.2), h * 0.18)], 1),
  ];
  if (f.iris === 'black') kids.splice(0, 4, blob({}, ellipse(p.x, p.y, w, h), OUT, 0), shine([ellipse(p.x - w * 0.25, p.y - h * 0.35, w * 0.35, h * 0.22)], 1));
  if (f.lash) kids.push(shape({}, svg(`M${p.x - w} ${p.y - h * 0.5} L${p.x - w - 2} ${p.y - h - 1} M${p.x + w * 0.3} ${p.y - h} L${p.x + w * 0.4} ${p.y - h - 2.5}`), null, ol(1.2)));
  if (f.brow) kids.push(shape({ x: p.x, y: p.y - h * 0.95, rotation: f.a > 0 ? 18 : -18 }, rectC(0, 0, w * 2.4, 2.8, 1.4), f.brow, ol(1.5)));
  return pivot(p.x, p.y, { name: prefix + (f.a > 0 ? 'eyeR' : 'eyeL') }, kids);
}

function drawFeature(f, p, R, phi, sx) {
  const t = (phi + f.a) * deg;
  if (f.k === 'flat') {
    const sq = Math.max(0.15, p.depth);
    return shape({}, ellipse(p.x, p.y, f.w * R * sq, f.h * R), f.fill, f.o === 0 ? null : ol(f.o ?? 1.5));
  }
  if (f.k === 'horn') {
    const dir = Math.sin(t) >= 0 ? 1 : -1;
    const x = p.x, y = p.y; const L = R * 0.6;
    return blob({}, svg(`M${x - 4 * dir} ${y + 3} C${x + dir * L * 0.2} ${y - L * 0.3} ${x + dir * L * 0.55} ${y - L * 0.6} ${x + dir * L * 0.35} ${y - L} C${x + dir * L * 0.05} ${y - L * 0.6} ${x - dir * 2} ${y - L * 0.3} ${x - 6 * dir} ${y - 1} Z`), f.fill, 2);
  }
  // volumetric / cap: foreshortening shrinks width a bit when edge-on
  const w = f.w * R * (f.k === 'cap' ? Math.max(0.3, Math.abs(Math.cos(t))) : (0.75 + 0.25 * Math.abs(Math.cos(t)))) * sx;
  const h = f.h * R;
  if (f.spike) {
    const dir = p.side >= 0 ? 1 : -1;
    const tip = Math.abs(p.side) > 0.3 ? dir * w * 1.4 : 0;
    const up = Math.abs(p.side) > 0.3 ? 0 : -h * 1.2;
    return blob({}, poly([[p.x - w * 0.7, p.y + h * 0.6], [p.x + w * 0.7, p.y + h * 0.6], [p.x + tip, p.y + up - (tip ? h * 0.1 : 0)]], true, 1.5), f.fill, 1.8);
  }
  if (f.spiky) {
    const pts = [];
    const n = 7;
    for (let i = 0; i <= n; i++) {
      const ang = Math.PI + (i / n) * Math.PI;
      const rr = i % 2 ? 1.0 : 0.6;
      pts.push([p.x + Math.cos(ang) * w * rr, p.y + Math.sin(ang) * h * rr * 1.2]);
    }
    pts.push([p.x + w * 0.9, p.y + h * 0.4], [p.x - w * 0.9, p.y + h * 0.4]);
    return blob({}, poly(pts, true, 1), f.fill, 2);
  }
  if (f.tuft) return blob({}, svg(`M${p.x - w} ${p.y + h} C${p.x - w} ${p.y - h} ${p.x} ${p.y - h * 1.5} ${p.x} ${p.y} C${p.x + w * 0.4} ${p.y - h * 1.6} ${p.x + w * 1.2} ${p.y - h} ${p.x + w} ${p.y + h} Z`), f.fill, 2);
  const kids = [blob({}, ellipse(p.x, p.y, w, h), f.fill, f.o ?? 2)];
  if (f.inner && Math.abs(p.side) > 0.5) kids.push(shape({}, ellipse(p.x, p.y, w * 0.55, h * 0.6), f.inner));
  if (f.shine) kids.push(shine([ellipse(p.x - w * 0.3, p.y - h * 0.35, w * 0.3, h * 0.22)], 0.7));
  return node({}, kids);
}

function capDome(c, cx, cy, R, sx, phi) {
  const w = R * sx * 1.04, top = cy - R * 1.12, base = cy - R * 0.12;
  const parts = [blob({}, svg(`M${cx - w} ${base} C${cx - w} ${top - R * 0.1} ${cx + w} ${top - R * 0.1} ${cx + w} ${base} C${cx + w * 0.5} ${base - R * 0.12} ${cx - w * 0.5} ${base - R * 0.12} ${cx - w} ${base} Z`), linear(0, top, 0, base, [[0, lighten(c.color, 0.25)], [1, darken(c.color, 0.1)]]), 2.5)];
  parts.push(shine([ellipse(cx - w * 0.4, cy - R * 0.85, R * 0.22, R * 0.1)], 0.5, { rotation: -25 }));
  return parts;
}
function brim(c, cx, cy, R, sx, phi) {
  const t = phi * deg; const depth = -Math.cos(t);
  const w = R * (0.5 + 0.55 * Math.abs(Math.cos(t))) * sx, h = R * 0.2;
  const x = cx + R * 0.72 * sx * Math.sin(t), y = cy - R * 0.14;
  return { depth, el: blob({}, ellipse(x, y, w, h), c.brim, 2.5) };
}
function emblem(c, cx, cy, R, sx, phi) {
  const t = phi * deg; const depth = -Math.cos(t);
  if (depth < 0.2) return null;
  const x = cx + R * 0.8 * sx * Math.sin(t), y = cy - R * 0.55;
  const L = c.emblem.letter === 'D' ? 'M-3 -4 L0 -4 C4 -4 4 4 0 4 L-3 4 Z' : 'M-3 -4.5 L-0.5 -4.5 L-0.5 2 L3.5 2 L3.5 4.5 L-3 4.5 Z';
  return node({ x, y, scaleX: depth * 0.75, scaleY: 0.75 }, [
    blob({}, ellipse(0, 0, 8, 7.5), '#ffffff', 2),
    shape({}, svg(L), c.emblem.color, c.emblem.letter === 'D' ? { color: c.emblem.color, width: 2 } : null),
  ]);
}
function mushroomCap(cx, cy, R, phi) {
  const w = R * 1.55, top = cy - R * 1.55, base = cy - R * 0.15;
  const kids = [blob({}, svg(`M${cx - w} ${base} C${cx - w * 1.1} ${top} ${cx + w * 1.1} ${top} ${cx + w} ${base} C${cx + w * 0.6} ${base + R * 0.2} ${cx - w * 0.6} ${base + R * 0.2} ${cx - w} ${base} Z`), radial(cx - R * 0.4, top + R * 0.4, R * 2.2, [[0, '#ffffff'], [1, '#d8d0e0']]), 2.5)];
  for (const a of [0, 90, 180, 270]) {
    const t = (phi + a) * deg; const d = -Math.cos(t);
    if (d < -0.1) continue;
    const sq = Math.max(0.3, d + 0.2);
    kids.push(shape({}, ellipse(cx + w * 0.7 * Math.sin(t), cy - R * 0.85 + (1 - d) * R * 0.1, R * 0.38 * sq, R * 0.32), '#e52521', ol(2)));
  }
  kids.push(shape({}, ellipse(cx, cy - R * 1.25, R * 0.35, R * 0.22), '#e52521', ol(2)));
  kids.push(shine([ellipse(cx - w * 0.45, cy - R * 1.05, R * 0.3, R * 0.12)], 0.8, { rotation: -25 }));
  return kids;
}
function crown(cx, cy, R) {
  const y = cy - R * 0.95;
  return [blob({}, poly([[cx - 9, y + 3], [cx - 10, y - 8], [cx - 5, y - 3], [cx, y - 11], [cx + 5, y - 3], [cx + 10, y - 8], [cx + 9, y + 3]], true, 1), linear(0, y - 11, 0, y + 3, [[0, '#fff09a'], [1, '#e8a800']]), 2),
    blob({}, circle(cx, y - 1, 1.8), '#ff3b6b', 1)];
}

// ---------------------------------------------------------------- torso
function torso(id, c, phi, cx, ty, R) {
  const t = phi * deg; const front = -Math.cos(t); // 1 facing viewer
  const w = R * 1.05, h = R * 0.95;
  const kids = [];
  if (c.shell) {
    // shell on the back
    const sxo = -Math.sin(t) * R * 0.45;
    const shellEl = blob({}, ellipse(cx + sxo, ty + h * 0.45, w * (0.95 + 0.1 * Math.abs(Math.sin(t))), h * 0.75), linear(0, ty, 0, ty + h, [[0, lighten(c.shell, 0.25)], [1, darken(c.shell, 0.2)]]), 2.5);
    if (front > 0) kids.push(shellEl);
    kids.push(blob({}, svg(`M${cx - w} ${ty + h * 1.3} C${cx - w} ${ty + h * 0.2} ${cx - w * 0.5} ${ty} ${cx} ${ty} C${cx + w * 0.5} ${ty} ${cx + w} ${ty + h * 0.2} ${cx + w} ${ty + h * 1.3} Z`), linear(0, ty, 0, ty + h, [[0, lighten(c.shirt, 0.2)], [1, darken(c.shirt, 0.15)]]), 2.5));
    if (front <= 0) {
      kids.push(shellEl);
      if (id === 'bowzer') for (const dx of [-0.45, 0, 0.45]) kids.push(blob({}, poly([[cx + sxo + dx * w - 3, ty + h * 0.55], [cx + sxo + dx * w + 3, ty + h * 0.55], [cx + sxo + dx * w, ty + h * 0.15]], true, 0.8), '#fff4d6', 1.5));
      else kids.push(shape({}, poly([[cx + sxo - 5, ty + h * 0.3], [cx + sxo + 5, ty + h * 0.3], [cx + sxo + 7, ty + h * 0.6], [cx + sxo - 7, ty + h * 0.6]], true, 1), null, ol(1.3, darken(c.shell, 0.35))));
    } else {
      kids.push(blob({}, ellipse(cx + Math.sin(t) * R * 0.2, ty + h * 0.6, w * 0.55, h * 0.5), '#fff4c0', 2));
    }
  } else {
    kids.push(blob({}, svg(`M${cx - w} ${ty + h * 1.3} C${cx - w} ${ty + h * 0.2} ${cx - w * 0.5} ${ty} ${cx} ${ty} C${cx + w * 0.5} ${ty} ${cx + w} ${ty + h * 0.2} ${cx + w} ${ty + h * 1.3} Z`), linear(0, ty, 0, ty + h, [[0, lighten(c.shirt, 0.2)], [1, darken(c.shirt, 0.15)]]), 2.5));
  }
  if (c.overalls) {
    // straps
    for (const a of [-28, 28]) {
      const tt = (phi + a) * deg; const d = -Math.cos(tt);
      const x = cx + w * 0.75 * Math.sin(tt);
      kids.push(shape({}, svg(`M${x} ${ty + 1} L${x + (front > 0 ? 0 : -Math.sign(a) * 2)} ${ty + h * 1.3}`), null, { color: c.overalls, width: 4, cap: 'round' }));
      if (d > 0.3) kids.push(blob({}, circle(x, ty + h * 0.55, 1.8), '#ffd23f', 1));
    }
    if (front > 0.2) kids.push(blob({}, rect(cx + Math.sin(t) * w * 0.4 - w * 0.55 * front, ty + h * 0.6, w * 1.1 * front, h * 0.8, 2), c.overalls, 2));
  }
  if (c.tank) {
    const ww = w * 0.7;
    kids.push(blob({}, svg(`M${cx - ww} ${ty + h * 1.3} L${cx - ww} ${ty + h * 0.3} C${cx - ww * 0.4} ${ty + h * 0.5} ${cx + ww * 0.4} ${ty + h * 0.5} ${cx + ww} ${ty + h * 0.3} L${cx + ww} ${ty + h * 1.3} Z`), '#ffffff', 2));
    if (front > 0.3) kids.push(shape({ x: cx + Math.sin(t) * w * 0.3, y: ty + h * 0.85, scaleX: front }, svg('M-3 -4 L3 -4 L3 2 C3 5 -3 5 -3 2'), null, { color: '#e52521', width: 2, cap: 'round' }));
  }
  if (c.vest) for (const s of [-1, 1]) kids.push(blob({}, svg(`M${cx + s * w} ${ty + h * 1.3} C${cx + s * w} ${ty + h * 0.3} ${cx + s * w * 0.6} ${ty + 1} ${cx + s * w * 0.35} ${ty + 1} L${cx + s * w * 0.35} ${ty + h * 1.3} Z`), '#2a6fe0', 2));
  if (c.collar) {
    kids.push(blob({}, rectC(cx, ty + 1.5, w * 1.2, 5, 2.5), '#2a2030', 2));
    for (const dx of [-0.4, 0, 0.4]) kids.push(blob({}, poly([[cx + dx * w - 2.5, ty], [cx + dx * w + 2.5, ty], [cx + dx * w, ty - 5]], true, 0.5), '#e8e4f0', 1.2));
  }
  if (c.saddle && front <= 0.3) kids.push(blob({}, ellipse(cx - Math.sin(t) * w * 0.3, ty + h * 0.9, w * 0.7, h * 0.35), '#e52521', 2));
  if (c.saddle && front > 0.3) kids.push(blob({}, ellipse(cx + Math.sin(t) * w * 0.2, ty + h * 0.75, w * 0.5, h * 0.5), '#ffffff', 2));
  return kids;
}

/**
 * Driver node: head + torso (+ hands on wheel for front-ish views).
 * phi: facing (0 away, 90 right, 180 toward). (cx, cy) head centre, R head radius.
 * Returns { back: [...], front: [...] } — `front` goes over the kart cowl (wheel + hands).
 */
export function driver(id, phi, cx, cy, R, prefix) {
  const c = C[id];
  const sx = c.head.sx, sy = c.head.sy;
  const behind = [], ahead = [];
  const feats = c.feats.map((f) => ({ f, p: proj(f, phi, cx, cy, R, sx) }));
  for (const { f, p } of feats) {
    if (f.k === 'eye') { if (p.depth > 0.12) ahead.push({ d: p.depth + 0.5, el: drawEye(f, p, R, phi, prefix) }); continue; }
    if (f.k === 'flat') { if (p.depth > 0.1) ahead.push({ d: p.depth + 0.4, el: drawFeature(f, p, R, phi, sx) }); continue; }
    if (f.k === 'cap') { if (p.depth > -0.2) ahead.push({ d: 2, el: drawFeature(f, p, R, phi, sx) }); continue; }
    const el = drawFeature(f, p, R, phi, sx);
    if (f.back || p.depth < 0) behind.push({ d: p.depth, el }); else ahead.push({ d: p.depth + (f.k === 'vol' && (f.r ?? 1) > 1 ? 0.6 : 0), el });
  }
  behind.sort((a, b) => a.d - b.d); ahead.sort((a, b) => a.d - b.d);
  const head = [
    ...behind.map((x) => x.el),
    blob({}, ellipse(cx, cy, R * sx, R * sy), radial(cx - R * 0.35, cy - R * 0.4, R * 1.5, [[0, lighten(c.head.color, 0.3)], [1, darken(c.head.color, 0.12)]]), 2.5),
  ];
  // eyes are named for blinking only in the front views (we don't animate blink here)
  const caps = [];
  if (c.cap) {
    const b = brim(c, cx, cy, R, sx, phi);
    if (b.depth < 0) head.splice(0, 0, b.el); // behind whole head
    caps.push(...capDome(c.cap, cx, cy, R, sx, phi));
    if (b.depth >= 0) caps.push(b.el);
    const em = emblem(c.cap, cx, cy, R, sx, phi); if (em) caps.push(em);
  }
  if (c.mushroom) caps.push(...mushroomCap(cx, cy, R, phi));
  if (c.crown) caps.push(...crown(cx, cy, R));
  // order: behind, head, face features, caps (caps after features except bangs which are 'cap' kind)
  const faceFeats = ahead.map((x) => x.el);
  const headNode = c.cap || c.mushroom ? [...head, ...faceFeats, ...caps] : [...head, ...faceFeats, ...caps];
  const ty = cy + R * sy * 0.82;
  return {
    torso: torso(id, c, phi, cx, ty, R),
    head: headNode,
    gloves: c.gloves,
  };
}

export const DRIVER_SPECS = C;
