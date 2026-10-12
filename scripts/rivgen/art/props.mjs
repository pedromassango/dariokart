// SMK-style track props. All anchored bottom-centre (base touches the bottom
// edge minus ~2px) except ItemPanel, which fills its whole artboard.
import { shape, node, pivot, rect, rectC, ellipse, circle, poly, svg, linear, radial, OUT, ol, alpha, lighten, darken, sineKeys, track, blob, shine, starPts } from './common.mjs';

const idleOnly = (ab, tracks, dur = 120) => {
  ab.animation('idle', { duration: dur, loop: 'loop' }, tracks);
  ab.stateMachine('Main', { layers: [{ name: 'idle', states: { idle: { anim: 'idle' } } }] });
};

// ---------------------------------------------------------------- ItemPanel (flat, top-down)
function itemPanel(file) {
  const ab = file.artboard('ItemPanel', 64, 64);
  const rainbow = ['#ff4b6e', '#ffb02e', '#ffe94a', '#5ee05a', '#3fc8ff', '#8a6bff'];
  const cyc = (off, f = (c) => c) => {
    const k = [];
    for (let i = 0; i <= 6; i++) k.push([i * 15, f(rainbow[(i + off) % 6]), 'linear']);
    return k;
  };
  const q = svg('M-9 -8 C-9 -17 9 -17 9 -8 C9 -1 2 0 2 5 L2 8 L-4 8 L-4 4 C-4 -3 3 -4 3 -8 C3 -12 -3 -12 -3 -8 Z');
  ab.add(
    shape({}, rect(0, 0, 64, 64), OUT),
    shape({}, rect(2, 2, 60, 60, 4), { type: 'solid', color: rainbow[0], name: 'rim' }),
    shape({}, rect(2, 2, 60, 60, 4), linear(0, 0, 64, 64, [[0, alpha('#ffffff', 0.45)], [0.5, alpha('#ffffff', 0)], [1, alpha('#000000', 0.25)]])),
    shape({}, rect(10, 10, 44, 44, 3), { type: 'solid', color: rainbow[3], name: 'inner' }, ol(3)),
    shape({}, poly([[12, 12], [30, 12], [12, 30]], true, 2), alpha('#ffffff', 0.35)),
    pivot(32, 32, { name: 'q' }, [
      node({ x: 33, y: 34, scale: 1.45 }, [
        shape({ x: 1, y: 1.5 }, [q, circle(-1, 13, 3)], alpha(OUT, 0.55)),
        shape({}, [q, circle(-1, 13, 3)], '#ffffff', ol(2)),
      ]),
    ]),
    shape({}, rect(1.5, 1.5, 61, 61, 4), null, ol(3)),
  );
  idleOnly(ab, [
    track('rim', 'color', cyc(0)),
    track('inner', 'color', cyc(3, (c) => lighten(c, 0.15))),
    track('q', 'scaleX', sineKeys(1, 0.06, 45, 90, 0, 5)),
    track('q', 'scaleY', sineKeys(1, 0.06, 45, 90, 0, 5)),
  ], 90);
}

// ---------------------------------------------------------------- Pipe
function pipe(file) {
  const ab = file.artboard('Pipe', 64, 96);
  const g = (x1, x2) => linear(x1, 0, x2, 0, [[0, '#1c7a28'], [0.18, '#7be86a'], [0.32, '#3fcf4a'], [0.75, '#2fae3c'], [1, '#145c1c']]);
  ab.add(
    shape({ x: 32, y: 94 }, ellipse(0, 0, 26, 3), alpha(OUT, 0.3)),
    blob({}, rect(11, 30, 42, 64, 2), g(11, 53), 3),
    shape({}, rect(17, 34, 4, 56, 2), alpha('#ffffff', 0.55)),
    shape({}, rect(11, 30, 42, 6), alpha('#000000', 0.25)),
    blob({}, rect(5, 12, 54, 22, 4), g(5, 59), 3),
    shape({}, rect(11, 15, 5, 16, 2.5), alpha('#ffffff', 0.6)),
    shape({ name: 'glint', opacity: 0 }, poly(starPts(46, 18, 5, 1.6, 4, -90, 0.3)), '#ffffff'),
  );
  idleOnly(ab, [track('glint', 'opacity', [[0, 0, 'hold'], [80, 0], [90, 1], [100, 0, 'hold'], [120, 0, 'hold']])]);
}

