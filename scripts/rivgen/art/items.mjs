import { shape, node, pivot, rect, rectC, ellipse, circle, poly, svg, linear, radial, OUT, ol, alpha, lighten, darken, sineKeys, track, starPts, blob, shine } from './common.mjs';

const W = 2.5; // outline width at 64px

function itemBoard(file, id, content, extraTracks = [], { dur = 120, pulse = 0.05 } = {}) {
  const ab = file.artboard('Item_' + id, 64, 64);
  ab.add(
    // soft ground shadow
    shape({ name: 'shadow', x: 32, y: 58 }, ellipse(0, 0, 16, 3.5), alpha(OUT, 0.25)),
    node({ name: 'root', x: 32, y: 34 }, [content]),
  );
  const tracks = [
    track('root', 'scaleX', sineKeys(1, pulse, dur / 2, dur, 0, 5)),
    track('root', 'scaleY', sineKeys(1, pulse, dur / 2, dur, 0, 5)),
    track('root', 'y', sineKeys(34, -1.5, dur, dur, 0, 5)),
    track('shadow', 'scaleX', sineKeys(1, 0.08, dur, dur, 0.5, 5)),
    ...extraTracks,
  ];
  ab.animation('idle', { duration: dur, loop: 'loop' }, tracks);
  ab.stateMachine('Main', { layers: [{ name: 'idle', states: { idle: { anim: 'idle' } } }] });
  return ab;
}

function mushroom(file) {
  const cap = svg('M-25 5 C-27 -14 -14 -26 0 -26 C14 -26 27 -14 25 5 C16 9 -16 9 -25 5 Z');
  const art = node({}, [
    // stem
    blob({}, svg('M-13 4 C-15 14 -12 24 0 24 C12 24 15 14 13 4 Z'), linear(0, 4, 0, 24, [[0, '#fff6e0'], [1, '#e8cfa0']]), W),
    blob({}, ellipse(-5, 13, 2.4, 4.2), OUT, 0),
    blob({}, ellipse(5, 13, 2.4, 4.2), OUT, 0),
    shine([ellipse(-5.6, 11.5, 0.9, 1.4), ellipse(4.4, 11.5, 0.9, 1.4)], 0.95),
    // cap
    blob({}, cap, linear(0, -26, 0, 8, [[0, '#ff6a4d'], [0.6, '#e52521'], [1, '#b0150f']]), W),
    shape({}, [circle(0, -15, 5.5), ellipse(-16, -4, 4, 5), ellipse(16, -4, 4, 5)], '#ffffff', ol(2)),
    shine([ellipse(-11, -17, 4, 2.5)], 0.6, { rotation: -35 }),
  ]);
  itemBoard(file, 'mushroom', art);
}

function banana(file) {
  const body = svg('M-18 -16 C-24 4 -10 22 14 20 C20 19 24 15 24 13 C10 16 -6 8 -10 -16 Z');
  const art = node({ name: 'bananaWob', rotation: -10 }, [
    blob({}, body, linear(-20, -10, 20, 20, [[0, '#fff36b'], [0.6, '#ffd21f'], [1, '#e6a400']]), W),
    shape({}, svg('M-13 -12 C-14 4 -4 14 12 16 C-2 11 -9 2 -10 -12 Z'), alpha('#ffffff', 0.45)),
    shape({}, svg('M-4 6 C2 13 12 16 22 14 C12 18 0 16 -4 6 Z'), alpha('#b07000', 0.5)),
    blob({}, poly([[-19, -15], [-16, -24], [-11, -22], [-10, -15]], true, 1), '#6b4a1e', 2),
    blob({}, ellipse(24, 13, 2.5, 2.5), '#4a3010', 2),
  ]);
  itemBoard(file, 'banana', art, [track('bananaWob', 'rotation', sineKeys(-10, 6, 120, 120, 0, 5))]);
}

