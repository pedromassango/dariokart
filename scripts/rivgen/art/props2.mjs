// MK8 "retro track" props (billboards). Anchored bottom-centre unless noted.
import { shape, node, pivot, rect, rectC, ellipse, circle, poly, svg, linear, radial, OUT, ol, alpha, lighten, darken, sineKeys, track, blob, shine, starPts } from './common.mjs';
import { text, NAVY } from './hud.mjs';

const loopSM = (ab, name, dur, tracks) => {
  ab.animation(name, { duration: dur, loop: 'loop' }, tracks);
  ab.stateMachine('Main', { layers: [{ name, states: { [name]: { anim: name } } }] });
};

// ---------------------------------------------------------------- Cloud
function cloud(file) {
  const ab = file.artboard('Cloud', 256, 128);
  const C = [[-78, 14, 28], [-44, -6, 36], [2, -18, 42], [48, -4, 36], [82, 14, 28], [-30, 20, 30], [28, 20, 30]];
  const cx = 128, cy = 80;
  const circles = (dx = 0, dy = 0, dr = 0) => C.map(([x, y, r]) => circle(cx + x + dx, cy + y + dy, r + dr));
  ab.add(pivot(128, 124, { name: 'puff' }, [
    shape({}, circles(), OUT, { color: OUT, width: 8 }),
    shape({}, circles(), '#b4c4e4'),
    shape({}, circles(-3, -8, -5), '#ffffff'),
    shape({}, [ellipse(cx - 30, cy - 36, 22, 9), ellipse(cx - 70, cy - 6, 10, 5)], alpha('#ffffff', 0.9)),
  ]));
  loopSM(ab, 'drift', 240, [
    track('puff', 'scaleX', sineKeys(1, 0.025, 240, 240, 0, 8)),
    track('puff', 'scaleY', sineKeys(1, 0.035, 240, 240, 0.25, 8)),
  ]);
}

