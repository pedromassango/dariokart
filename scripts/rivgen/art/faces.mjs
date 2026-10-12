// Face_<id>: face-feature decals (transparent background) for sphere-shaped heads.
import { shape, node, pivot, rect, ellipse, poly, svg, linear, radial, OUT, alpha, lighten, darken, sineKeys, track, blob } from './common.mjs';

const BLUE = '#2a6fe0';
const FACES = {
  dario: { iris: BLUE, eyeY: 96, dx: 36, rx: 21, ry: 30, brow: '#3a1f0f', nose: '#ffb88a', noseR: [30, 25], noseY: 140, stache: '#3a1f0f', mouthY: 190 },
  luigio: { iris: BLUE, eyeY: 92, dx: 34, rx: 20, ry: 32, brow: '#3a1f0f', nose: '#ffb88a', noseR: [24, 30], noseY: 142, stache: '#3a1f0f', stacheThin: true, mouthY: 194 },
  pearl: { iris: BLUE, eyeY: 108, dx: 38, rx: 21, ry: 29, brow: '#c9971a', browThin: true, lashes: true, smallNose: true, lips: '#ff4f8a', mouthY: 178 },
  yoshio: { iris: OUT, eyeY: 70, dx: 34, rx: 23, ry: 36, noBrow: true, nostrils: 150, mouthY: 196, wide: true },
  bowzer: { iris: '#e0302a', eyeY: 100, dx: 40, rx: 17, ry: 20, brow: '#ff5a2a', angry: true, nostrils: 146, fangs: true, mouthY: 182, wide: true },
  donkeyjr: { iris: OUT, eyeY: 92, dx: 32, rx: 17, ry: 23, brow: '#4a2a10', muzzle: '#e8b080', nostrils: 150, mouthY: 182 },
  toadie: { iris: BLUE, eyeY: 104, dx: 34, rx: 18, ry: 32, noBrow: true, blush: true, mouthY: 170, smallMouth: true },
  koopo: { iris: '#2a2030', eyeY: 96, dx: 32, rx: 20, ry: 34, noBrow: true, beak: true, mouthY: 178 },
};

function glossyEye(x, y, rx, ry, iris, look = 0) {
  return [
    blob({}, ellipse(x, y, rx, ry), linear(0, y - ry, 0, y + ry, [[0, '#ffffff'], [0.75, '#ffffff'], [1, '#d8def0']]), 4),
    shape({}, ellipse(x + look, y + ry * 0.18, rx * 0.66, ry * 0.68), linear(0, y - ry * 0.5, 0, y + ry * 0.85, [[0, lighten(iris, 0.25)], [1, darken(iris, 0.35)]])),
    shape({}, ellipse(x + look, y + ry * 0.24, rx * 0.36, ry * 0.4), OUT),
    shape({}, ellipse(x + look - rx * 0.24, y - ry * 0.12, rx * 0.22, ry * 0.2), '#ffffff'),
    shape({}, ellipse(x + look + rx * 0.22, y + ry * 0.42, rx * 0.1, ry * 0.09), alpha('#ffffff', 0.85)),
  ];
}
function brow(x, y, w, rot, color, t = 9) {
  return shape({ x, y, rotation: rot }, svg(`M${-w / 2} 3 Q0 ${-6} ${w / 2} 3`), null, { color, width: t, cap: 'round' });
}