function shell(file, id, base, light, dark) {
  const dome = svg('M-24 8 C-24 -14 -12 -24 0 -24 C12 -24 24 -14 24 8 Z');
  const art = node({ name: id + 'Spin' }, [
    // white rim (bottom)
    blob({}, svg('M-26 6 C-26 0 26 0 26 6 L 26 12 C26 20 -26 20 -26 12 Z'), linear(0, 2, 0, 18, [[0, '#ffffff'], [1, '#c9c2d6']]), W),
    // dome
    blob({}, dome, linear(0, -24, 0, 8, [[0, light], [0.5, base], [1, dark]]), W),
    // plates
    shape({}, [poly([[-7, -18], [7, -18], [11, -6], [0, 2], [-11, -6]], true, 2)], lighten(base, 0.25), ol(2, darken(dark, 0.3))),
    shape({}, [svg('M-11 -6 L-21 -2 M11 -6 L21 -2 M0 2 L0 7 M-7 -18 L-12 -21 M7 -18 L12 -21')], null, ol(2, darken(dark, 0.3))),
    shine([ellipse(-10, -15, 5, 2.5)], 0.6, { rotation: -30 }),
    shine([ellipse(-18, 10, 3, 1.5)], 0.8),
  ]);
  itemBoard(file, id, art, [
    track(id + 'Spin', 'rotation', sineKeys(0, 5, 60, 120, 0, 5)),
  ]);
}

function star(file) {
  const pts = starPts(0, 0, 27, 12, 5, -90, 3.5);
  const art = node({ name: 'starSpin' }, [
    shape({ name: 'starBody' }, poly(pts), { type: 'solid', color: '#ffd400', name: 'starFill' }, ol(W)),
    shape({ scale: 0.62, y: -2 }, poly(starPts(0, 0, 27, 12, 5, -90, 3)), alpha('#ffffff', 0.35)),
    blob({}, [ellipse(-5, -1, 2.6, 5.5), ellipse(5, -1, 2.6, 5.5)], OUT, 0),
    shine([ellipse(-5.6, -3, 0.9, 1.6), ellipse(4.4, -3, 0.9, 1.6)], 1),
  ]);
  itemBoard(file, 'star', art, [
    track('starSpin', 'rotation', sineKeys(0, 8, 60, 120, 0, 5)),
    track('starFill', 'color', [[0, '#ffd400'], [30, '#ffb000'], [60, '#fff27a'], [90, '#ffb000'], [120, '#ffd400']]),
  ], { pulse: 0.07 });
}

function lightning(file) {
  const bolt = poly([[6, -28], [-16, 4], [-2, 4], [-8, 28], [16, -6], [2, -6], [10, -28]], true, 1.5);
  const art = node({ rotation: 8 }, [
    shape({ name: 'glow' }, circle(0, 0, 26), radial(0, 0, 26, [[0, alpha('#fff58a', 0.9)], [1, alpha('#fff58a', 0)]])),
    blob({}, bolt, linear(0, -28, 0, 28, [[0, '#fffbd0'], [0.5, '#ffe14a'], [1, '#f0a800']]), W),
    shape({ scale: 0.5, x: 1 }, poly([[6, -28], [-16, 4], [-2, 4], [-8, 28], [16, -6], [2, -6], [10, -28]], true, 1), alpha('#ffffff', 0.55)),
  ]);
  itemBoard(file, 'lightning', art, [
    track('glow', 'opacity', [[0, 0.2], [8, 1, 'linear'], [16, 0.3], [24, 0.9, 'linear'], [32, 0.2], [120, 0.2]]),
  ]);
}

function coin(file) {
  const art = node({ name: 'coinSpin' }, [
    blob({}, ellipse(0, 0, 18, 25), linear(-18, -25, 18, 25, [[0, '#fff09a'], [0.5, '#ffc61a'], [1, '#d48a00']]), W),
    shape({}, ellipse(0, 0, 12.5, 19), null, ol(2, '#b87400')),
    blob({}, rectC(0, 0, 6, 22, 3), linear(0, -11, 0, 11, [[0, '#fff7c0'], [1, '#e8a800']]), 2),
    shine([ellipse(-9, -12, 3, 6)], 0.6, { rotation: 20 }),
  ]);
  itemBoard(file, 'coin', art, [
    track('coinSpin', 'scaleX', [[0, 1], [30, 0.12], [60, -1], [90, 0.12], [120, 1]], 'ease'),
  ], { pulse: 0.0 });
}

function feather(file) {
  const vane = svg('M-2 26 C-14 12 -16 -6 -6 -20 C-2 -26 6 -28 10 -26 C16 -14 16 4 4 18 C2 21 0 24 -2 26 Z');
  const art = node({ name: 'featherSway', rotation: 18 }, [
    blob({}, vane, linear(-10, -20, 12, 20, [[0, '#ffffff'], [0.7, '#eef4ff'], [1, '#b9c9ea']]), W),
    shape({}, svg('M-12 4 L-4 2 M-12 -6 L-3 -6 M-8 -16 L-2 -12 M12 -6 L4 -4 M10 6 L2 6'), null, ol(1.5, '#a9b7da')),
    shape({}, svg('M-3 30 C-2 14 0 -4 8 -24'), null, { color: '#7d8fbf', width: 2.5, cap: 'round' }),
    shine([ellipse(-7, -10, 2, 6)], 0.9, { rotation: 20 }),
  ]);
  itemBoard(file, 'feather', art, [
    track('featherSway', 'rotation', sineKeys(18, 10, 120, 120, 0, 5)),
    track('featherSway', 'x', sineKeys(0, 3, 120, 120, 0.25, 5)),
  ]);
}