// ---------------------------------------------------------------- Ad boards
const BRANDS = [
  { l1: 'DARIO', l2: 'MOTORS', bg: ['#ff4a3a', '#c81010'], stripe: '#ffffff', icon: 'dario', text: { fill: [[0, '#ffffff'], [0.6, '#ffffff'], [1, '#ffd0c8']] } },
  { l1: 'SHROOM', l2: 'FUEL', bg: ['#fff07a', '#ffc61a'], stripe: '#e52521', icon: 'shroom', text: { fill: [[0, '#ffffff'], [0.6, '#ffffff'], [1, '#ffe0a0']], outline: '#8a2a0a' } },
  { l1: 'KOOPA', l2: 'KOLA', bg: ['#5ee05a', '#178a28'], stripe: '#ffffff', icon: 'shell', text: { fill: [[0, '#ffffff'], [0.6, '#ffffff'], [1, '#d0f0c8']] } },
  { l1: 'STAR', l2: 'TIRES', bg: ['#4a8aff', '#1c3fb0'], stripe: '#ffd23f', icon: 'star', text: { fill: [[0, '#fff8c0'], [0.6, '#ffe14a'], [1, '#f0a800']] } },
];
function icon(kind, cx, cy) {
  if (kind === 'dario') return node({}, [
    blob({}, circle(cx, cy, 34), radial(cx - 10, cy - 12, 44, [[0, '#ffffff'], [1, '#e8e4f0']]), 4),
    shape({}, svg(`M${cx - 12} ${cy - 18} L${cx - 2} ${cy - 18} C${cx + 18} ${cy - 18} ${cx + 18} ${cy + 18} ${cx - 2} ${cy + 18} L${cx - 12} ${cy + 18} Z`), null, [{ color: NAVY, width: 14, join: 'round' }, { color: '#e52521', width: 8, join: 'round' }]),
  ]);
  if (kind === 'shroom') return node({}, [
    blob({}, svg(`M${cx - 14} ${cy + 2} C${cx - 16} ${cy + 18} ${cx - 12} ${cy + 30} ${cx} ${cy + 30} C${cx + 12} ${cy + 30} ${cx + 16} ${cy + 18} ${cx + 14} ${cy + 2} Z`), '#fff6e0', 4),
    blob({}, [ellipse(cx - 5, cy + 14, 2.5, 4.5), ellipse(cx + 5, cy + 14, 2.5, 4.5)], OUT, 0),
    blob({}, svg(`M${cx - 34} ${cy + 6} C${cx - 36} ${cy - 22} ${cx - 18} ${cy - 34} ${cx} ${cy - 34} C${cx + 18} ${cy - 34} ${cx + 36} ${cy - 22} ${cx + 34} ${cy + 6} C${cx + 20} ${cy + 12} ${cx - 20} ${cy + 12} ${cx - 34} ${cy + 6} Z`), linear(0, cy - 34, 0, cy + 10, [[0, '#ff6a4d'], [1, '#b0150f']]), 4),
    shape({}, [circle(cx, cy - 18, 8), ellipse(cx - 22, cy - 4, 6, 7), ellipse(cx + 22, cy - 4, 6, 7)], '#ffffff', ol(2.5)),
  ]);
  if (kind === 'shell') return node({}, [
    blob({}, svg(`M${cx - 34} ${cy + 10} C${cx - 34} ${cy + 2} ${cx + 34} ${cy + 2} ${cx + 34} ${cy + 10} L${cx + 34} ${cy + 16} C${cx + 34} ${cy + 26} ${cx - 34} ${cy + 26} ${cx - 34} ${cy + 16} Z`), '#ffffff', 4),
    blob({}, svg(`M${cx - 31} ${cy + 10} C${cx - 31} ${cy - 18} ${cx - 16} ${cy - 30} ${cx} ${cy - 30} C${cx + 16} ${cy - 30} ${cx + 31} ${cy - 18} ${cx + 31} ${cy + 10} Z`), linear(0, cy - 30, 0, cy + 10, [[0, '#7be86a'], [1, '#167a24']]), 4),
    shape({}, poly([[cx - 9, cy - 22], [cx + 9, cy - 22], [cx + 14, cy - 7], [cx, cy + 2], [cx - 14, cy - 7]], true, 2), '#9ff090', ol(2.5, '#0e5a18')),
    shape({}, [ellipse(cx - 14, cy - 20, 6, 3)], alpha('#ffffff', 0.7)),
  ]);
  return node({}, [ // star
    blob({}, poly(starPts(cx, cy + 2, 36, 16, 5, -90, 4)), linear(0, cy - 34, 0, cy + 36, [[0, '#fff27a'], [1, '#ffb000']]), 4),
    blob({}, [ellipse(cx - 7, cy, 3.2, 7), ellipse(cx + 7, cy, 3.2, 7)], OUT, 0),
  ]);
}
function adBoards(file) {
  BRANDS.forEach((b, i) => {
    const ab = file.artboard('AdBoard_' + (i + 1), 320, 120);
    const inner = rect(8, 8, 304, 104, 8);
    const lines = [b.l1, b.l2].map((l) => text(l, b.text));
    const sc = Math.min(0.66, ...lines.map((t) => 184 / t.width));
    const tx = 112 + (192 - Math.max(...lines.map((t) => t.width)) * sc) / 2;
    const stripes = [];
    for (let k = -4; k < 14; k++) stripes.push(poly([[k * 30, 120], [k * 30 + 12, 120], [k * 30 + 72, 0], [k * 30 + 60, 0]]));
    ab.add(
      shape({}, rect(0, 0, 320, 120), OUT),
      shape({ name: 'face' }, inner, linear(0, 8, 0, 112, [[0, b.bg[0]], [1, b.bg[1]]])),
      node({ clip: 'face' }, [
        shape({}, stripes, alpha(b.stripe, 0.14)),
        shape({}, rect(0, 8, 320, 30), alpha('#ffffff', 0.18)),
        shape({ name: 'sheen', x: -80, rotation: 22 }, rect(-14, -60, 28, 260), alpha('#ffffff', 0.35)),
      ]),
      icon(b.icon, 56, 60),
      node({ x: tx, y: 6, scale: sc }, lines[0].nodes),
      node({ x: tx, y: 6 + 64 * sc - 10 * sc + 4, scale: sc }, lines[1].nodes),
      shape({}, inner, null, { color: '#ffffff', width: 3 }),
      shape({}, rect(2, 2, 316, 116, 10), null, ol(4, '#2a2030')),
      shape({}, [circle(16, 16, 3), circle(304, 16, 3), circle(16, 104, 3), circle(304, 104, 3)], '#c8c0d0', ol(1.5)),
    );
    loopSM(ab, 'sheen', 240, [track('sheen', 'x', [[0, -80, 'hold'], [150, -80, 'easeIn'], [200, 420, 'hold'], [240, 420, 'hold']])]);
  });
}

