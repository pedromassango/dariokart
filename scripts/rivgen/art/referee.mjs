// "Referee": a goggled turtle on a smiling cloud with a fishing-pole traffic light.
import { shape, node, pivot, rect, rectC, ellipse, circle, poly, svg, linear, radial, OUT, ol, alpha, lighten, darken, sineKeys, track, blob, shine, checkeredFlag } from './common.mjs';

const SKIN = '#ffcf5a';
const LAMP_OFF = '#3b3546';
const RED = '#ff2d2d';
const GREEN = '#3dff6a';

function cloud(cx, cy) {
  const C = [[-40, 4, 26], [-12, -10, 30], [24, -8, 28], [48, 8, 22], [0, 16, 26], [-30, 22, 18], [34, 22, 18]];
  const circles = (dx = 0, dy = 0, dr = 0) => C.map(([x, y, r]) => circle(cx + x + dx, cy + y + dy, r + dr));
  return node({ name: 'cloud' }, [
    shape({}, circles(), OUT, { color: OUT, width: 7 }),
    shape({}, circles(), '#bcd6ff'),
    shape({}, circles(-2, -5, -4), '#ffffff'),
    shine([ellipse(cx - 20, cy - 16, 10, 5)], 0.9, { rotation: -20 }),
    // face
    blob({}, [ellipse(cx - 14, cy + 6, 3.2, 5), ellipse(cx + 14, cy + 6, 3.2, 5)], OUT, 0),
    shine([ellipse(cx - 15, cy + 4, 1.1, 1.6), ellipse(cx + 13, cy + 4, 1.1, 1.6)], 1),
    shape({}, svg(`M${cx - 10} ${cy + 16} C${cx - 5} ${cy + 22} ${cx + 5} ${cy + 22} ${cx + 10} ${cy + 16}`), null, ol(2.5)),
    shape({}, [ellipse(cx - 24, cy + 14, 5, 3), ellipse(cx + 24, cy + 14, 5, 3)], alpha('#ff8fb0', 0.6)),
  ]);
}

function lamp(i, cy) {
  return node({}, [
    shape({ name: 'glow' + i, opacity: 0 }, circle(58, cy, 21), { type: 'solid', color: alpha(RED, 0.45), name: 'glowFill' + i }),
    // hood
    blob({}, svg(`M42 ${cy - 4} C42 ${cy - 18} 74 ${cy - 18} 74 ${cy - 4} L70 ${cy - 6} C68 ${cy - 14} 48 ${cy - 14} 46 ${cy - 6} Z`), '#26222e', 2),
    shape({}, circle(58, cy, 11.5), { type: 'solid', color: LAMP_OFF, name: 'lamp' + i }, ol(2.5)),
    shine([ellipse(54, cy - 4, 3.5, 2.5)], 0.75, { rotation: -30 }),
  ]);
}