// ---------------------------------------------------------------- Thwomp
function thwomp(file) {
  const ab = file.artboard('Thwomp', 64, 72);
  const spikes = [];
  for (const x of [14, 26, 38, 50]) spikes.push(poly([[x - 5, 11], [x, 4], [x + 5, 11]], true, 1)); // top
  for (const y of [20, 36, 52]) { spikes.push(poly([[8, y - 5], [1, y], [8, y + 5]], true, 1)); spikes.push(poly([[56, y - 5], [63, y], [56, y + 5]], true, 1)); }
  const stone = linear(0, 6, 0, 70, [[0, '#c8c6d6'], [0.5, '#9a98aa'], [1, '#6e6c80']]);
  const eye = (side) => {
    const x = 32 + side * 11;
    return node({}, [
      blob({}, ellipse(x, 34, 7, 7.5), '#ffffff', 2),
      shape({}, ellipse(x - side * 1.5, 35, 3.5, 4.5), linear(0, 30, 0, 40, [[0, '#7fd4ff'], [1, '#1f5fd0']])),
      shape({}, ellipse(x - side * 1.5, 35.5, 1.6, 2.2), OUT),
      // eyelid (scaleY drives the squint)
      pivot(x, 26, { name: 'lid' + (side > 0 ? 'R' : 'L'), scaleY: 0.25 }, [blob({}, rect(x - 8, 26, 16, 10, 2), '#8a889a', 2)]),
      pivot(x, 25, { name: 'brow' + (side > 0 ? 'R' : 'L'), rotation: side * 12 }, [blob({}, rectC(x, 25, 16, 4.5, 2), '#5a5868', 2)]),
    ]);
  };
  const body = node({ name: 'body' }, [
    shape({}, spikes, '#b4b2c4', ol(2.5)),
    blob({}, rect(8, 9, 48, 59, 6), stone, 3),
    shape({}, [rect(12, 13, 4, 50, 2), rect(12, 13, 40, 3, 1.5)], alpha('#ffffff', 0.35)),
    shape({}, svg('M14 58 L20 54 M44 14 L50 18 M46 60 L50 56'), null, ol(1.5, '#6e6c80')),
    eye(-1), eye(1),
    // mouth with teeth
    blob({}, rect(18, 48, 28, 12, 3), '#2a2030', 2.5),
    shape({}, [poly([[20, 48], [24, 48], [22, 53]]), poly([[27, 48], [31, 48], [29, 53]]), poly([[34, 48], [38, 48], [36, 53]]), poly([[41, 48], [45, 48], [43, 53]]),
      poly([[20, 60], [24, 60], [22, 55]]), poly([[27, 60], [31, 60], [29, 55]]), poly([[34, 60], [38, 60], [36, 55]]), poly([[41, 60], [45, 60], [43, 55]])], '#ffffff'),
  ]);
  ab.add(shape({ name: 'shadow', x: 32, y: 70 }, ellipse(0, 0, 26, 2.5), alpha(OUT, 0.3)), pivot(32, 68, { name: 'root' }, [body]));
  ab.animation('calm', { duration: 120, loop: 'loop' }, [
    track('root', 'y', sineKeys(67, -1.5, 120, 120, 0, 6)),
    track('root', 'x', [[0, 32]], 'hold'),
    track('lidL', 'scaleY', [[0, 0.25]], 'hold'), track('lidR', 'scaleY', [[0, 0.25]], 'hold'),
    track('browL', 'rotation', [[0, -12]], 'hold'), track('browR', 'rotation', [[0, 12]], 'hold'),
    track('browL', 'y', [[0, 25]], 'hold'), track('browR', 'y', [[0, 25]], 'hold'),
  ]);
  ab.animation('angry', { duration: 12, loop: 'loop' }, [
    track('root', 'y', [[0, 68]], 'hold'),
    track('root', 'x', [[0, 31, 'linear'], [3, 33, 'linear'], [6, 31, 'linear'], [9, 33, 'linear'], [12, 31]]),
    track('lidL', 'scaleY', [[0, 0.75]], 'hold'), track('lidR', 'scaleY', [[0, 0.75]], 'hold'),
    track('browL', 'rotation', [[0, 28]], 'hold'), track('browR', 'rotation', [[0, -28]], 'hold'),
    track('browL', 'y', [[0, 28]], 'hold'), track('browR', 'y', [[0, 28]], 'hold'),
  ]);
  ab.stateMachine('Main', {
    inputs: { slam: { type: 'bool', value: false } },
    layers: [{
      name: 'mood', entry: 'calm', states: { calm: { anim: 'calm' }, angry: { anim: 'angry' } },
      transitions: [
        { from: 'calm', to: 'angry', when: [['slam', true]], duration: 80 },
        { from: 'angry', to: 'calm', when: [['slam', false]], duration: 200 },
      ],
    }],
  });
}

