// SMK-style rotating kart sprites (96x96). Five right-facing views selected by
// the number input "view": 0 rear, 1 rear 3/4, 2 right profile, 3 front 3/4,
// 4 front. Bottom of the tyres sits at y=92 (4px margin); sprite centred on x=48.
import { shape, node, pivot, rect, rectC, ellipse, circle, poly, svg, linear, radial, OUT, ol, alpha, lighten, darken, sineKeys, track, blob, shine } from './common.mjs';
import { KART_COLORS } from './characters.mjs';
import { driver } from './drivers.mjs';

const TYRE = '#2a2530';
const GROUND = 92;
const R = 19; // driver head radius (head+cap ~ 44px = 46% of the sprite)
const HEAD_Y = 27;

const INITIAL = { dario: 'D', luigio: 'L', pearl: 'P', yoshio: 'Y', bowzer: 'B', donkeyjr: 'J', toadie: 'T', koopo: 'K' };

/** Rear/front-on tyre: rounded block with scrolling treads (rolling). */
function tyreBlock(ctx, name, cx, bottom, w, h) {
  const cy = bottom - h / 2;
  const treads = [];
  for (let i = -2; i < Math.ceil(h / 5) + 2; i++) treads.push(rect(cx - w / 2, cy - h / 2 + i * 5, w, 1.8));
  ctx.treads.push(name + 'Tread');
  return node({}, [
    shape({ name: name + 'Body' }, rectC(cx, cy, w, h, Math.min(w, h) * 0.34), linear(cx - w / 2, 0, cx + w / 2, 0, [[0, '#4e4858'], [0.5, TYRE], [1, '#141018']])),
    node({ clip: name + 'Body' }, [shape({ name: name + 'Tread' }, treads, alpha('#000000', 0.5))]),
    shape({}, rectC(cx - w * 0.22, cy, w * 0.18, h * 0.7, 2), alpha('#ffffff', 0.16)),
    shape({}, rectC(cx, cy, w, h, Math.min(w, h) * 0.34), null, ol(2.5)),
  ]);
}
/** Side-on tyre: circle with a spinning hub. */
function tyreWheel(ctx, name, cx, bottom, r, squash = 1) {
  const cy = bottom - r;
  ctx.hubs.push(name + 'Hub');
  return node({}, [
    blob({}, ellipse(cx, cy, r * squash, r), radial(cx - r * 0.3, cy - r * 0.3, r * 1.4, [[0, '#4e4858'], [1, '#141018']]), 2.5),
    node({ x: cx, y: cy, scaleX: squash }, [
      pivot(0, 0, { name: name + 'Hub' }, [
        blob({}, circle(0, 0, r * 0.5), linear(0, -r * 0.5, 0, r * 0.5, [[0, '#e8e2f0'], [1, '#8a8294']]), 2),
        shape({}, [rectC(0, 0, r * 0.9, 1.8), rectC(0, 0, 1.8, r * 0.9)], '#5a5464'),
        blob({}, circle(0, 0, r * 0.16), '#c8c0d0', 1.2),
      ]),
    ]),
  ]);
}
/** Exhaust flame; base at (x,y), pointing in direction `rot` degrees (0 = down, 90 = left). */
function flame(ctx, name, x, y, rot = 0, s = 1) {
  ctx.flames.push(name);
  return node({ x, y, rotation: rot, scale: s }, [
    pivot(0, 0, { name }, [
      shape({}, svg('M-5 0 C-6 5 -2 10 0 14 C2 10 6 5 5 0 Z'), linear(0, 0, 0, 14, [[0, '#ffe14a'], [1, '#ff5a1a']]), ol(1.5, '#c0300a')),
      shape({}, svg('M-2.5 0 C-3 3 -1 6 0 8 C1 6 3 3 2.5 0 Z'), '#ffffff'),
    ]),
  ]);
}
function steeringWheel(cx, cy, w, h) {
  return [shape({}, ellipse(cx, cy, w, h), null, [{ color: OUT, width: 5 }, { color: '#4a4452', width: 2.5 }])];
}
function hand(x, y, color) { return blob({}, circle(x, y, 3.6), color, 2); }

