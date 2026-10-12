// MK8-style HUD: stroked-skeleton italic font, place badges, item slot, lap label, start banner.
//
// Font construction: each glyph is a centre-line skeleton (SVG path data) in a
// box where the cap line is y=18 and the baseline centre-line is y=50. It is
// drawn as three stacked strokes with round caps/joins: a navy drop shadow
// (offset +3), a navy outline (W + 2*O) and the white body (W) with a subtle
// vertical gradient (bottom shading). Body bottom edge = 50 + W/2 = 56 = baseline.
import { shape, node, pivot, rect, rectC, ellipse, circle, poly, svg, linear, radial, OUT, ol, alpha, lighten, darken, sineKeys, track, blob, shine } from './common.mjs';
import { LETTERS } from './logo.mjs';

export const NAVY = '#141a40';
const W = 12;      // body stroke width
const O = 3.5;     // outline thickness (each side)
const SKEW = 0.14; // italic: x += (50 - y) * SKEW
const BEAR = 4;    // side bearing
const PAD = W / 2 + O + BEAR;

const SK = {
  '0': 'M11 18 C19 18 22 25 22 34 C22 43 19 50 11 50 C3 50 0 43 0 34 C0 25 3 18 11 18 Z',
  '1': 'M1 24 L9 18 L9 50',
  '2': 'M1 24 C2 19 6 18 11 18 C17 18 21 21 21 26 C21 32 16 35 11 39 L1 50 L22 50',
  '3': 'M1 22 C3 19 7 18 11 18 C17 18 21 21 21 26 C21 31 16 33 11 33 C17 33 22 36 22 42 C22 47 17 50 11 50 C6 50 2 49 0 46',
  '4': 'M15 50 L15 18 L0 40 L22 40',
  '5': 'M20 18 L4 18 L2 32 C5 31 8 30 11 30 C18 30 22 34 22 40 C22 46 17 50 11 50 C6 50 2 48 0 46',
  '6': 'M19 19 C16 18 14 18 12 18 C4 18 0 26 0 36 C0 45 4 50 11 50 C18 50 22 46 22 40 C22 34 18 31 12 31 C6 31 2 34 0 37',
  '7': 'M0 18 L22 18 L8 50',
  '8': 'M11 33 C5 33 2 30 2 25.5 C2 21 6 18 11 18 C16 18 20 21 20 25.5 C20 30 17 33 11 33 C4 33 0 37 0 41.5 C0 47 5 50 11 50 C17 50 22 47 22 41.5 C22 37 18 33 11 33 Z',
  '9': 'M3 49 C6 50 8 50 10 50 C18 50 22 42 22 32 C22 23 18 18 11 18 C4 18 0 22 0 28 C0 34 4 37 10 37 C16 37 20 34 22 31',
  A: 'M0 50 L11 18 L22 50 M4 39 L18 39',
  B: 'M0 50 L0 18 L11 18 C17 18 20 21 20 25.5 C20 30 17 33 11 33 L0 33 M11 33 C18 33 22 36 22 41.5 C22 47 18 50 11 50 L0 50',
  C: 'M21 22 C18 19 15 18 12 18 C4 18 0 25 0 34 C0 43 4 50 12 50 C15 50 18 49 21 46',
  D: 'M0 18 L0 50 L9 50 C18 50 22 43 22 34 C22 25 18 18 9 18 Z',
  E: 'M20 18 L0 18 L0 50 L20 50 M0 34 L16 34',
  F: 'M20 18 L0 18 L0 50 M0 34 L16 34',
  G: 'M21 22 C18 19 15 18 12 18 C4 18 0 25 0 34 C0 43 4 50 12 50 C18 50 22 46 22 40 L22 35 L13 35',
  H: 'M0 18 L0 50 M22 18 L22 50 M0 34 L22 34',
  I: 'M0 18 L0 50',
  J: 'M18 18 L18 40 C18 47 14 50 9 50 C4 50 1 47 0 43',
  K: 'M0 18 L0 50 M21 18 L3 36 M8 31 L22 50',
  L: 'M0 18 L0 50 L19 50',
  M: 'M0 50 L0 18 L13 36 L26 18 L26 50',
  N: 'M0 50 L0 18 L22 50 L22 18',
  O: 'M12 18 C21 18 24 25 24 34 C24 43 21 50 12 50 C3 50 0 43 0 34 C0 25 3 18 12 18 Z',
  P: 'M0 50 L0 18 L11 18 C17 18 21 21 21 26.5 C21 32 17 35 11 35 L0 35',
  Q: 'M12 18 C21 18 24 25 24 34 C24 43 21 50 12 50 C3 50 0 43 0 34 C0 25 3 18 12 18 Z M15 42 L25 52',
  R: 'M0 50 L0 18 L11 18 C17 18 21 21 21 26.5 C21 32 17 35 11 35 L0 35 M10 35 L22 50',
  S: 'M20 21 C17 19 14 18 11 18 C5 18 1 21 1 25.5 C1 30 5 32 11 34 C17 36 21 38 21 42.5 C21 47 17 50 11 50 C7 50 3 49 0 46',
  T: 'M0 18 L22 18 M11 18 L11 50',
  U: 'M0 18 L0 39 C0 46 4 50 11 50 C18 50 22 46 22 39 L22 18',
  V: 'M0 18 L11 50 L22 18',
  W: 'M0 18 L6 50 L14 28 L22 50 L28 18',
  X: 'M0 18 L22 50 M22 18 L0 50',
  Y: 'M0 18 L11 34 L22 18 M11 34 L11 50',
  Z: 'M1 18 L22 18 L0 50 L22 50',
  ':': 'M0 27 L0 27.2 M0 49.8 L0 50',
  '"': 'M0 16 L0 25 M15 16 L15 25',
  "'": 'M0 16 L0 25',
  '/': 'M16 18 L0 50',
  '.': 'M0 49.8 L0 50',
  x: 'M0 31 L14 49 M14 31 L0 49',
  '-': 'M0 36 L13 36',
  '!': 'M0 18 L0 38 M0 49.8 L0 50',
  '?': 'M1 23 C3 19 7 18 11 18 C17 18 21 21 21 26 C21 32 12 33 12 40 M12 49.8 L12 50',
  // lowercase used by the place badges (ordinal suffixes)
  s: 'M14 31 C12 30 10 30 7 30 C3 30 1 32 1 35 C1 38 4 39 7 40 C11 41 14 42 14 45 C14 48 11 50 7 50 C4 50 2 49 0 48',
  t: 'M5 21 L5 45 C5 48 7 50 10 50 L12 50 M0 30 L12 30',
  n: 'M0 50 L0 30 M0 37 C2 32 5 30 9 30 C13 30 15 33 15 37 L15 50',
  d: 'M15 18 L15 50 M15 40 C15 34 12 30 8 30 C3 30 0 34 0 40 C0 46 3 50 8 50 C12 50 15 46 15 40',
  r: 'M0 50 L0 30 M0 37 C2 32 6 30 11 30',
  h: 'M0 18 L0 50 M0 36 C2 32 5 30 9 30 C13 30 15 33 15 37 L15 50',
};
export const GLYPH_NAMES = { ':': 'colon', '"': 'quote', "'": 'apos', '/': 'slash', '.': 'dot', x: 'x', '-': 'dash', '!': 'excl', '?': 'qmark' };