// ---------------------------------------------------------------- Flag (segmented waving pennant)
function flag(file) {
  const ab = file.artboard('Flag', 64, 160);
  const segs = 4, segW = 11, h0 = 40;
  const D = 60;
  const tracks = [];
  // pennant height tapers from h0 at the pole to ~8 at the tip
  const hAt = (k) => h0 - (h0 - 8) * (k / segs);
  const chain = (prefix, draw) => {
    let inner = null;
    for (let k = segs - 1; k >= 0; k--) {
      const x0 = 0, x1 = segW + 1, y0 = hAt(k) / 2, y1 = hAt(k + 1) / 2;
      const piece = poly([[x0, -y0], [x1, -y1], [x1, y1], [x0, y0]], true, 0);
      const kids = [draw(piece, k)];
      if (inner) kids.push(inner);
      inner = node({ name: prefix + k, x: k === 0 ? 0 : segW }, kids);
      tracks.push(track(prefix + k, 'rotation', sineKeys(0, 6 + k * 3, D, D, -k * 0.18, 3)));
    }
    return inner;
  };
  const colors = ['#e52521', '#ffffff', '#e52521', '#ffffff'];
  const outlineChain = chain('o', (p) => shape({}, p, OUT, { color: OUT, width: 7, join: 'round' }));
  const fillChain = chain('f', (p, k) => shape({}, p, linear(0, -20, 0, 20, [[0, lighten(colors[k], 0.15)], [1, darken(colors[k], 0.12)]])));
  ab.add(
    shape({ x: 20, y: 157 }, ellipse(0, 0, 14, 2.5), alpha(OUT, 0.3)),
    blob({}, rect(15, 8, 7, 150, 3.5), linear(15, 0, 22, 0, [[0, '#f0eaf8'], [1, '#8a8294']]), 2.5),
    blob({}, rect(10, 146, 17, 11, 3), '#5a5464', 2.5),
    node({ x: 21, y: 34 }, [outlineChain]),
    node({ x: 21, y: 34 }, [fillChain]),
    blob({}, circle(18.5, 8, 6), linear(0, 2, 0, 14, [[0, '#fff09a'], [1, '#e8a800']]), 2.5),
  );
  loopSM(ab, 'wave', D, tracks);
}

