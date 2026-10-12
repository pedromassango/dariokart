import { shape, node, pivot, rect, ellipse, poly, svg, linear, OUT, ol, alpha, lighten, darken, sineKeys, track, checkeredFlag } from './common.mjs';

// Blocky rounded letterforms, 100 units tall. evenOdd fill for counters.
export const LETTERS = {
  D: { w: 66, paths: () => svg('M0 0 H32 C56 0 66 20 66 50 C66 80 56 100 32 100 H0 Z M22 21 H30 C40 21 44 32 44 50 C44 68 40 79 30 79 H22 Z') },
  A: { w: 72, paths: () => [poly([[22, 0], [50, 0], [72, 100], [49, 100], [45, 82], [27, 82], [23, 100], [0, 100]], true, 4), poly([[31, 63], [41, 63], [36, 37]])] },
  R: { w: 66, paths: () => svg('M0 0 H36 C56 0 64 12 64 30 C64 44 58 53 48 57 L66 100 H43 L28 62 H22 V100 H0 Z M22 19 H34 C40 19 43 23 43 31 C43 39 40 43 34 43 H22 Z') },
  I: { w: 24, paths: () => [rect(0, 0, 24, 100, 4)] },
  O: { w: 70, paths: () => svg('M35 0 A35 50 0 1 1 35 100 A35 50 0 1 1 35 0 Z M35 21 A13 29 0 1 0 35 79 A13 29 0 1 0 35 21 Z') },
  K: { w: 68, paths: () => [poly([[0, 0], [22, 0], [22, 38], [44, 0], [68, 0], [40, 46], [68, 100], [44, 100], [22, 62], [22, 100], [0, 100]], true, 3)] },
  T: { w: 64, paths: () => [poly([[0, 0], [64, 0], [64, 22], [43, 22], [43, 100], [21, 100], [21, 22], [0, 22]], true, 3)] },
};