function driverNode(ctx, v, phi, cx) {
  const d = driver(ctx.id, phi, cx, HEAD_Y, R, 'v' + v);
  return { d, node: pivot(cx, HEAD_Y + R * 1.9, { name: 'drv' + v }, [...d.torso, ...d.head]) };
}

// ---------------------------------------------------------------- views
function view0(ctx) { // rear
  const kc = ctx.kc; const cx = 48;
  const { node: drv } = driverNode(ctx, 0, 0, cx);
  return [
    tyreBlock(ctx, 'v0fl', 18, 66, 12, 14), tyreBlock(ctx, 'v0fr', 78, 66, 12, 14),
    blob({}, svg('M26 58 L70 58 L80 74 L16 74 Z'), linear(0, 58, 0, 74, [[0, lighten(kc, 0.25)], [1, darken(kc, 0.1)]]), 2.5),
    drv,
    blob({}, svg('M33 62 C33 56 37 54 48 54 C59 54 63 56 63 62 L63 68 L33 68 Z'), linear(0, 54, 0, 68, [[0, '#4a4452'], [1, '#2a2530']]), 2.5),
    flame(ctx, 'v0flameL', 40, 86), flame(ctx, 'v0flameR', 56, 86),
    blob({}, svg('M14 70 C14 66 17 64 22 64 L74 64 C79 64 82 66 82 70 L82 80 C82 84 79 86 74 86 L22 86 C17 86 14 84 14 80 Z'), linear(0, 64, 0, 86, [[0, lighten(kc, 0.3)], [0.45, kc], [1, darken(kc, 0.3)]]), 3),
    shine([rect(20, 66.5, 56, 2.5, 1.2)], 0.45),
    blob({}, rect(36, 68, 24, 11, 3), linear(0, 68, 0, 79, [[0, '#c8c0d0'], [1, '#7a7284']]), 2),
    shape({}, [rect(39, 70.5, 18, 1.5), rect(39, 73.5, 18, 1.5), rect(39, 76.5, 18, 1.5)], '#4a4452'),
    blob({}, [rect(19, 70, 9, 5, 2), rect(68, 70, 9, 5, 2)], '#ff3b3b', 2),
    blob({}, [ellipse(40, 86, 4, 2.6), ellipse(56, 86, 4, 2.6)], '#c8c0d0', 2),
    shape({}, [ellipse(40, 86.3, 2.1, 1.3), ellipse(56, 86.3, 2.1, 1.3)], OUT),
    tyreBlock(ctx, 'v0rl', 11, GROUND, 18, 30), tyreBlock(ctx, 'v0rr', 85, GROUND, 18, 30),
  ];
}

function view4(ctx) { // front
  const kc = ctx.kc; const cx = 48;
  const { d, node: drv } = driverNode(ctx, 4, 180, cx);
  return [
    flame(ctx, 'v4flameL', 26, 60, 180, 0.8), flame(ctx, 'v4flameR', 70, 60, 180, 0.8),
    tyreBlock(ctx, 'v4rl', 16, 74, 13, 16), tyreBlock(ctx, 'v4rr', 80, 74, 13, 16),
    blob({}, svg('M28 66 C28 54 34 50 48 50 C62 50 68 54 68 66 Z'), linear(0, 50, 0, 66, [[0, '#4a4452'], [1, '#2a2530']]), 2.5),
    drv,
    ...steeringWheel(cx, 64, 13, 4.5),
    hand(cx - 13, 64, d.gloves), hand(cx + 13, 64, d.gloves),
    blob({}, svg('M20 70 C20 66 24 64 30 64 L66 64 C72 64 76 66 76 70 L80 84 L16 84 Z'), linear(0, 64, 0, 84, [[0, lighten(kc, 0.35)], [0.5, kc], [1, darken(kc, 0.25)]]), 3),
    shine([ellipse(36, 68, 9, 1.8)], 0.5),
    blob({}, circle(48, 75, 6), '#ffffff', 2),
    shape({}, svg(letterPath(INITIAL[ctx.id], 48, 75)), null, { color: darken(kc, 0.1), width: 2, cap: 'round', join: 'round' }),
    blob({}, [ellipse(28, 76, 4, 3), ellipse(68, 76, 4, 3)], '#fff6b0', 2),
    blob({}, rect(18, 83, 60, 6, 3), linear(0, 83, 0, 89, [[0, '#8a8294'], [1, '#3a3446']]), 2.5),
    tyreBlock(ctx, 'v4fl', 12, GROUND, 17, 26), tyreBlock(ctx, 'v4fr', 84, GROUND, 17, 26),
  ];
}