const skewPt = ([x, y]) => [x + (50 - y) * SKEW, y];
function glyphPaths(c) {
  const paths = svg(SK[c]);
  for (const p of paths) for (const v of p.verts) {
    [v.x, v.y] = skewPt([v.x, v.y]);
    if (v.in) v.in = skewPt(v.in);
    if (v.out) v.out = skewPt(v.out);
  }
  let min = Infinity, max = -Infinity;
  for (const p of paths) for (const v of p.verts) for (const q of [[v.x], v.in ? [v.in[0]] : [], v.out ? [v.out[0]] : []].flat()) { min = Math.min(min, q); max = Math.max(max, q); }
  return { paths, min, max };
}
export function glyphMetrics(c) {
  const g = glyphPaths(c);
  return { ...g, width: Math.ceil(g.max - g.min + 2 * PAD), dx: PAD - g.min };
}

const WHITE_FILL = [[0, '#ffffff'], [0.55, '#ffffff'], [1, '#c4d0f4']];
/**
 * Draw a glyph whose box origin is (x, 0) (box height 64, baseline y=56).
 * opts: { fill: stops, outline, shadow, fillName (prefix for named stops) }
 */
export function glyph(c, x = 0, opts = {}) {
  const m = glyphMetrics(c);
  const outline = opts.outline ?? NAVY;
  const stops = (opts.fill ?? WHITE_FILL).map(([p, col], i) => [p, col, opts.stopNames?.[i]]);
  const paths = () => glyphPaths(c).paths;
  const grad = opts.grad ?? [0, 14, 0, 58];
  return node({ x: x + m.dx }, [
    shape({ y: 3 }, paths(), null, { color: opts.shadow ?? outline, width: W + 2 * O, cap: 'round', join: 'round' }),
    shape({}, paths(), null, { color: outline, width: W + 2 * O, cap: 'round', join: 'round' }),
    shape({}, paths(), null, { type: 'linear', x1: grad[0], y1: grad[1], x2: grad[2], y2: grad[3], stops, width: W, cap: 'round', join: 'round' }),
  ]);
}
/** Lay out a string; returns { nodes, width }. Kerning tightens by `track` px. */
export function text(str, opts = {}, trackPx = -6) {
  const nodes = []; let x = 0;
  [...str].forEach((c, i) => {
    if (c === ' ') { x += 16; return; }
    const m = glyphMetrics(c);
    nodes.push(glyph(c, x, { ...opts, stopNames: opts.stopNamesFor?.(i) }));
    x += m.width + trackPx;
  });
  return { nodes, width: x - trackPx };
}