export function buildLogo(file) {
  const ab = file.artboard('Logo', 640, 240);
  const word = 'DARIOKART';
  const gap = 5, wordGap = 14;
  let total = 0;
  for (let i = 0; i < word.length; i++) total += LETTERS[word[i]].w + (i ? (i === 5 ? wordGap : gap) : 0);
  let x = (640 - total) / 2;
  const letters = [];
  const tracks = [];
  const DUR = 240;
  for (let i = 0; i < word.length; i++) {
    const ch = word[i]; const L = LETTERS[ch]; const dario = i < 5;
    if (i) x += i === 5 ? wordGap : gap;
    const cx = x + L.w / 2; const u = (cx - 320) / 300;
    const top = 44 + 26 * u * u;
    const tilt = u * 9 + (dario ? -2 : 2);
    const face = dario
      ? linear(0, 0, 0, 100, [[0, '#ff7a5c'], [0.45, '#e52521'], [1, '#9e120d']])
      : linear(0, 0, 0, 100, [[0, '#fff59a'], [0.45, '#ffd23f'], [1, '#e89400']]);
    const rim = dario ? '#ffd23f' : '#2a6fe0';
    const shadowCol = dario ? '#7a0d0a' : '#123a8a';
    const fill = (f) => ({ type: f.type, ...f, evenOdd: true });
    const solidEO = (c) => ({ type: 'solid', color: c, evenOdd: true });
    const letter = pivot(L.w / 2, 50, { name: 'L' + i, x: cx - L.w / 2, y: top, rotation: tilt }, [
      // drop shadow
      shape({ x: 5, y: 8 }, L.paths(), solidEO(OUT), { color: OUT, width: 16 }),
      // rim (colored outline band + dark edge)
      shape({}, L.paths(), solidEO(shadowCol), [{ color: OUT, width: 17 }, { color: rim, width: 11 }, { color: darken(rim, 0.25), width: 3 }]),
      // face
      shape({ name: 'face' + i }, L.paths(), fill(face), ol(2.5)),
      // shine bar, clipped to face
      node({ name: 'shineClip' + i, clip: 'face' + i, clipEvenOdd: true }, [
        shape({ name: 'bar' + i, x: -50, rotation: 20 }, [rect(-9, -40, 18, 180)], alpha('#ffffff', 0.55)),
        shape({ name: 'bar2' + i, x: -50 + 0, rotation: 20 }, [rect(12, -40, 5, 180)], alpha('#ffffff', 0.35)),
      ]),
      // top gloss
      shape({ opacity: 0.6, rotation: -15, x: Math.min(14, L.w * 0.25), y: 13 }, [ellipse(0, 0, 4, 7)], '#ffffff'),
    ]);
    letters.push(letter);
    // bob wave: 2s period, phase shifted per letter
    tracks.push(track('L' + i, 'y', sineKeys(top + 50, 5, 120, DUR, -i * 0.09, 4)));
    tracks.push(track('L' + i, 'rotation', sineKeys(tilt, 1.6, 120, DUR, -i * 0.09 + 0.25, 6)));
    // shine sweep: letter i sweeps at frames 150+i*5 .. +36
    const s0 = 150 + i * 5;
    for (const b of ['bar', 'bar2']) tracks.push(track(b + i, 'x', [[0, -50, 'hold'], [s0, -50], [s0 + 36, L.w + 60, 'hold'], [DUR, L.w + 60, 'hold']], 'easeIn'));
    x += L.w;
  }

  // checkered ribbon under the word
  const ribbon = [];
  const rx0 = 120, rx1 = 520, ry = 192, rh = 26, cols = 26;
  const wy = (xx) => ry + 6 * Math.sin(((xx - rx0) / (rx1 - rx0)) * Math.PI * 2);
  const top = [], bot = [];
  for (let i = 0; i <= cols; i++) { const xx = rx0 + ((rx1 - rx0) * i) / cols; top.push([xx, wy(xx)]); bot.push([xx, wy(xx) + rh]); }
  const outline = poly([...top, ...bot.reverse()]);
  bot.reverse();
  const checks = [];
  for (let i = 0; i < cols; i++) for (let j = 0; j < 2; j++) if ((i + j) % 2 === 0) {
    const a = top[i], b = top[i + 1];
    const y0a = a[1] + (j * rh) / 2, y0b = b[1] + (j * rh) / 2;
    checks.push(poly([[a[0], y0a], [b[0], y0b], [b[0], y0b + rh / 2], [a[0], y0a + rh / 2]]));
  }
  const ribbonNode = node({ name: 'ribbon' }, [
    shape({ x: 3, y: 5 }, [outline], OUT, { color: OUT, width: 4 }),
    shape({}, [outline], '#ffffff'),
    shape({}, checks, OUT),
    shape({}, [outline], null, ol(3)),
  ]);

  const flagL = node({ name: 'flagL', x: 92, y: 168, rotation: -28 }, [node({ x: 0, y: 0, scaleX: -1 }, [checkeredFlag('fL', 46, 32, 62)])]);
  const flagR = node({ name: 'flagR', x: 548, y: 168, rotation: 28 }, [checkeredFlag('fR', 46, 32, 62)]);
  tracks.push(track('flagL', 'rotation', sineKeys(-28, 7, 80, DUR, 0, 5)));
  tracks.push(track('flagR', 'rotation', sineKeys(28, -7, 80, DUR, 0.1, 5)));
  tracks.push(track('fLCloth', 'scaleY', sineKeys(1, 0.06, 40, DUR, 0, 5)));
  tracks.push(track('fRCloth', 'scaleY', sineKeys(1, 0.06, 40, DUR, 0.2, 5)));

  // twinkle sparkles
  const sparkles = [];
  const sp = [[40, 40, 0], [600, 36, 70], [300, 18, 140], [470, 180, 40], [180, 182, 110]];
  sp.forEach(([sx, sy, t0], k) => {
    const n = 'spark' + k;
    sparkles.push(node({ name: n, x: sx, y: sy, scale: 0 }, [
      shape({}, [poly([[0, -12], [3, -3], [12, 0], [3, 3], [0, 12], [-3, 3], [-12, 0], [-3, -3]], true, 1)], '#ffffff', ol(2)),
    ]));
    tracks.push(track(n, 'scaleX', [[0, 0, 'hold'], [t0, 0], [t0 + 12, 1.1], [t0 + 26, 0, 'hold'], [DUR, 0, 'hold']]));
    tracks.push(track(n, 'scaleY', [[0, 0, 'hold'], [t0, 0], [t0 + 12, 1.1], [t0 + 26, 0, 'hold'], [DUR, 0, 'hold']]));
    tracks.push(track(n, 'rotation', [[0, 0, 'hold'], [t0, 0], [t0 + 26, 90, 'hold'], [DUR, 90, 'hold']]));
  });

  ab.add(flagL, flagR, ribbonNode, pivot(320, 96, { scale: 0.9, y: -4 }, letters), ...sparkles);
  ab.animation('idle', { duration: DUR, loop: 'loop' }, tracks);
  ab.stateMachine('Main', { layers: [{ name: 'idle', states: { idle: { anim: 'idle' } } }] });
}