// ---------------------------------------------------------------- Lamp
function lamp(file) {
  const ab = file.artboard('Lamp', 64, 200);
  const metal = (x1, x2) => linear(x1, 0, x2, 0, [[0, '#5a6274'], [0.35, '#c8d0e0'], [1, '#3a4254']]);
  ab.add(
    shape({ x: 32, y: 197 }, ellipse(0, 0, 18, 3), alpha(OUT, 0.3)),
    shape({ name: 'halo', x: 32, y: 24 }, ellipse(0, 0, 32, 24), radial(0, 0, 32, [[0, alpha('#fff6c0', 0.85)], [1, alpha('#fff6c0', 0)]])),
    blob({}, rect(28, 40, 8, 148, 3), metal(28, 36), 3),
    blob({}, svg('M20 198 L22 182 L42 182 L44 198 Z'), metal(20, 44), 3),
    blob({}, rect(24, 120, 16, 6, 2), metal(24, 40), 2),
    blob({}, svg('M14 36 L50 36 L46 44 L18 44 Z'), metal(14, 50), 3),
    blob({}, rect(8, 10, 48, 28, 6), linear(0, 10, 0, 38, [[0, '#6a7284'], [1, '#2a3040']]), 3),
    shape({ name: 'bulbs' }, [rect(13, 15, 11, 18, 3), rect(26.5, 15, 11, 18, 3), rect(40, 15, 11, 18, 3)], linear(0, 15, 0, 33, [[0, '#ffffff'], [1, '#ffe88a']]), ol(2)),
    shape({}, [rect(14.5, 16.5, 4, 6, 2), rect(28, 16.5, 4, 6, 2), rect(41.5, 16.5, 4, 6, 2)], alpha('#ffffff', 0.9)),
  );
  loopSM(ab, 'glow', 120, [track('halo', 'opacity', sineKeys(0.85, 0.15, 60, 120, 0, 6))]);
}

// ---------------------------------------------------------------- Cactus (tube strokes)
function cactus(file) {
  const ab = file.artboard('Cactus', 64, 112);
  const body = [svg('M32 106 L32 22'), svg('M32 70 L20 70 C14 70 13 66 13 60 L13 42'), svg('M32 58 L44 58 C50 58 51 54 51 48 L51 32')];
  const ribs = [svg('M28 104 L28 24'), svg('M36 104 L36 24'), svg('M10 60 L10 44'), svg('M54 48 L54 34')];
  ab.add(
    shape({ x: 32, y: 108 }, ellipse(0, 0, 20, 3), alpha(OUT, 0.3)),
    pivot(32, 108, { name: 'sway' }, [
      shape({}, body, null, [{ color: OUT, width: 22, cap: 'round', join: 'round' }, { color: '#3fae4a', width: 15, cap: 'round', join: 'round' }]),
      shape({}, body, null, { color: '#5ed06a', width: 6, cap: 'round', join: 'round' }),
      shape({}, ribs, null, { color: alpha('#1c6a28', 0.55), width: 1.6, cap: 'round' }),
      shape({}, [svg('M30 30 L30 96')], null, { color: alpha('#ffffff', 0.4), width: 2.5, cap: 'round' }),
      blob({}, [circle(28, 16, 4), circle(36, 16, 4), circle(32, 12, 4)], '#ff7fc4', 2),
      blob({}, circle(32, 16, 2.5), '#ffd23f', 1),
      shape({}, svg('M26 106 L38 106'), null, { color: OUT, width: 3 }),
    ]),
  );
  loopSM(ab, 'idle', 180, [track('sway', 'rotation', sineKeys(0, 1.2, 180, 180, 0, 8))]);
}

