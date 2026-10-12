// Live textures for the world: TurnSign, Crowd.
import { shape, node, pivot, rect, rectC, ellipse, circle, poly, svg, linear, radial, OUT, ol, alpha, lighten, darken, mix, sineKeys, track, blob, shine } from './common.mjs';

// ---------------------------------------------------------------- TurnSign
export function buildTurnSign(file) {
  const ab = file.artboard('TurnSign', 256, 160);
  const chev = (cx) => poly([[cx - 24, 30], [cx + 2, 30], [cx + 30, 80], [cx + 2, 130], [cx - 24, 130], [cx + 4, 80]], true, 4);
  const DIM = '#9a6a10', LIT = '#ffe14a';
  const xs = [72, 128, 184];
  ab.add(
    shape({}, rect(0, 0, 256, 160), OUT),
    shape({}, rect(8, 8, 240, 144, 10), linear(0, 8, 0, 152, [[0, '#ff4a3a'], [0.55, '#d81818'], [1, '#8a0a0a']])),
    shape({}, rect(8, 8, 240, 144, 10), null, { color: '#ffffff', width: 4 }),
    shape({}, rect(16, 16, 224, 22, 8), alpha('#ffffff', 0.18)),
    pivot(128, 80, { name: 'arrows' }, xs.map((x, i) => node({}, [
      shape({ x: 3, y: 4 }, chev(x), alpha('#3a0404', 0.6)),
      shape({}, chev(x), { type: 'solid', color: DIM, name: 'chev' + i }, { color: OUT, width: 5 }),
      shape({ name: 'glow' + i, opacity: 0 }, poly([[x - 18, 38], [x - 2, 38], [x + 20, 80], [x + 14, 80]], true, 2), alpha('#ffffff', 0.6)),
    ]))),
    shape({}, rect(2, 2, 252, 156, 12), null, { color: '#2a2030', width: 4 }),
  );
  // sequence: each chevron lights for 12 frames in turn (pointing direction = increasing x)
  const D = 60;
  const seq = (i) => {
    const t0 = i * 12;
    const k = (on, off) => (t0 === 0 ? [[0, on, 'hold'], [24, off, 'hold'], [D, off, 'hold']] : [[0, off, 'hold'], [t0, on, 'hold'], [t0 + 24, off, 'hold'], [D, off, 'hold']]);
    return [track('chev' + i, 'color', k(LIT, DIM)), track('glow' + i, 'opacity', k(1, 0))];
  };
  ab.animation('chase', { duration: D, loop: 'loop' }, [0, 1, 2].flatMap(seq));
  ab.animation('right', { duration: 1, loop: 'oneShot' }, [track('arrows', 'scaleX', [[0, 1]], 'hold')]);
  ab.animation('left', { duration: 1, loop: 'oneShot' }, [track('arrows', 'scaleX', [[0, -1]], 'hold')]);
  ab.stateMachine('Main', {
    inputs: { dir: { type: 'number', value: 1 } },
    layers: [
      { name: 'chase', states: { chase: { anim: 'chase' } } },
      {
        name: 'dir', entry: 'right', states: { right: { anim: 'right' }, left: { anim: 'left' } },
        any: [{ to: 'left', when: [['dir', '<', 0]] }, { to: 'right', when: [['dir', '>=', 0]] }],
      },
    ],
  });
}