const still = (ab) => {
  ab.animation('idle', { duration: 60, loop: 'loop' }, []);
  ab.stateMachine('Main', { layers: [{ name: 'idle', states: { idle: { anim: 'idle' } } }] });
};

// ---------------------------------------------------------------- glyph artboards
export const GLYPH_CHARS = [...'0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ', ':', '"', "'", '/', '.', 'x', '-', '!', '?'];
export function buildGlyphs(file) {
  const widths = {};
  for (const c of GLYPH_CHARS) {
    const m = glyphMetrics(c);
    const name = 'Glyph_' + (GLYPH_NAMES[c] ?? c);
    const ab = file.artboard(name, m.width, 64);
    ab.add(glyph(c, 0));
    still(ab);
    widths[c] = m.width;
    if (c === 'x') widths['×'] = m.width;
  }
  widths[' '] = 16;
  return widths;
}

// ---------------------------------------------------------------- place badges
const PLACE = {
  gold: { fill: [[0, '#fffbd0'], [0.35, '#ffe14a'], [0.7, '#ffb000'], [1, '#c87800']], outline: NAVY },
  silver: { fill: [[0, '#ffffff'], [0.35, '#eef2f8'], [0.7, '#b8c2d0'], [1, '#7a8494']], outline: NAVY },
  bronze: { fill: [[0, '#ffe0c0'], [0.35, '#f0a060'], [0.7, '#c86a2a'], [1, '#7a3a10']], outline: NAVY },
  blue: { fill: [[0, '#ffffff'], [0.35, '#ffffff'], [0.7, '#dfe8ff'], [1, '#9ab4f0']], outline: '#1f4fd0', shadow: NAVY },
};
const SUFFIX = ['st', 'nd', 'rd', 'th', 'th', 'th', 'th', 'th'];
export function buildPlaces(file) {
  for (let n = 1; n <= 8; n++) {
    const ab = file.artboard('Place_' + n, 160, 110);
    const st = n === 1 ? PLACE.gold : n === 2 ? PLACE.silver : n === 3 ? PLACE.bronze : PLACE.blue;
    // shine: 4 named stops sweep diagonally across the number
    const shineFill = [[0, st.fill[0][1]], [0.3, st.fill[1][1]], [0.33, '#ffffff'], [0.36, st.fill[2][1]], [1, st.fill[3][1]]];
    const num = glyph(String(n), 0, { fill: shineFill, outline: st.outline, shadow: st.shadow, stopNames: [null, 'sA', 'sB', 'sC'], grad: [-10, 10, 40, 64] });
    const nm = glyphMetrics(String(n));
    const suf = text(SUFFIX[n - 1], { fill: st.fill, outline: st.outline, shadow: st.shadow }, -15);
    const S1 = 1.62, S2 = 0.8;
    const totalW = nm.width * S1 + suf.width * S2 - 14;
    const x0 = (160 - totalW) / 2;
    // baseline of number at y=56*S1 + top; we want baseline ~ y=100
    const top = 100 - 56 * S1;
    const badge = pivot(80, 100, { name: 'badge' }, [
      node({ x: x0, y: top, scale: S1 }, [num]),
      node({ x: x0 + nm.width * S1 - 14, y: 100 - 56 * S2, scale: S2 }, suf.nodes),
    ]);
    ab.add(shape({ x: 80, y: 104 }, ellipse(0, 0, 56, 4), alpha(NAVY, 0.25)), badge);
    const D = 150;
    ab.animation('shine', { duration: D, loop: 'loop' }, [
      track('sA', 'stopPos', [[0, 0.3, 'hold'], [80, 0.3, 'linear'], [110, 0.86, 'hold'], [D, 0.86, 'hold']]),
      track('sB', 'stopPos', [[0, 0.33, 'hold'], [80, 0.33, 'linear'], [110, 0.9, 'hold'], [D, 0.9, 'hold']]),
      track('sC', 'stopPos', [[0, 0.36, 'hold'], [80, 0.36, 'linear'], [110, 0.94, 'hold'], [D, 0.94, 'hold']]),
    ]);
    ab.animation('rest', { duration: 1, loop: 'oneShot' }, [
      track('badge', 'scaleX', [[0, 1]], 'hold'), track('badge', 'scaleY', [[0, 1]], 'hold'), track('badge', 'rotation', [[0, 0]], 'hold'),
    ]);
    ab.animation('pop', { duration: 24, loop: 'oneShot' }, [
      track('badge', 'scaleX', [[0, 1, 'easeOut'], [6, 1.35, 'ease'], [13, 0.9, 'ease'], [19, 1.06, 'ease'], [24, 1]]),
      track('badge', 'scaleY', [[0, 1, 'easeOut'], [6, 1.35, 'ease'], [13, 0.92, 'ease'], [19, 1.05, 'ease'], [24, 1]]),
      track('badge', 'rotation', [[0, 0], [6, -6], [13, 3], [24, 0]]),
    ]);
    ab.stateMachine('Main', {
      inputs: { pop: 'trigger' },
      layers: [
        { name: 'shine', states: { shine: { anim: 'shine' } } },
        {
          name: 'pop', entry: 'rest', states: { rest: { anim: 'rest' }, pop: { anim: 'pop' } },
          transitions: [
            { from: 'rest', to: 'pop', when: [['pop']] },
            { from: 'pop', to: 'rest', exitTime: 100, exitPct: true },
          ],
        },
      ],
    });
  }
}