function faceEyes(c, mode) {
  const L = 128 - c.dx, R = 128 + c.dx, y = c.eyeY;
  const out = [];
  // positive rot = inner ends lowered (angry/determined)
  const brows = (rot, dy = 0) => c.noBrow ? [] : [
    brow(L, y - c.ry - 14 + dy, c.rx * 2, rot, c.brow, c.browThin ? 5 : 9),
    brow(R, y - c.ry - 14 + dy, c.rx * 2, -rot, c.brow, c.browThin ? 5 : 9),
  ];
  if (mode === 'normal') {
    for (const [x, n] of [[L, 'eyeL'], [R, 'eyeR']]) {
      const kids = glossyEye(x, y, c.rx, c.ry, c.iris, 2);
      if (c.lashes) kids.push(shape({}, svg(`M${x - c.rx * 0.9} ${y - c.ry * 0.5} L${x - c.rx * 1.35} ${y - c.ry * 0.95} M${x - c.rx * 0.4} ${y - c.ry * 0.92} L${x - c.rx * 0.6} ${y - c.ry * 1.35} M${x + c.rx * 0.3} ${y - c.ry * 0.97} L${x + c.rx * 0.35} ${y - c.ry * 1.4}`), null, { color: OUT, width: 4, cap: 'round' }));
      out.push(pivot(x, y, { name: n }, kids));
    }
    out.push(...brows(c.angry ? 22 : -6));
  } else if (mode === 'happy') {
    for (const x of [L, R]) out.push(shape({}, svg(`M${x - c.rx} ${y + 8} Q${x} ${y - c.ry * 0.9} ${x + c.rx} ${y + 8}`), null, { color: OUT, width: 9, cap: 'round' }));
    out.push(...brows(c.angry ? 8 : -8, -6));
  } else if (mode === 'hurt') {
    for (const x of [L, R]) {
      const pts = [];
      for (let t = 0; t <= 1; t += 0.04) { const a = t * Math.PI * 5; const r = 2 + t * Math.min(c.rx, c.ry) * 0.95; pts.push([x + r * Math.cos(a), y + r * Math.sin(a)]); }
      out.push(blob({}, ellipse(x, y, c.rx, c.ry * 0.85), '#ffffff', 4));
      out.push(shape({}, poly(pts, false), null, { color: OUT, width: 4, cap: 'round', join: 'round' }));
    }
    out.push(...brows(-16, 2));
  } else if (mode === 'det') {
    for (const [x, s] of [[L, -1], [R, 1]]) {
      const top = y - c.ry * 0.15;
      out.push(node({}, [
        blob({}, svg(`M${x - c.rx} ${top + s * 4} L${x + c.rx} ${top - s * 4} C${x + c.rx} ${y + c.ry * 0.8} ${x - c.rx} ${y + c.ry * 0.8} ${x - c.rx} ${top + s * 4} Z`), '#ffffff', 4),
        shape({}, ellipse(x + 2, y + c.ry * 0.3, c.rx * 0.55, c.ry * 0.38), linear(0, y, 0, y + c.ry * 0.7, [[0, lighten(c.iris, 0.2)], [1, darken(c.iris, 0.35)]])),
        shape({}, ellipse(x + 2, y + c.ry * 0.33, c.rx * 0.28, c.ry * 0.22), OUT),
        shape({}, ellipse(x - c.rx * 0.15, y + c.ry * 0.2, c.rx * 0.14, c.ry * 0.1), '#ffffff'),
        shape({}, svg(`M${x - c.rx - 3} ${top + s * 5} L${x + c.rx + 3} ${top - s * 5}`), null, { color: OUT, width: 7, cap: 'round' }),
      ]));
    }
    out.push(...brows(c.angry ? 30 : 24, 6));
  }
  return out;
}