export function buildItems(file) {
  mushroom(file);
  banana(file);
  shell(file, 'greenShell', '#2fae3c', '#7be86a', '#167a24');
  shell(file, 'redShell', '#e52521', '#ff7a5c', '#9e120d');
  star(file);
  lightning(file);
  coin(file);
  feather(file);
}

// ---------------------------------------------------------------- Item box
export function buildItemBox(file) {
  const ab = file.artboard('ItemBox', 64, 64);
  const s = 34; // cube front size
  const fx = 32 - s / 2 - 3, fy = 32 - s / 2 + 4; const d = 8;
  const front = poly([[fx, fy], [fx + s, fy], [fx + s, fy + s], [fx, fy + s]], true, 3);
  const top = poly([[fx, fy], [fx + d, fy - d], [fx + s + d, fy - d], [fx + s, fy]], true, 2);
  const side = poly([[fx + s, fy], [fx + s + d, fy - d], [fx + s + d, fy + s - d], [fx + s, fy + s]], true, 2);
  const rainbow = ['#ff4b6e', '#ffb02e', '#ffe94a', '#5ee05a', '#3fc8ff', '#8a6bff', '#ff4b6e'];
  const shifted = (off, dim) => {
    const keys = [];
    for (let i = 0; i <= 6; i++) {
      const c = rainbow[(i + off) % 6];
      keys.push([i * 20, alpha(dim ? darken(c, dim) : lighten(c, 0.2), 0.9), 'linear']);
    }
    return keys;
  };
  const q = svg('M-7 -6 C-7 -13 7 -13 7 -6 C7 -1 1 0 1 4 L1 6 L-3 6 L-3 3 C-3 -2 3 -3 3 -6 C3 -9 -3 -9 -3 -6 Z');
  const box = node({}, [
    shape({}, [front], { type: 'solid', color: alpha('#ff4b6e', 0.8), name: 'faceF' }, ol(W)),
    shape({}, [top], { type: 'solid', color: alpha('#ffe94a', 0.8), name: 'faceT' }, ol(W)),
    shape({}, [side], { type: 'solid', color: alpha('#3fc8ff', 0.8), name: 'faceS' }, ol(W)),
    // glassy inner shine
    shape({}, [poly([[fx + 3, fy + 3], [fx + 13, fy + 3], [fx + 3, fy + 13]], true, 2)], alpha('#ffffff', 0.6)),
    shape({}, [rect(fx + s - 7, fy + s - 9, 3, 5, 1.5)], alpha('#ffffff', 0.5)),
    // ? mark
    pivot(fx + s / 2, fy + s / 2, { name: 'qmark' }, [
      node({ x: fx + s / 2 + 1, y: fy + s / 2 - 1, scale: 1.12 }, [
        shape({ x: 1, y: 1.5 }, [q, circle(-1, 10, 2.2)], alpha(OUT, 0.6)),
        shape({}, [q, circle(-1, 10, 2.2)], '#ffffff', ol(1.6)),
      ]),
    ]),
  ]);
  ab.add(
    shape({ name: 'shadow', x: 34, y: 59 }, ellipse(0, 0, 18, 3.5), alpha(OUT, 0.25)),
    pivot(32, 32, { name: 'boxRoot' }, [box]),
  );
  ab.animation('idle', { duration: 120, loop: 'loop' }, [
    track('faceF', 'color', shifted(0)),
    track('faceT', 'color', shifted(2)),
    track('faceS', 'color', shifted(4, 0.25)),
    track('boxRoot', 'y', sineKeys(30, -2, 120, 120, 0, 5)),
    track('boxRoot', 'rotation', sineKeys(0, 3, 120, 120, 0.25, 5)),
    track('qmark', 'scaleX', sineKeys(1, 0.08, 60, 120, 0, 5)),
    track('qmark', 'scaleY', sineKeys(1, 0.08, 60, 120, 0, 5)),
    track('shadow', 'scaleX', sineKeys(1, 0.08, 120, 120, 0.5, 5)),
  ]);
  ab.stateMachine('Main', { layers: [{ name: 'idle', states: { idle: { anim: 'idle' } } }] });
}