// ---------------------------------------------------------------- item slot
export function buildItemSlot(file) {
  const ab = file.artboard('ItemSlot', 120, 120);
  const outer = rect(4, 4, 112, 112, 26), inner = rect(15, 15, 90, 90, 18);
  ab.add(
    shape({ y: 2 }, [outer], alpha(NAVY, 0.45)),
    shape({}, [inner], alpha('#0a0e28', 0.55)),
    // white ring (evenOdd outer minus inner)
    shape({ name: 'ring' }, [outer, inner], { type: 'linear', x1: 0, y1: 4, x2: 0, y2: 116, stops: [[0, '#ffffff'], [0.6, '#f2f4ff'], [1, '#b8c4ec']], evenOdd: true }),
    shape({}, [outer], null, { color: NAVY, width: 3.5 }),
    shape({}, [inner], null, { color: NAVY, width: 3 }),
    // glossy top highlight across the ring and window
    node({ name: 'glossClip', clip: 'ring', clipEvenOdd: true }, [shape({}, [rect(0, 0, 120, 44)], alpha('#ffffff', 0.5))]),
    shape({ name: 'gloss' }, svg('M22 20 C40 16 80 16 98 20 C98 30 96 36 92 40 C70 34 50 34 28 40 C24 36 22 30 22 20 Z'), linear(0, 18, 0, 40, [[0, alpha('#ffffff', 0.32)], [1, alpha('#ffffff', 0.02)]])),
    shape({ name: 'spark', x: 98, y: 14, scale: 0 }, poly([[0, -6], [1.5, -1.5], [6, 0], [1.5, 1.5], [0, 6], [-1.5, 1.5], [-6, 0], [-1.5, -1.5]], true, 0.5), '#ffffff'),
  );
  ab.animation('idle', { duration: 180, loop: 'loop' }, [
    track('gloss', 'opacity', sineKeys(0.85, 0.15, 180, 180, 0, 10)),
    track('spark', 'scaleX', [[0, 0, 'hold'], [140, 0], [150, 1.2], [162, 0, 'hold'], [180, 0, 'hold']]),
    track('spark', 'scaleY', [[0, 0, 'hold'], [140, 0], [150, 1.2], [162, 0, 'hold'], [180, 0, 'hold']]),
  ]);
  ab.stateMachine('Main', { layers: [{ name: 'idle', states: { idle: { anim: 'idle' } } }] });
}