function view2(ctx) { // right profile
  const kc = ctx.kc; const cx = 44;
  const { d, node: drv } = driverNode(ctx, 2, 90, cx);
  return [
    flame(ctx, 'v2flameA', 9, 74, 90), flame(ctx, 'v2flameB', 11, 79, 90, 0.75),
    blob({}, rect(6, 72, 12, 5, 2.5), linear(0, 72, 0, 77, [[0, '#f0eaf8'], [1, '#8a8294']]), 2),
    blob({}, svg('M20 48 C20 44 23 42 27 42 L31 42 L33 70 L20 70 Z'), linear(20, 0, 33, 0, [[0, '#4a4452'], [1, '#2a2530']]), 2.5),
    drv,
    ...steeringWheel(64, 58, 3, 8),
    hand(63, 58, d.gloves),
    blob({}, svg('M12 70 C12 64 16 62 22 62 L56 62 C62 62 66 63 72 65 L86 69 C90 70 91 73 90 77 L88 84 L14 84 C12 84 12 82 12 80 Z'), linear(0, 62, 0, 84, [[0, lighten(kc, 0.3)], [0.5, kc], [1, darken(kc, 0.25)]]), 3),
    shine([svg('M18 66 L60 66 C64 66 68 67 72 68.5 L72 70 L18 70 Z')], 0.4),
    blob({}, circle(50, 75, 5), '#ffffff', 2),
    shape({}, svg(letterPath(INITIAL[ctx.id], 50, 75)), null, { color: darken(kc, 0.1), width: 1.8, cap: 'round', join: 'round' }),
    blob({}, svg('M14 82 L88 82 L86 87 L16 87 Z'), '#3a3446', 2),
    tyreWheel(ctx, 'v2r', 25, GROUND, 13), tyreWheel(ctx, 'v2f', 75, GROUND, 12),
  ];
}

function view1(ctx) { // rear three-quarter (heading up-right; rear + right side)
  const kc = ctx.kc; const cx = 42;
  const { node: drv } = driverNode(ctx, 1, 45, cx);
  return [
    tyreBlock(ctx, 'v1fr', 84, 82, 11, 20),
    // deck (top surface of the tub)
    blob({}, poly([[14, 68], [56, 66], [86, 58], [78, 50], [28, 54]], true, 3), linear(0, 50, 0, 68, [[0, lighten(kc, 0.35)], [1, kc]]), 2.5),
    drv,
    blob({}, svg('M26 64 C26 57 30 54 40 54 C48 54 52 57 52 62 L52 68 L26 69 Z'), linear(0, 54, 0, 69, [[0, '#4a4452'], [1, '#2a2530']]), 2.5),
    flame(ctx, 'v1flameL', 24, 87, 15), flame(ctx, 'v1flameR', 38, 87, 15),
    // right side face
    blob({}, poly([[56, 66], [86, 58], [89, 62], [88, 76], [57, 88]], true, 2), linear(56, 0, 89, 0, [[0, darken(kc, 0.05)], [1, lighten(kc, 0.25)]]), 3),
    shine([poly([[60, 69], [84, 62], [84, 64.5], [60, 71.5]])], 0.35),
    // rear face
    blob({}, poly([[11, 68], [56, 66], [57, 88], [12, 88]], true, 3), linear(0, 66, 0, 88, [[0, lighten(kc, 0.2)], [0.5, darken(kc, 0.05)], [1, darken(kc, 0.35)]]), 3),
    shine([rect(16, 69.5, 36, 2.2, 1.1)], 0.4),
    blob({}, [rect(15, 73, 7, 5, 2), rect(46, 72.5, 7, 5, 2)], '#ff3b3b', 2),
    blob({}, rect(25, 73, 17, 9, 2.5), linear(0, 73, 0, 82, [[0, '#c8c0d0'], [1, '#7a7284']]), 2),
    blob({}, [ellipse(24, 87, 3.5, 2.4), ellipse(38, 87, 3.5, 2.4)], '#c8c0d0', 2),
    shape({}, [ellipse(24, 87.3, 1.8, 1.2), ellipse(38, 87.3, 1.8, 1.2)], OUT),
    tyreBlock(ctx, 'v1rr', 62, 91, 13, 26),
    tyreBlock(ctx, 'v1rl', 9, GROUND, 15, 28),
  ];
}