function faceMouth(c, mode) {
  const y = c.mouthY, w = c.wide ? 46 : c.smallMouth ? 18 : 26;
  const out = [];
  if (c.muzzle) out.push(blob({}, ellipse(128, y - 22, 62, 46), radial(118, y - 40, 70, [[0, lighten(c.muzzle, 0.2)], [1, c.muzzle]]), 4));
  if (c.nostrils) out.push(blob({}, [ellipse(128 - 14, c.nostrils, 5, 7), ellipse(128 + 14, c.nostrils, 5, 7)], OUT, 0));
  const DARK = '#7a1a2a';
  if (mode === 'normal') {
    if (c.lips) out.push(blob({}, svg(`M${128 - 16} ${y} C${128 - 8} ${y - 6} ${128 - 3} ${y - 4} 128 ${y - 2} C${128 + 3} ${y - 4} ${128 + 8} ${y - 6} ${128 + 16} ${y} C${128 + 8} ${y + 9} ${128 - 8} ${y + 9} ${128 - 16} ${y} Z`), c.lips, 3));
    else if (c.fangs) {
      out.push(blob({}, svg(`M${128 - w} ${y - 8} C${128 - w * 0.5} ${y + 22} ${128 + w * 0.5} ${y + 22} ${128 + w} ${y - 8} C${128 + w * 0.5} ${y + 2} ${128 - w * 0.5} ${y + 2} ${128 - w} ${y - 8} Z`), DARK, 4));
      out.push(blob({}, [poly([[128 - 26, y + 1], [128 - 16, y + 2], [128 - 21, y + 16]], true, 1), poly([[128 + 16, y + 2], [128 + 26, y + 1], [128 + 21, y + 16]], true, 1)], '#ffffff', 2.5));
    } else if (c.beak) {
      out.push(shape({}, svg(`M${128 - 34} ${y - 10} C${128 - 20} ${y + 12} ${128 + 20} ${y + 12} ${128 + 34} ${y - 10} M${128 - 34} ${y - 10} L${128 - 40} ${y - 16} M${128 + 34} ${y - 10} L${128 + 40} ${y - 16}`), null, { color: OUT, width: 7, cap: 'round' }));
    } else {
      out.push(blob({}, svg(`M${128 - w} ${y - 4} C${128 - w * 0.6} ${y + w * 0.7} ${128 + w * 0.6} ${y + w * 0.7} ${128 + w} ${y - 4} C${128 + w * 0.4} ${y + 4} ${128 - w * 0.4} ${y + 4} ${128 - w} ${y - 4} Z`), DARK, 4));
    }
  } else if (mode === 'happy') {
    const W2 = w * 1.35;
    out.push(blob({}, svg(`M${128 - W2} ${y - 10} C${128 - W2 * 0.8} ${y + W2} ${128 + W2 * 0.8} ${y + W2} ${128 + W2} ${y - 10} Z`), c.lips ? darken(c.lips, 0.3) : DARK, 4));
    out.push(shape({}, ellipse(128, y + W2 * 0.45, W2 * 0.45, W2 * 0.2), '#ff7f9f'));
    if (c.fangs) out.push(blob({}, [poly([[128 - W2 + 8, y - 8], [128 - W2 + 20, y - 8], [128 - W2 + 14, y + 8]], true, 1), poly([[128 + W2 - 20, y - 8], [128 + W2 - 8, y - 8], [128 + W2 - 14, y + 8]], true, 1)], '#ffffff', 2.5));
    else out.push(shape({}, rect(128 - W2 * 0.6, y - 9, W2 * 1.2, 7, 3), '#ffffff'));
  } else if (mode === 'hurt') {
    const pts = [];
    for (let i = 0; i <= 16; i++) { const t = i / 16; pts.push([128 - w + 2 * w * t, y + 4 + 5 * Math.sin(t * Math.PI * 4)]); }
    out.push(shape({}, poly(pts, false), null, { color: OUT, width: 6, cap: 'round', join: 'round' }));
  } else if (mode === 'det') {
    const W2 = w * 1.1;
    out.push(blob({}, svg(`M${128 - W2} ${y - 8} L${128 + W2} ${y - 8} C${128 + W2} ${y + 14} ${128 - W2} ${y + 14} ${128 - W2} ${y - 8} Z`), '#ffffff', 4));
    out.push(shape({}, [svg(`M${128 - W2 + 2} ${y + 1} L${128 + W2 - 2} ${y + 1}`), ...[-0.5, 0, 0.5].map((f) => svg(`M${128 + f * W2} ${y - 7} L${128 + f * W2} ${y + 9}`))], null, { color: OUT, width: 3, cap: 'round' }));
  }
  return out;
}