// ---------------------------------------------------------------- lap label
export function buildLap(file) {
  const ab = file.artboard('Lap', 140, 60);
  const t = text('LAP');
  const s = Math.min(60 / 64, (140 - 4) / t.width);
  ab.add(node({ x: (140 - t.width * s) / 2, y: 60 - 62 * s, scale: s }, t.nodes));
  still(ab);
}

// ---------------------------------------------------------------- start/finish banner
export function buildBanner(file) {
  const ab = file.artboard('Banner', 1024, 160);
  const checks = (x0) => {
    const cols = 4, rows = 7, cw = 22, ch = 140 / rows;
    const dark = [];
    for (let i = 0; i < cols; i++) for (let j = 0; j < rows; j++) if ((i + j) % 2 === 0) dark.push(rect(x0 + i * cw, 10 + j * ch, cw, ch));
    return node({}, [shape({}, rect(x0, 10, cols * cw, 140), '#ffffff'), shape({}, dark, '#141018'), shape({}, rect(x0, 10, cols * cw, 140), null, ol(3))]);
  };
  // letters
  const word = 'DARIOKART';
  const gap = 6, wordGap = 22, S = 1.0;
  let total = 0;
  for (let i = 0; i < word.length; i++) total += LETTERS[word[i]].w + (i ? (i === 5 ? wordGap : gap) : 0);
  let x = (1024 - total) / 2;
  const letters = []; const tracks = [];
  for (let i = 0; i < word.length; i++) {
    const L = LETTERS[word[i]]; const dario = i < 5;
    if (i) x += i === 5 ? wordGap : gap;
    const face = dario ? linear(0, 0, 0, 100, [[0, '#ffffff'], [0.6, '#fff0ea'], [1, '#ffc0b0']]) : linear(0, 0, 0, 100, [[0, '#fff59a'], [0.45, '#ffd23f'], [1, '#e89400']]);
    const rim = dario ? '#ffd23f' : '#2a6fe0';
    const EO = (c) => ({ type: 'solid', color: c, evenOdd: true });
    letters.push(node({ x, y: 24, rotation: 0 }, [
      shape({ x: 5, y: 7 }, L.paths(), EO('#3a0606'), { color: '#3a0606', width: 14 }),
      shape({}, L.paths(), EO(NAVY), [{ color: NAVY, width: 15 }, { color: rim, width: 9 }]),
      shape({ name: 'bf' + i }, L.paths(), { ...face, evenOdd: true }, ol(2.5, NAVY)),
      node({ clip: 'bf' + i, clipEvenOdd: true }, [shape({ name: 'bbar' + i, x: -40, rotation: 20 }, rect(-8, -40, 16, 180), alpha('#ffffff', 0.6))]),
    ]));
    tracks.push(track('bbar' + i, 'x', [[0, -40, 'hold'], [60 + i * 5, -40, 'easeIn'], [90 + i * 5, L.w + 50, 'hold'], [240, L.w + 50, 'hold']]));
    x += L.w;
  }
  ab.add(
    shape({}, rect(0, 0, 1024, 160), linear(0, 0, 0, 160, [[0, '#ff4a3a'], [0.5, '#d01818'], [1, '#6a0808']])),
    shape({}, [rect(0, 10, 1024, 4), rect(0, 146, 1024, 4)], '#ffd23f'),
    shape({}, [rect(0, 18, 1024, 3)], alpha('#ffffff', 0.35)),
    checks(0), checks(1024 - 88),
    ...letters,
    shape({}, rect(1.5, 1.5, 1021, 157), null, ol(3, NAVY)),
  );
  ab.animation('idle', { duration: 240, loop: 'loop' }, tracks);
  ab.stateMachine('Main', { layers: [{ name: 'idle', states: { idle: { anim: 'idle' } } }] });
}