function view3(ctx) { // front three-quarter (heading down-right; front + side)
  const kc = ctx.kc; const cx = 44;
  const { d, node: drv } = driverNode(ctx, 3, 135, cx);
  return [
    flame(ctx, 'v3flameA', 12, 62, 110, 0.85),
    tyreBlock(ctx, 'v3rl', 15, 80, 12, 20),
    // deck
    blob({}, poly([[46, 66], [86, 64], [76, 52], [26, 52], [12, 58]], true, 3), linear(0, 52, 0, 66, [[0, lighten(kc, 0.35)], [1, kc]]), 2.5),
    blob({}, svg('M26 62 C26 52 30 46 42 46 C52 46 56 50 56 58 L56 64 Z'), linear(0, 46, 0, 64, [[0, '#4a4452'], [1, '#2a2530']]), 2.5),
    drv,
    ...steeringWheel(cx + 13, 63, 9, 4),
    hand(cx + 5, 63, d.gloves), hand(cx + 21, 63, d.gloves),
    // left side face (receding up-left)
    blob({}, poly([[46, 66], [12, 58], [9, 62], [10, 76], [47, 88]], true, 2), linear(9, 0, 47, 0, [[0, darken(kc, 0.25)], [1, darken(kc, 0.05)]]), 3),
    shine([poly([[14, 62], [42, 69], [42, 71.5], [14, 64.5]])], 0.3),
    // front face
    blob({}, poly([[46, 66], [86, 64], [88, 86], [47, 88]], true, 3), linear(0, 64, 0, 88, [[0, lighten(kc, 0.35)], [0.5, kc], [1, darken(kc, 0.25)]]), 3),
    shine([ellipse(64, 68.5, 10, 1.6)], 0.5),
    blob({}, circle(67, 76, 5.5), '#ffffff', 2),
    shape({}, svg(letterPath(INITIAL[ctx.id], 67, 76)), null, { color: darken(kc, 0.1), width: 1.8, cap: 'round', join: 'round' }),
    blob({}, [ellipse(53, 77, 3, 2.6), ellipse(81, 76, 3, 2.6)], '#fff6b0', 2),
    blob({}, poly([[46, 84], [88, 82], [88, 88], [47, 90]], true, 2), '#4a4452', 2.5),
    tyreBlock(ctx, 'v3fl', 40, GROUND, 15, 26),
    tyreBlock(ctx, 'v3fr', 86, 91, 14, 24),
  ];
}

function letterPath(L, x, y) {
  const P = {
    D: 'M-2 -3 L-2 3 L0 3 C3 3 3 -3 0 -3 Z', L: 'M-2 -3 L-2 3 L2.5 3', P: 'M-2 3 L-2 -3 L1 -3 C3 -3 3 0 1 0 L-2 0',
    Y: 'M-2.5 -3 L0 0 L2.5 -3 M0 0 L0 3', B: 'M-2 -3 L-2 3 L1 3 C3 3 3 0 0.5 0 L-2 0 M0.5 0 C2.5 0 2.5 -3 0.5 -3 L-2 -3',
    J: 'M2 -3 L2 1.5 C2 3.5 -2 3.5 -2 1.5', T: 'M-3 -3 L3 -3 M0 -3 L0 3', K: 'M-2 -3 L-2 3 M2.5 -3 L-2 0.5 M-0.5 -0.5 L2.5 3',
  }[L];
  // translate path
  return P.replace(/(-?\d*\.?\d+) (-?\d*\.?\d+)/g, (_, a, b) => `${+a + x} ${+b + y}`);
}