// ---------------------------------------------------------------- Crowd
export function buildCrowd(file) {
  const ab = file.artboard('Crowd', 512, 128);
  const shirts = ['#e52521', '#2a6fe0', '#2fae3c', '#ffd23f', '#ff7fc4', '#8a6bff', '#f7a400', '#3fc8ff'];
  const caps = ['#e52521', '#2a6fe0', '#2fae3c', '#ffd23f', '#8a6bff', '#ff7fc4'];
  const skins = ['#ffd9b8', '#ffc896', '#e8a070', '#c07a4a', '#ffe0bd'];
  let k = 0;
  const people = []; const tracks = [];
  const D = 60;
  const person = (x, y, s, row) => {
    const i = k++;
    const sh = shirts[(i * 3) % shirts.length], cp = caps[(i * 5) % caps.length], sk = skins[(i * 7) % skins.length];
    const n = 'p' + i;
    const arm = (side) => pivot(x + side * 12 * s, y + 18 * s, { name: n + (side < 0 ? 'aL' : 'aR'), rotation: side * 30 }, [
      shape({}, svg(`M${x + side * 12 * s} ${y + 18 * s} L${x + side * 12 * s} ${y - 6 * s}`), null, [{ color: OUT, width: 7 * s, cap: 'round' }, { color: sh, width: 4 * s, cap: 'round' }]),
      blob({}, circle(x + side * 12 * s, y - 7 * s, 4 * s), '#ffffff', 2),
    ]);
    const body = node({ name: n }, [
      arm(-1), arm(1),
      blob({}, rect(x - 13 * s, y + 10 * s, 26 * s, 40 * s, 10 * s), linear(0, y + 10 * s, 0, y + 50 * s, [[0, lighten(sh, 0.2)], [1, darken(sh, 0.2)]]), 2.5),
      blob({}, circle(x, y, 13 * s), sk, 2.5),
      // toad-like cap
      blob({}, svg(`M${x - 17 * s} ${y - 2 * s} C${x - 19 * s} ${y - 20 * s} ${x + 19 * s} ${y - 20 * s} ${x + 17 * s} ${y - 2 * s} C${x + 8 * s} ${y + 1 * s} ${x - 8 * s} ${y + 1 * s} ${x - 17 * s} ${y - 2 * s} Z`), '#ffffff', 2.5),
      shape({}, [circle(x, y - 11 * s, 4 * s), circle(x - 11 * s, y - 5 * s, 3 * s), circle(x + 11 * s, y - 5 * s, 3 * s)], cp),
      blob({}, [ellipse(x - 4.5 * s, y + 3 * s, 1.8 * s, 3 * s), ellipse(x + 4.5 * s, y + 3 * s, 1.8 * s, 3 * s)], OUT, 0),
      blob({}, svg(`M${x - 5 * s} ${y + 7 * s} C${x - 3 * s} ${y + 12 * s} ${x + 3 * s} ${y + 12 * s} ${x + 5 * s} ${y + 7 * s} Z`), '#9e1a2a', 1.5),
    ]);
    people.push(body);
    const ph = (x / 512) * 1.0 + row * 0.25;
    tracks.push(track(n, 'y', sineKeys(0, -4 * s, D / 2, D, -ph * 2, 3)));
    tracks.push(track(n + 'aL', 'rotation', sineKeys(-25, 25, D / 2, D, -ph * 2 + 0.25, 3)));
    tracks.push(track(n + 'aR', 'rotation', sineKeys(25, -25, D / 2, D, -ph * 2 + 0.25, 3)));
  };
  for (let i = 0; i < 13; i++) person(24 + i * 39, 46, 1.05, 0);
  const back = people.splice(0);
  for (let i = 0; i < 12; i++) person(42 + i * 39 + (i % 2) * 3, 84, 1.2, 1);
  const front = people.splice(0);
  const tiers = [];
  for (let i = 0; i < 4; i++) tiers.push(shape({}, rect(0, 22 + i * 26, 512, 13), alpha('#000000', 0.18)));
  ab.add(
    shape({}, rect(0, 0, 512, 128), linear(0, 0, 0, 128, [[0, '#4a5a8a'], [1, '#26305a']])),
    ...tiers,
    shape({}, [rect(0, 64, 512, 6), rect(0, 100, 512, 6)], '#8a96c0'),
    ...back,
    shape({}, rect(0, 70, 512, 4), alpha('#000000', 0.25)),
    ...front,
    // front rail
    shape({}, rect(0, 112, 512, 16), linear(0, 112, 0, 128, [[0, '#ffffff'], [1, '#b8c0dc']])),
    shape({}, [rect(0, 112, 512, 3), rect(0, 125, 512, 3)], OUT),
    shape({}, Array.from({ length: 16 }, (_, i) => rect(i * 32 + 14, 115, 4, 10)), '#e52521'),
  );
  ab.animation('cheer', { duration: D, loop: 'loop' }, tracks);
  ab.stateMachine('Main', { layers: [{ name: 'cheer', states: { cheer: { anim: 'cheer' } } }] });
}