// ---------------------------------------------------------------- Boo
function boo(file) {
  const ab = file.artboard('Boo', 96, 96);
  const body = svg('M48 12 C70 12 84 28 84 50 C84 64 80 72 76 78 C70 76 66 82 60 80 C54 84 50 80 46 84 C40 82 36 86 30 82 C24 84 18 80 16 74 C12 66 12 58 12 50 C12 28 26 12 48 12 Z');
  ab.add(
    shape({ name: 'shadow', x: 48, y: 92 }, ellipse(0, 0, 24, 3.5), alpha(OUT, 0.25)),
    pivot(48, 50, { name: 'ghost' }, [
      blob({}, body, radial(38, 30, 66, [[0, '#ffffff'], [0.7, '#f0f0fa'], [1, '#c8c8e0']]), 3.5),
      shape({}, svg('M22 74 C30 78 40 76 46 72 M50 74 C58 78 66 76 72 70'), null, { color: alpha('#a0a0c8', 0.5), width: 2, cap: 'round' }),
      // tongue + mouth
      blob({}, svg('M40 58 C44 66 54 66 58 58 C52 60 46 60 40 58 Z'), '#7a1a2a', 2.5),
      blob({}, ellipse(52, 63, 4, 4), '#ff6a8a', 1.5),
      // eyes peeking + blush
      blob({ name: 'eyes' }, [ellipse(37, 40, 3.2, 6), ellipse(59, 40, 3.2, 6)], OUT, 0),
      shape({}, [ellipse(30, 52, 6, 3.5), ellipse(66, 52, 6, 3.5)], alpha('#ff7aa0', 0.6)),
      // shy hands
      blob({ name: 'handL' }, ellipse(36, 49, 11, 8.5), '#ffffff', 3),
      blob({ name: 'handR' }, ellipse(60, 49, 11, 8.5), '#ffffff', 3),
      shape({}, [ellipse(30, 26, 12, 6)], alpha('#ffffff', 0.9)),
    ]),
  );
  loopSM(ab, 'float', 120, [
    track('ghost', 'y', sineKeys(48, -5, 120, 120, 0, 5)),
    track('ghost', 'rotation', sineKeys(0, 4, 120, 120, 0.25, 6)),
    track('shadow', 'scaleX', sineKeys(0.9, 0.1, 120, 120, 0.5, 6)),
    // hands cover the face, then peel away to peek, then cover again
    track('handL', 'x', [[0, 0, 'hold'], [40, 0], [52, -15, 'hold'], [96, -15], [108, 0, 'hold'], [120, 0, 'hold']]),
    track('handR', 'x', [[0, 0, 'hold'], [40, 0], [52, 15, 'hold'], [96, 15], [108, 0, 'hold'], [120, 0, 'hold']]),
    track('handL', 'y', [[0, 0, 'hold'], [40, 0], [52, 12, 'hold'], [96, 12], [108, 0, 'hold'], [120, 0, 'hold']]),
    track('handR', 'y', [[0, 0, 'hold'], [40, 0], [52, 12, 'hold'], [96, 12], [108, 0, 'hold'], [120, 0, 'hold']]),
  ]);
}