export function buildReferee(file) {
  const ab = file.artboard('Referee', 220, 300);

  // ---- fishing pole + traffic light
  const light = pivot(58, 28, { name: 'lightSwing' }, [
    shape({}, svg('M58 28 L58 62'), null, { color: OUT, width: 2 }),
    blob({}, rect(36, 58, 44, 114, 12), linear(36, 0, 80, 0, [[0, '#5a5468'], [0.5, '#3a3546'], [1, '#221e2a']]), 3),
    shape({}, rect(40, 62, 6, 100, 3), alpha('#ffffff', 0.15)),
    lamp(1, 84), lamp(2, 115), lamp(3, 146),
    blob({}, rect(50, 52, 16, 8, 3), '#7a7284', 2),
  ]);
  const pole = node({ name: 'poleGroup' }, [
    shape({}, svg('M152 196 C140 120 96 40 56 26'), null, [{ color: OUT, width: 8, cap: 'round' }, { color: '#a0682e', width: 4, cap: 'round' }]),
    blob({}, circle(56, 27, 3.5), '#c8c0d0', 2),
    light,
  ]);

  // ---- checkered flag (finish)
  const flagGroup = node({ name: 'flagGroup', opacity: 0 }, [
    pivot(152, 194, { name: 'flagSwing' }, [
      node({ x: 152, y: 112 }, [checkeredFlag('fin', 48, 34, 84, { cols: 6, rows: 4, wave: 5 })]),
    ]),
  ]);

  // ---- the turtle
  const turtle = node({ name: 'turtle' }, [
    // shell
    blob({}, ellipse(112, 204, 38, 28), linear(0, 176, 0, 232, [[0, '#7be86a'], [0.5, '#2fae3c'], [1, '#167a24']]), 3),
    blob({}, svg('M76 210 C86 226 138 226 148 210 L150 216 C138 236 86 236 74 216 Z'), '#ffffff', 2),
    // body
    blob({}, ellipse(114, 206, 24, 24), linear(0, 182, 0, 230, [[0, '#fff4c0'], [1, '#f0d070']]), 3),
    // head
    blob({}, circle(112, 148, 31), radial(102, 136, 40, [[0, lighten(SKIN, 0.3)], [1, darken(SKIN, 0.12)]]), 3),
    // snout + smile
    blob({}, ellipse(114, 166, 17, 11), radial(110, 160, 18, [[0, lighten(SKIN, 0.35)], [1, SKIN]]), 2.5),
    blob({}, svg('M102 166 C106 176 122 176 126 166 C118 169 110 169 102 166 Z'), '#9e1a2a', 2),
    shape({}, [ellipse(86, 160, 5, 3), ellipse(138, 160, 5, 3)], alpha('#ff7a7a', 0.45)),
    // goggles strap
    shape({}, svg('M82 136 C96 128 128 128 142 136'), null, [{ color: OUT, width: 8 }, { color: '#4a4458', width: 4.5 }]),
    // lenses + eyes
    blob({}, [circle(99, 140, 12.5), circle(125, 140, 12.5)], '#9a92a8', 3),
    shape({}, [circle(99, 140, 9), circle(125, 140, 9)], radial(96, 136, 12, [[0, '#e8fbff'], [1, '#8fd8ff']]), ol(2)),
    pivot(100, 141, { name: 'eyeL' }, [blob({}, ellipse(100, 141, 3, 5), OUT, 0)]),
    pivot(124, 141, { name: 'eyeR' }, [blob({}, ellipse(124, 141, 3, 5), OUT, 0)]),
    shine([ellipse(95, 135, 3, 2), ellipse(121, 135, 3, 2)], 0.9),
    blob({}, rect(108, 137, 8, 5, 2), '#9a92a8', 2),
    // little tuft
    blob({}, svg('M108 118 C106 110 112 106 114 112 C116 106 122 108 118 118 Z'), '#ffb02e', 2),
  ]);
  const arm = node({ name: 'arm' }, [
    shape({}, svg('M132 200 C140 200 146 198 150 194'), null, [{ color: OUT, width: 10, cap: 'round' }, { color: SKIN, width: 5, cap: 'round' }]),
    blob({}, circle(152, 194, 7.5), SKIN, 3),
  ]);

  ab.add(
    shape({ name: 'groundShadow', x: 110, y: 292 }, ellipse(0, 0, 60, 6), alpha(OUT, 0.18)),
    pivot(110, 200, { name: 'root' }, [pole, turtle, cloud(112, 250), arm, flagGroup]),
  );

  // ---- animations
  const D = 180;
  const blink = (n) => track(n, 'scaleY', [[0, 1, 'hold'], [D - 24, 1], [D - 20, 0.1], [D - 16, 1, 'hold'], [D, 1, 'hold']]);
  ab.animation('float', { duration: D, loop: 'loop' }, [
    track('root', 'y', sineKeys(200, -5, D, D, 0, 5)),
    track('root', 'rotation', sineKeys(0, 1.5, D, D, 0.25, 6)),
    track('lightSwing', 'rotation', sineKeys(0, 4, D / 2, D, 0.1, 5)),
    track('groundShadow', 'scaleX', sineKeys(1, 0.06, D, D, 0.5, 6)),
    blink('eyeL'), blink('eyeR'),
    track('cloud', 'scaleY', [[0, 1]], 'hold'),
  ]);
  const lampState = (k) => {
    const tr = [];
    for (let i = 1; i <= 3; i++) {
      const on = k === 3 ? true : i <= k;
      const col = k === 3 ? GREEN : RED;
      tr.push(track('lamp' + i, 'color', [[0, on ? col : LAMP_OFF]], 'hold'));
      tr.push(track('glowFill' + i, 'color', [[0, alpha(on ? col : RED, 0.45)]], 'hold'));
      tr.push(track('glow' + i, 'opacity', [[0, on ? 1 : 0]], 'hold'));
    }
    return tr;
  };
  for (let k = 0; k <= 3; k++) ab.animation('stage' + k, { duration: 1, loop: 'oneShot' }, lampState(k));
  ab.animation('noFlag', { duration: 1, loop: 'oneShot' }, [
    track('poleGroup', 'opacity', [[0, 1]], 'hold'),
    track('flagGroup', 'opacity', [[0, 0]], 'hold'),
    track('flagSwing', 'rotation', [[0, 0]], 'hold'),
  ]);
  const F = 40;
  ab.animation('flagWave', { duration: F, loop: 'loop' }, [
    track('poleGroup', 'opacity', [[0, 0]], 'hold'),
    track('flagGroup', 'opacity', [[0, 1]], 'hold'),
    track('flagSwing', 'rotation', [[0, -30], [F / 2, 6], [F, -30]]),
    track('finCloth', 'scaleX', sineKeys(1, 0.08, F / 2, F, 0, 4)),
  ]);

  ab.stateMachine('Main', {
    inputs: { stage: { type: 'number', value: 0 }, flag: { type: 'bool', value: false } },
    layers: [
      { name: 'float', states: { float: { anim: 'float' } } },
      {
        name: 'lights', entry: 's0',
        states: { s0: { anim: 'stage0' }, s1: { anim: 'stage1' }, s2: { anim: 'stage2' }, s3: { anim: 'stage3' } },
        any: [
          { to: 's0', when: [['stage', '<', 0.5]] },
          { to: 's1', when: [['stage', '>=', 0.5], ['stage', '<', 1.5]] },
          { to: 's2', when: [['stage', '>=', 1.5], ['stage', '<', 2.5]] },
          { to: 's3', when: [['stage', '>=', 2.5]] },
        ],
      },
      {
        name: 'flag', entry: 'off',
        states: { off: { anim: 'noFlag' }, on: { anim: 'flagWave' } },
        transitions: [
          { from: 'off', to: 'on', when: [['flag', true]], duration: 150 },
          { from: 'on', to: 'off', when: [['flag', false]], duration: 150 },
        ],
      },
    ],
  });
}