export function buildKarts(file, ids) {
  for (const id of ids) {
    const kc = KART_COLORS[id];
    const ab = file.artboard('Kart_' + id, 96, 96);
    const ctx = { id, kc, treads: [], hubs: [], flames: [] };
    const views = [view0, view1, view2, view3, view4].map((fn, v) =>
      node({ name: 'V' + v, opacity: v === 0 ? 1 : 0 }, [node({ name: 'body' + v }, fn(ctx))]));
    ab.add(
      shape({ name: 'shadow', x: 48, y: GROUND }, ellipse(0, 0, 44, 5), alpha(OUT, 0.35)),
      pivot(48, GROUND, { name: 'lean' }, views),
    );

    // drive loop: chassis vibration + rolling tyres
    const V = 12;
    ab.animation('drive', { duration: V, loop: 'loop' }, [
      ...[0, 1, 2, 3, 4].map((v) => track('body' + v, 'y', [[0, 0, 'linear'], [3, -0.8, 'linear'], [6, 0.2, 'linear'], [9, -0.6, 'linear'], [12, 0]])),
      ...ctx.treads.map((t) => track(t, 'y', [[0, 0, 'linear'], [V, 5]])),
      ...ctx.hubs.map((h) => track(h, 'rotation', [[0, 0, 'linear'], [V, -90]])),
    ]);
    // steering lean (all views)
    const pose = (name, s) => ab.animation(name, { duration: 1, loop: 'oneShot' }, [
      track('lean', 'rotation', [[0, s * 4]], 'hold'),
      track('lean', 'x', [[0, 48 + s * 2]], 'hold'),
      ...[0, 1, 2, 3, 4].map((v) => track('drv' + v, 'rotation', [[0, s * 9]], 'hold')),
      track('shadow', 'x', [[0, 48 + s * 2]], 'hold'),
    ]);
    pose('steerLeft', -1); pose('steerCenter', 0); pose('steerRight', 1);
    // boost
    ab.animation('boostOff', { duration: 1, loop: 'oneShot' }, ctx.flames.map((f) => track(f, 'opacity', [[0, 0]], 'hold')));
    ab.animation('boostOn', { duration: 8, loop: 'loop' }, ctx.flames.flatMap((f, i) => [
      track(f, 'opacity', [[0, 1]], 'hold'),
      track(f, 'scaleY', i % 2 ? [[0, 1.4, 'linear'], [2, 0.85, 'linear'], [4, 1.5, 'linear'], [6, 0.9, 'linear'], [8, 1.4]] : [[0, 1.0, 'linear'], [2, 1.5, 'linear'], [4, 0.8, 'linear'], [6, 1.35, 'linear'], [8, 1.0]]),
      track(f, 'scaleX', [[0, 1.0, 'linear'], [4, 1.2, 'linear'], [8, 1.0]]),
    ]));
    // camera view selection (instant)
    for (let v = 0; v <= 4; v++) ab.animation('view' + v, { duration: 1, loop: 'oneShot' }, [0, 1, 2, 3, 4].map((w) => track('V' + w, 'opacity', [[0, w === v ? 1 : 0]], 'hold')));

    ab.stateMachine('Main', {
      inputs: { steer: { type: 'number', value: 0 }, boost: { type: 'bool', value: false }, view: { type: 'number', value: 0 } },
      layers: [
        { name: 'drive', states: { drive: { anim: 'drive' } } },
        { name: 'steer', states: { steer: { blend1d: 'steer', anims: [['steerLeft', -1], ['steerCenter', 0], ['steerRight', 1]] } } },
        {
          name: 'boost', states: { off: { anim: 'boostOff' }, on: { anim: 'boostOn' } }, entry: 'off',
          transitions: [
            { from: 'off', to: 'on', when: [['boost', true]] },
            { from: 'on', to: 'off', when: [['boost', false]] },
          ],
        },
        {
          name: 'view', entry: 'v0',
          states: { v0: { anim: 'view0' }, v1: { anim: 'view1' }, v2: { anim: 'view2' }, v3: { anim: 'view3' }, v4: { anim: 'view4' } },
          any: [
            { to: 'v0', when: [['view', '<', 0.5]] },
            { to: 'v1', when: [['view', '>=', 0.5], ['view', '<', 1.5]] },
            { to: 'v2', when: [['view', '>=', 1.5], ['view', '<', 2.5]] },
            { to: 'v3', when: [['view', '>=', 2.5], ['view', '<', 3.5]] },
            { to: 'v4', when: [['view', '>=', 3.5]] },
          ],
        },
      ],
    });
  }
}