// ---------------------------------------------------------------- Piranha
function piranha(file) {
  const ab = file.artboard('Piranha', 64, 128);
  const pipeG = (x1, x2) => linear(x1, 0, x2, 0, [[0, '#1c7a28'], [0.18, '#7be86a'], [0.32, '#3fcf4a'], [0.75, '#2fae3c'], [1, '#145c1c']]);
  const hx = 32, hy = 34; // head centre
  const spots = (pts) => shape({}, pts.map(([x, y, r]) => circle(x, y, r)), '#ffffff', ol(1.5));
  const upper = pivot(hx - 14, hy + 2, { name: 'jawU' }, [
    blob({}, svg(`M${hx - 18} ${hy + 2} C${hx - 20} ${hy - 20} ${hx + 18} ${hy - 22} ${hx + 20} ${hy + 2} Z`), radial(hx - 6, hy - 12, 30, [[0, '#ff6a4d'], [1, '#b8140f']]), 3),
    shape({}, [poly([[hx - 12, hy + 1], [hx - 8, hy + 1], [hx - 10, hy + 6]], true, 0.5), poly([[hx - 2, hy + 1], [hx + 2, hy + 1], [hx, hy + 6]], true, 0.5), poly([[hx + 8, hy + 1], [hx + 12, hy + 1], [hx + 10, hy + 6]], true, 0.5)], '#ffffff', ol(1.2)),
    spots([[hx - 8, hy - 10, 3.5], [hx + 7, hy - 12, 3], [hx + 13, hy - 3, 2.5], [hx - 15, hy - 3, 2.2]]),
  ]);
  const lower = pivot(hx - 14, hy + 2, { name: 'jawL' }, [
    blob({}, svg(`M${hx - 18} ${hy + 2} C${hx - 18} ${hy + 18} ${hx + 18} ${hy + 18} ${hx + 20} ${hy + 2} Z`), radial(hx, hy + 8, 22, [[0, '#ff6a4d'], [1, '#b8140f']]), 3),
    shape({}, [poly([[hx - 7, hy + 3], [hx - 3, hy + 3], [hx - 5, hy - 2]], true, 0.5), poly([[hx + 3, hy + 3], [hx + 7, hy + 3], [hx + 5, hy - 2]], true, 0.5)], '#ffffff', ol(1.2)),
    spots([[hx + 6, hy + 10, 2.5]]),
  ]);
  ab.add(
    shape({ x: 32, y: 126 }, ellipse(0, 0, 24, 2.5), alpha(OUT, 0.3)),
    pivot(32, 82, { name: 'plant' }, [
      shape({}, svg('M32 84 C30 70 34 60 32 46'), null, [{ color: OUT, width: 10, cap: 'round' }, { color: '#2fae3c', width: 5, cap: 'round' }]),
      blob({}, [svg('M31 74 C22 64 12 66 8 72 C16 76 24 78 31 74 Z'), svg('M33 70 C42 60 52 62 56 68 C48 72 40 74 33 70 Z')], linear(0, 60, 0, 78, [[0, '#7be86a'], [1, '#1c8a2c']]), 2.5),
      pivot(hx, hy + 10, { name: 'head' }, [
        blob({}, ellipse(hx + 1, hy + 2, 16, 10), '#5a0a14', 2),
        lower, upper,
      ]),
    ]),
    blob({}, rect(12, 92, 40, 34, 2), pipeG(12, 52), 3),
    shape({}, rect(17, 96, 3.5, 26, 1.5), alpha('#ffffff', 0.55)),
    blob({}, rect(8, 80, 48, 16, 3), pipeG(8, 56), 3),
    shape({}, rect(12, 82.5, 4, 11, 2), alpha('#ffffff', 0.6)),
  );
  const D = 48;
  loopSM(ab, 'snap', D, [
    track('jawU', 'rotation', [[0, -6], [8, -34, 'easeIn'], [12, -2], [24, -6], [32, -30, 'easeIn'], [36, -2], [D, -6]]),
    track('jawL', 'rotation', [[0, 4], [8, 22, 'easeIn'], [12, 2], [24, 4], [32, 20, 'easeIn'], [36, 2], [D, 4]]),
    track('head', 'rotation', sineKeys(0, 8, D, D, 0, 4)),
    track('plant', 'rotation', sineKeys(0, 3, D, D, 0.2, 4)),
  ]);
}

