// Trophy cup with gold / silver / bronze palettes selected by number input "rank".
import { shape, node, pivot, rect, rectC, ellipse, circle, poly, svg, linear, OUT, ol, alpha, sineKeys, track, blob, shine, starPts } from './common.mjs';

const PAL = {
  1: { base: '#ffc61a', light: '#fff09a', dark: '#c98a00', deep: '#8a5a00' },
  2: { base: '#c9d1dc', light: '#ffffff', dark: '#8a94a3', deep: '#5a6270' },
  3: { base: '#d4823a', light: '#ffc08a', dark: '#9a5420', deep: '#6a3410' },
};

export function buildTrophy(file) {
  const ab = file.artboard('Trophy', 128, 160);
  const P = PAL[1];
  const cupPath = () => svg('M26 30 L102 30 C102 70 88 96 64 98 C40 96 26 70 26 30 Z');
  const sol = (c, name) => ({ type: 'solid', color: c, name });

  const cup = node({ name: 'cup' }, [
    // handles (outline under, metal over)
    shape({}, [svg('M30 40 C6 38 6 74 38 78'), svg('M98 40 C122 38 122 74 90 78')], null, [{ color: OUT, width: 11 }, { ...sol(P.dark, 'handleFill'), color: P.dark, width: 6, name: 'handleFill' }]),
    shape({}, [svg('M28 42 C12 42 12 62 24 70'), svg('M100 42 C116 42 116 62 104 70')], null, { color: P.light, width: 2, name: 'handleHi' }),
    // stem + knot
    blob({}, svg('M56 96 L72 96 L70 112 L80 124 L48 124 L58 112 Z'), sol(P.dark, 'stemFill'), 3),
    blob({}, ellipse(64, 108, 10, 4.5), sol(P.base, 'knotFill'), 2.5),
    // bowl
    shape({ name: 'bowl' }, cupPath(), sol(P.base, 'bowlFill'), ol(3)),
    node({ name: 'bowlClip', clip: 'bowl' }, [
      shape({}, svg('M78 28 L104 28 C104 70 90 98 64 100 L64 96 C82 88 82 50 78 28 Z'), sol(P.dark, 'bowlShade')),
      shape({}, rect(34, 28, 9, 80, 4), sol(P.light, 'bowlHi')),
      shape({ name: 'shineBar', x: -40, rotation: 25 }, rect(-6, -10, 12, 140), alpha('#ffffff', 0.6)),
    ]),
    shape({}, cupPath(), null, ol(3)),
    // rim
    blob({}, ellipse(64, 30, 40, 7), sol(P.light, 'rimFill'), 3),
    blob({}, ellipse(64, 30, 33, 4.2), sol(P.deep, 'innerFill'), 2),
    // star emblem
    blob({ name: 'emblem' }, poly(starPts(64, 58, 13, 5.5, 5, -90, 1.5)), sol(P.light, 'starFill'), 2.5),
    // base
    blob({}, rect(38, 122, 52, 10, 3), sol(P.base, 'plateFill'), 3),
    blob({}, svg('M32 132 L96 132 L100 152 L28 152 Z'), linear(0, 132, 0, 152, [[0, '#6a3a24'], [1, '#3a1e12']]), 3),
    blob({}, rect(48, 137, 32, 9, 2), sol(P.light, 'tagFill'), 2),
  ]);
  const sparkles = [[20, 22, 0], [108, 18, 40], [112, 92, 80], [16, 100, 110]].map(([x, y], i) =>
    shape({ name: 'tw' + i, x, y, scale: 0 }, poly(starPts(0, 0, 7, 2.2, 4, -90, 0.5)), '#ffffff', ol(1.5)));

  ab.add(
    shape({ name: 'shadow', x: 64, y: 154 }, ellipse(0, 0, 40, 4), alpha(OUT, 0.25)),
    pivot(64, 152, { name: 'root' }, [cup]),
    ...sparkles,
  );

  // idle loop: shine sweep, twinkles, gentle bob
  const D = 150;
  const tw = (i, t0) => [
    track('tw' + i, 'scaleX', [[0, 0, 'hold'], [t0, 0], [t0 + 10, 1.1], [t0 + 22, 0, 'hold'], [D, 0, 'hold']]),
    track('tw' + i, 'scaleY', [[0, 0, 'hold'], [t0, 0], [t0 + 10, 1.1], [t0 + 22, 0, 'hold'], [D, 0, 'hold']]),
  ];
  ab.animation('idle', { duration: D, loop: 'loop' }, [
    track('root', 'y', sineKeys(152, -2, D, D, 0, 5)),
    track('shineBar', 'x', [[0, -40, 'hold'], [60, -40, 'easeIn'], [96, 150, 'hold'], [D, 150, 'hold']]),
    track('emblem', 'rotation', [[0, 0]], 'hold'),
    ...tw(0, 10), ...tw(1, 50), ...tw(2, 90), ...tw(3, 120),
  ]);
  const paint = (r) => {
    const p = PAL[r];
    const c = (n, v) => track(n, 'color', [[0, v]], 'hold');
    return [
      c('handleFill', p.dark), c('handleHi', p.light), c('stemFill', p.dark), c('knotFill', p.base),
      c('bowlFill', p.base), c('bowlShade', p.dark), c('bowlHi', p.light), c('rimFill', p.light),
      c('innerFill', p.deep), c('starFill', p.light), c('plateFill', p.base), c('tagFill', p.light),
    ];
  };
  for (const r of [1, 2, 3]) ab.animation('rank' + r, { duration: 1, loop: 'oneShot' }, paint(r));

  ab.stateMachine('Main', {
    inputs: { rank: { type: 'number', value: 1 } },
    layers: [
      { name: 'idle', states: { idle: { anim: 'idle' } } },
      {
        name: 'rank', entry: 'gold',
        states: { gold: { anim: 'rank1' }, silver: { anim: 'rank2' }, bronze: { anim: 'rank3' } },
        any: [
          { to: 'gold', when: [['rank', '<', 1.5]] },
          { to: 'silver', when: [['rank', '>=', 1.5], ['rank', '<', 2.5]] },
          { to: 'bronze', when: [['rank', '>=', 2.5]] },
        ],
      },
    ],
  });
}