// ---------------------------------------------------------------- Tree / Bush
function stripedBlob(name, paths, base, stripeYs, clipName) {
  return node({}, [
    shape({ name: clipName }, paths, linear(0, stripeYs[0] - 10, 0, stripeYs[stripeYs.length - 1] + 10, [[0, lighten(base, 0.25)], [1, darken(base, 0.2)]])),
    node({ clip: clipName }, [
      shape({}, stripeYs.map((y) => rect(-10, y, 90, 4.5)), alpha(darken(base, 0.45), 0.55)),
      shape({}, [ellipse(22, stripeYs[0] + 2, 9, 5)], alpha('#ffffff', 0.35)),
    ]),
    shape({}, paths, null, ol(3)),
  ]);
}
function tree(file) {
  const ab = file.artboard('Tree', 64, 96);
  ab.add(
    shape({ x: 32, y: 94 }, ellipse(0, 0, 18, 3), alpha(OUT, 0.3)),
    blob({}, svg('M26 60 L38 60 L40 92 C40 94 24 94 24 92 Z'), linear(24, 0, 40, 0, [[0, '#c08040'], [1, '#6a3a14']]), 3),
    pivot(32, 66, { name: 'canopy' }, [stripedBlob('c', [circle(32, 36, 28)], '#3fbf4a', [22, 32, 42, 52], 'canopyShape')]),
  );
  idleOnly(ab, [track('canopy', 'rotation', sineKeys(0, 2, 180, 180, 0, 6)), track('canopy', 'scaleY', sineKeys(1, 0.015, 90, 180, 0, 6))], 180);
}
function bush(file) {
  const ab = file.artboard('Bush', 64, 40);
  const paths = [circle(18, 24, 14), circle(32, 18, 16), circle(46, 24, 14), rect(6, 24, 52, 14, 6)];
  ab.add(
    shape({ x: 32, y: 38 }, ellipse(0, 0, 28, 2.5), alpha(OUT, 0.3)),
    shape({}, paths, OUT, { color: OUT, width: 6 }),
    shape({ name: 'bushShape' }, paths, linear(0, 2, 0, 38, [[0, '#7be86a'], [1, '#1c8a2c']])),
    node({ clip: 'bushShape' }, [shape({}, [rect(0, 14, 64, 3.5), rect(0, 24, 64, 3.5)], alpha('#0e5a18', 0.45))]),
    shine([ellipse(26, 10, 6, 3), ellipse(14, 16, 3, 2)], 0.4),
  );
  idleOnly(ab, [], 60);
}

// ---------------------------------------------------------------- Palm
function palm(file) {
  const ab = file.artboard('Palm', 64, 112);
  const seg = [];
  for (let i = 0; i < 7; i++) {
    const t = i / 7, y = 108 - i * 11, x = 30 + 6 * t * t;
    seg.push(blob({}, poly([[x - 6, y], [x + 6, y], [x + 5.5 + 1, y - 12], [x - 5.5 + 1, y - 12]], true, 2), linear(x - 6, 0, x + 6, 0, [[0, '#d8a060'], [1, '#8a5a2b']]), 2.5));
  }
  const leaf = (ang, len, flip = 1) => pivot(37, 30, { rotation: ang }, [
    blob({}, svg(`M37 30 C${37 + len * 0.3} ${30 - 10 * flip} ${37 + len * 0.7} ${30 - 8 * flip} ${37 + len} ${30 + 6} C${37 + len * 0.6} ${30 + 2} ${37 + len * 0.3} ${30 + 4} 37 30 Z`), linear(37, 0, 37 + len, 0, [[0, '#3fbf4a'], [1, '#1c8a2c']]), 2.5),
    shape({}, svg(`M38 30 C${37 + len * 0.4} ${30 - 4 * flip} ${37 + len * 0.7} ${30 - 2 * flip} ${37 + len - 2} ${30 + 4}`), null, ol(1.2, '#145c1c')),
  ]);
  ab.add(
    shape({ x: 32, y: 110 }, ellipse(0, 0, 16, 2.5), alpha(OUT, 0.3)),
    ...seg,
    pivot(37, 30, { name: 'fronds' }, [
      leaf(200, 26), leaf(160, 25, -1), leaf(235, 22), leaf(-30, 23), leaf(15, 23, -1), leaf(-70, 20),
      blob({}, [circle(33, 34, 4.5), circle(40, 35, 4.5), circle(37, 29, 4.5)], '#7a4a20', 2),
    ]),
  );
  idleOnly(ab, [track('fronds', 'rotation', sineKeys(0, 4, 150, 150, 0, 6))], 150);
}