function faceNose(c) {
  const out = [];
  if (c.nose) {
    out.push(blob({}, ellipse(128, c.noseY, c.noseR[0], c.noseR[1]), radial(118, c.noseY - 10, c.noseR[0] * 1.6, [[0, lighten(c.nose, 0.35)], [1, c.nose]]), 4));
    out.push(shape({}, ellipse(119, c.noseY - 9, 8, 5), alpha('#ffffff', 0.75)));
  }
  if (c.smallNose) out.push(shape({}, svg('M126 140 C122 148 126 152 132 150'), null, { color: '#d89070', width: 4, cap: 'round' }));
  if (c.blush) out.push(shape({}, [ellipse(70, 150, 18, 10), ellipse(186, 150, 18, 10)], alpha('#ff7a9a', 0.45)));
  if (c.lashes) out.push(shape({}, [ellipse(74, 152, 16, 9), ellipse(182, 152, 16, 9)], alpha('#ff7a9a', 0.35)));
  return out;
}
function faceStache(c) {
  if (!c.stache) return [];
  const y = 168;
  const d = c.stacheThin
    ? `M128 ${y - 8} C116 ${y - 14} 96 ${y - 12} 84 ${y - 2} C78 ${y + 6} 84 ${y + 14} 94 ${y + 8} C104 ${y + 2} 116 ${y} 128 ${y + 2} C140 ${y} 152 ${y + 2} 162 ${y + 8} C172 ${y + 14} 178 ${y + 6} 172 ${y - 2} C160 ${y - 12} 140 ${y - 14} 128 ${y - 8} Z`
    : `M128 ${y - 12} C112 ${y - 18} 88 ${y - 18} 74 ${y - 4} C68 ${y + 4} 72 ${y + 16} 82 ${y + 14} C88 ${y + 22} 100 ${y + 20} 106 ${y + 14} C114 ${y + 18} 122 ${y + 14} 128 ${y + 8} C134 ${y + 14} 142 ${y + 18} 150 ${y + 14} C156 ${y + 20} 168 ${y + 22} 174 ${y + 14} C184 ${y + 16} 188 ${y + 4} 182 ${y - 4} C168 ${y - 18} 144 ${y - 18} 128 ${y - 12} Z`;
  return [blob({}, svg(d), linear(0, y - 18, 0, y + 22, [[0, lighten(c.stache, 0.15)], [1, c.stache]]), 4), shape({}, ellipse(104, y - 6, 12, 3.5), alpha('#ffffff', 0.18))];
}

export function buildFaces(file, ids) {
  const MODES = ['normal', 'happy', 'hurt', 'det'];
  for (const id of ids) {
    const c = FACES[id];
    const ab = file.artboard('Face_' + id, 256, 256);
    const groups = MODES.map((m, i) => node({ name: 'mood_' + m, opacity: i === 0 ? 1 : 0 }, [...faceMouth(c, m), ...faceEyes(c, m)]));
    ab.add(pivot(128, 128, { name: 'face' }, [...groups, ...faceNose(c), ...faceStache(c)]));
    const D = 240;
    const blink = (n) => track(n, 'scaleY', [[0, 1, 'hold'], [D - 20, 1], [D - 15, 0.08], [D - 10, 1, 'hold'], [D, 1, 'hold']]);
    ab.animation('idle', { duration: D, loop: 'loop' }, [blink('eyeL'), blink('eyeR')]);
    MODES.forEach((m, i) => ab.animation('mood' + i, { duration: 1, loop: 'oneShot' }, MODES.map((mm) => track('mood_' + mm, 'opacity', [[0, mm === m ? 1 : 0]], 'hold'))));
    ab.animation('wobble', { duration: 40, loop: 'loop' }, [track('face', 'rotation', sineKeys(0, 5, 40, 40, 0, 4))]);
    ab.animation('still', { duration: 1, loop: 'oneShot' }, [track('face', 'rotation', [[0, 0]], 'hold')]);
    ab.stateMachine('Main', {
      inputs: { mood: { type: 'number', value: 0 } },
      layers: [
        { name: 'blink', states: { idle: { anim: 'idle' } } },
        {
          name: 'mood', entry: 'm0',
          states: { m0: { anim: 'mood0' }, m1: { anim: 'mood1' }, m2: { anim: 'mood2' }, m3: { anim: 'mood3' } },
          any: [
            { to: 'm0', when: [['mood', '<', 0.5]] },
            { to: 'm1', when: [['mood', '>=', 0.5], ['mood', '<', 1.5]] },
            { to: 'm2', when: [['mood', '>=', 1.5], ['mood', '<', 2.5]] },
            { to: 'm3', when: [['mood', '>=', 2.5]] },
          ],
        },
        {
          name: 'dizzy', entry: 'still', states: { still: { anim: 'still' }, wobble: { anim: 'wobble' } },
          any: [{ to: 'wobble', when: [['mood', '>=', 1.5], ['mood', '<', 2.5]] }],
          transitions: [{ from: 'wobble', to: 'still', when: [['mood', '<', 1.5]] }, { from: 'wobble', to: 'still', when: [['mood', '>=', 2.5]] }],
        },
      ],
    });
  }
}