// ---------------------------------------------------------------- Penguin
function penguin(file) {
  const ab = file.artboard('Penguin', 64, 80);
  const foot = (n, x) => blob({ name: n }, ellipse(x, 74, 7, 3.5), '#ff9a1a', 2);
  ab.add(
    shape({ x: 32, y: 76 }, ellipse(0, 0, 18, 3), alpha(OUT, 0.3)),
    foot('footL', 25), foot('footR', 39),
    pivot(32, 74, { name: 'body' }, [
      pivot(14, 44, { name: 'flipL', rotation: 15 }, [blob({}, svg('M16 38 C8 44 6 54 8 60 C12 56 16 50 18 44 Z'), '#26305a', 2.5)]),
      pivot(50, 44, { name: 'flipR', rotation: -15 }, [blob({}, svg('M48 38 C56 44 58 54 56 60 C52 56 48 50 46 44 Z'), '#26305a', 2.5)]),
      blob({}, svg('M32 10 C46 10 52 24 52 44 C52 62 44 72 32 72 C20 72 12 62 12 44 C12 24 18 10 32 10 Z'), radial(26, 24, 50, [[0, '#4a5a8a'], [1, '#1a2040']]), 3),
      blob({}, svg('M32 26 C42 26 46 38 46 50 C46 62 40 69 32 69 C24 69 18 62 18 50 C18 38 22 26 32 26 Z'), linear(0, 26, 0, 69, [[0, '#ffffff'], [1, '#d8e4f4']]), 2),
      blob({}, [ellipse(25, 24, 5.5, 6.5), ellipse(39, 24, 5.5, 6.5)], '#ffffff', 2),
      shape({}, [ellipse(26, 25, 2.6, 3.4), ellipse(38, 25, 2.6, 3.4)], OUT),
      shine([ellipse(25.2, 23.6, 0.9, 1.1), ellipse(37.2, 23.6, 0.9, 1.1)], 1),
      blob({}, svg('M26 31 L38 31 L32 38 Z'), '#ffb02e', 2),
      shape({}, [ellipse(20, 33, 4, 2.5), ellipse(44, 33, 4, 2.5)], alpha('#ff8fb0', 0.5)),
      // scarf
      blob({}, svg('M17 40 C24 44 40 44 47 40 L47 45 C40 49 24 49 17 45 Z M40 44 L44 56 L38 56 L36 46 Z'), '#e52521', 2),
      shine([ellipse(22, 16, 4, 2)], 0.4, { rotation: -25 }),
    ]),
  );
  const D = 40;
  loopSM(ab, 'waddle', D, [
    track('body', 'rotation', sineKeys(0, 7, D, D, 0, 4)),
    track('body', 'y', [[0, 74], [D / 4, 72], [D / 2, 74], [(3 * D) / 4, 72], [D, 74]]),
    track('footL', 'y', [[0, 0], [D / 4, -3], [D / 2, 0, 'hold'], [D, 0]]),
    track('footR', 'y', [[0, 0, 'hold'], [D / 2, 0], [(3 * D) / 4, -3], [D, 0]]),
    track('flipL', 'rotation', sineKeys(15, 12, D / 2, D, 0, 4)),
    track('flipR', 'rotation', sineKeys(-15, -12, D / 2, D, 0, 4)),
  ]);
}

// ---------------------------------------------------------------- IceBlock
function iceBlock(file) {
  const ab = file.artboard('IceBlock', 96, 96);
  const front = poly([[12, 30], [70, 30], [70, 92], [12, 92]], true, 4);
  const top = poly([[12, 30], [28, 12], [86, 12], [70, 30]], true, 3);
  const side = poly([[70, 30], [86, 12], [86, 74], [70, 92]], true, 3);
  ab.add(
    shape({ x: 50, y: 93 }, ellipse(0, 0, 40, 3), alpha(OUT, 0.25)),
    shape({ name: 'frontFace' }, front, linear(12, 30, 70, 92, [[0, alpha('#e8fbff', 0.95)], [0.5, alpha('#9be4ff', 0.85)], [1, alpha('#4ab0e8', 0.9)]])),
    shape({}, top, linear(0, 12, 0, 30, [[0, alpha('#ffffff', 0.98)], [1, alpha('#c8f2ff', 0.95)]])),
    shape({}, side, linear(70, 0, 86, 0, [[0, alpha('#5ac0f0', 0.9)], [1, alpha('#2a80c8', 0.9)]])),
    node({ clip: 'frontFace' }, [
      shape({}, [svg('M24 44 L34 58 L30 72 M50 40 L44 54'), svg('M58 70 L52 82')], null, { color: alpha('#ffffff', 0.7), width: 2, cap: 'round' }),
      shape({ name: 'glint', x: -30, rotation: 30 }, rect(-6, -20, 12, 140), alpha('#ffffff', 0.55)),
      shape({}, poly([[16, 34], [34, 34], [16, 52]], true, 2), alpha('#ffffff', 0.6)),
    ]),
    shape({}, [front, top, side], null, { color: '#16305a', width: 3.5, join: 'round' }),
    shape({}, svg('M15 33 L67 33'), null, { color: alpha('#ffffff', 0.9), width: 2, cap: 'round' }),
  );
  loopSM(ab, 'glint', 180, [track('glint', 'x', [[0, -30, 'hold'], [120, -30, 'easeIn'], [150, 110, 'hold'], [180, 110, 'hold']])]);
}

export function buildProps2(file) {
  iceBlock(file);
  cloud(file); adBoards(file); flag(file); lamp(file); cactus(file); boo(file); piranha(file); penguin(file);
}