// ---------------------------------------------------------------- Dead tree
function deadTree(file) {
  const ab = file.artboard('DeadTree', 64, 96);
  const trunk = svg('M24 94 C26 80 28 66 26 54 C20 50 12 44 8 32 L12 30 C16 40 22 44 27 46 C26 36 22 26 24 14 L28 14 C28 26 31 36 33 44 C36 36 40 30 46 24 C48 20 50 16 54 14 L57 17 C52 22 48 28 44 34 C42 40 38 46 36 54 C35 66 38 80 42 94 Z');
  ab.add(
    shape({ x: 32, y: 94 }, ellipse(0, 0, 18, 3), alpha(OUT, 0.35)),
    pivot(32, 94, { name: 'sway' }, [
      blob({}, trunk, linear(20, 0, 44, 0, [[0, '#8a7a9a'], [1, '#3e3450']]), 3),
      shape({}, svg('M28 90 C30 78 30 66 29 56 M33 70 C34 64 34 60 33 58'), null, ol(1.5, '#2e2640')),
      // spooky face hollow
      blob({}, [ellipse(29, 66, 2.6, 3.5), ellipse(35, 66, 2.6, 3.5)], OUT, 1),
      shape({ name: 'glow' }, [ellipse(29, 66, 1.2, 1.6), ellipse(35, 66, 1.2, 1.6)], '#d8ff6a'),
      blob({}, ellipse(32, 75, 3.5, 2.2), OUT, 1),
    ]),
  );
  idleOnly(ab, [
    track('sway', 'rotation', sineKeys(0, 1.5, 200, 200, 0, 8)),
    track('glow', 'opacity', [[0, 1, 'hold'], [120, 1], [126, 0.1], [140, 0.1], [146, 1, 'hold'], [200, 1, 'hold']]),
  ], 200);
}

// ---------------------------------------------------------------- Mole
function mole(file) {
  const ab = file.artboard('Mole', 48, 48);
  const holeY = 40;
  const moleArt = node({}, [
    blob({}, svg(`M10 ${holeY + 8} C10 22 16 14 24 14 C32 14 38 22 38 ${holeY + 8} Z`), linear(10, 0, 38, 0, [[0, '#a8744a'], [1, '#5a3418']]), 2.5),
    blob({}, ellipse(24, 32, 9, 7), '#e8c090', 2),
    blob({}, [circle(18, 24, 3.2), circle(30, 24, 3.2)], OUT, 0),
    shine([circle(17.2, 23, 1), circle(29.2, 23, 1)], 1),
    blob({}, ellipse(24, 28, 4, 3), '#ff7f9f', 2),
    shape({}, svg('M20 34 C22 36 26 36 28 34'), null, ol(1.8)),
    blob({}, [poly([[22, 34.5], [24, 34.5], [23, 37]], true, 0.3), poly([[24, 34.5], [26, 34.5], [25, 37]], true, 0.3)], '#ffffff', 1),
    blob({}, [ellipse(11, 34, 4, 3), ellipse(37, 34, 4, 3)], '#e8c090', 2),
  ]);
  ab.add(
    blob({}, ellipse(24, holeY, 18, 5.5), '#7a4a20', 2.5),
    shape({}, ellipse(24, holeY, 14, 3.8), '#1a0e08'),
    shape({ name: 'moleClip' }, [rect(0, 0, 48, holeY), ellipse(24, holeY, 14, 3.8)]),
    node({ clip: 'moleClip' }, [node({ name: 'moleUp', y: 30 }, [moleArt])]),
    // dirt lip in front
    shape({}, svg(`M6 ${holeY} C6 ${holeY + 7} 42 ${holeY + 7} 42 ${holeY} C38 ${holeY + 4} 10 ${holeY + 4} 6 ${holeY} Z`), '#a8744a', ol(2)),
    blob({}, [circle(6, holeY + 1, 2.5), circle(42, holeY - 1, 2), circle(36, holeY + 4, 1.8)], '#8a5a2b', 1.5),
  );
  const D = 150;
  idleOnly(ab, [
    track('moleUp', 'y', [[0, 30, 'hold'], [20, 30, 'easeOut'], [32, -2], [38, 0, 'hold'], [100, 0, 'easeIn'], [116, 30, 'hold'], [D, 30, 'hold']]),
    track('moleUp', 'scaleY', [[0, 1, 'hold'], [30, 1], [34, 1.08], [40, 1, 'hold'], [D, 1, 'hold']]),
  ], D);
}

export function buildProps(file) {
  itemPanel(file); pipe(file); thwomp(file); tree(file); bush(file); palm(file); deadTree(file); mole(file);
}
